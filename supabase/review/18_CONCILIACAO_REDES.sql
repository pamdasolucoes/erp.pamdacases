alter table public.erp_billing_closings add column network_id uuid references public.erp_customer_networks(id);
create index on public.erp_billing_closings(network_id);
create or replace function public.pamda_relatorio_rede_clientes(p_rede_id uuid,p_inicio date,p_fim date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare n public.erp_customer_networks%rowtype; f boolean; result jsonb;
begin
 if not(public.pamda_has_permission('sales.read') or public.pamda_has_permission('customers.manage')) then raise exception 'Acesso negado' using errcode='42501';end if;
 if p_inicio is null or p_fim is null or p_fim<p_inicio or p_fim>p_inicio+interval '5 years' then raise exception 'Período inválido';end if;
 select * into n from public.erp_customer_networks where id=p_rede_id;if not found then raise exception 'Rede não encontrada';end if;
 f:=public.pamda_has_permission('finance.read');
 select coalesce(jsonb_agg(jsonb_build_object('customer_id',c.id,'customer_name',c.name,'branch_id',b.id,'branch_name',b.name,
 'legacy_customer_code',m.legacy_customer_code,'group_display_code',m.display_code,
 'billing_cycle',coalesce(bp.billing_cycle,cp.billing_cycle,n.default_cycle),
 'collection_mode',coalesce(bp.default_collection_mode,cp.default_collection_mode,n.default_collection_mode),
 'due_days',coalesce(bp.due_days,cp.due_days,n.default_due_days),
 'orders_started',t.started,'orders_confirmed_real',t.confirmed,'orders_confirmed_test',0,'orders_cancelled',t.cancelled,
 'purchases_real',case when f then t.total end,'purchases_test',null,'paid_real',case when f then t.paid end,'paid_test',null,'payments_integrated',true)
 order by m.unit_sequence,b.name),'[]') into result
 from public.erp_customer_network_members m join public.customers c on c.id=m.customer_id join public.customer_branches b on b.customer_id=c.id
 left join public.erp_customer_billing_policies cp on cp.customer_id=c.id left join public.erp_branch_billing_policies bp on bp.branch_id=b.id
 cross join lateral(select count(*) started,count(*) filter(where s.status='confirmed') confirmed,count(*) filter(where s.status='cancelled') cancelled,
 coalesce(sum(s.total) filter(where s.status='confirmed'),0) total,coalesce(sum(r.paid) filter(where s.status='confirmed'),0) paid
 from public.erp_sales s left join public.erp_receivables r on r.sale_id=s.id
 where not s.is_test and s.customer_id=c.id and s.branch_id=b.id
 and (coalesce(s.confirmed_at,s.created_at) at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim) t where m.network_id=n.id;
 return jsonb_build_object('network_id',n.id,'from',p_inicio,'to',p_fim,'payments_integrated',true,'financial_authorized',f,'units',result);
end $$;
create function public.pamda_network_closing(p_network_id uuid,p_start date,p_end date,p_mode text,p_customer_id uuid,p_branch_id uuid,p_request_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare n public.erp_customer_networks%rowtype; c record; v_id uuid; v_count integer:=0; v_sale_count integer:=0; v_key uuid;
begin
 perform pamda_private.require_permission('finance.manage');
 if p_request_key is null or p_start is null or p_end is null or p_end<p_start or p_mode not in ('individual','consolidado') then raise exception 'Informe período e modo válidos'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_key::text,0));
 if exists(select 1 from public.erp_operations_audit where action='network.closing' and entity_id=p_request_key) then return jsonb_build_object('confirmed',true);end if;
 select * into n from public.erp_customer_networks where id=p_network_id for update;if not found then raise exception 'Rede não encontrada';end if;
 if p_customer_id is not null and not exists(select 1 from public.erp_customer_network_members where network_id=n.id and customer_id=p_customer_id) then raise exception 'Loja não pertence à rede';end if;
 if p_branch_id is not null and not exists(select 1 from public.customer_branches b join public.erp_customer_network_members m on m.customer_id=b.customer_id where b.id=p_branch_id and m.network_id=n.id and (p_customer_id is null or b.customer_id=p_customer_id)) then raise exception 'Unidade fora do filtro';end if;
 perform 1 from public.customers where id in(select customer_id from public.erp_customer_network_members where network_id=n.id) order by id for update;
 for c in select distinct s.customer_id from public.erp_sales s join public.erp_receivables r on r.sale_id=s.id join public.erp_customer_network_members m on m.customer_id=s.customer_id
 where m.network_id=n.id and not s.is_test and s.status='confirmed' and r.total>r.paid
 and (p_customer_id is null or s.customer_id=p_customer_id) and (p_branch_id is null or s.branch_id=p_branch_id)
 and (s.confirmed_at at time zone 'America/Sao_Paulo')::date between p_start and p_end
 and not exists(select 1 from public.erp_billing_closing_sales cs where cs.sale_id=s.id) order by s.customer_id loop
 if p_mode='individual' or v_id is null then
 v_key:=md5(p_request_key::text||case when p_mode='individual' then c.customer_id::text else 'consolidado' end)::uuid;
 insert into public.erp_billing_closings(customer_id,network_id,period_start,period_end,request_key,actor_user_id)
 values(case when p_mode='individual' then c.customer_id else n.headquarters_customer_id end,n.id,p_start,p_end,v_key,auth.uid()) returning id into v_id;v_count:=v_count+1;
 end if;
 insert into public.erp_billing_closing_sales(closing_id,sale_id)
 select v_id,s.id from public.erp_sales s join public.erp_receivables r on r.sale_id=s.id where s.customer_id=c.customer_id and not s.is_test and s.status='confirmed' and r.total>r.paid
 and (p_branch_id is null or s.branch_id=p_branch_id) and (s.confirmed_at at time zone 'America/Sao_Paulo')::date between p_start and p_end
 and not exists(select 1 from public.erp_billing_closing_sales cs where cs.sale_id=s.id);
 end loop;
 if v_count=0 then raise exception 'Nenhuma venda em aberto disponível para fechamento';end if;
 perform pamda_private.audit('network.closing',p_request_key,jsonb_build_object('network_id',n.id,'mode',p_mode,'count',v_count));
 return jsonb_build_object('confirmed',true,'count',v_count);
end $$;
revoke all on function public.pamda_network_closing(uuid,date,date,text,uuid,uuid,uuid) from public,anon;
grant execute on function public.pamda_network_closing(uuid,date,date,text,uuid,uuid,uuid) to authenticated;
