-- Executar depois de operations-homologation.sql, na mesma transação revertida.
do $$ declare actor uuid; n uuid; c uuid; b uuid; request_key uuid:=gen_random_uuid(); report jsonb; prior integer;
begin
 select user_id into actor from public.erp_user_profiles where active and role='admin_gerencial' limit 1;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 select s.customer_id,s.branch_id into c,b from public.erp_sales s join public.erp_receivables r on r.sale_id=s.id where not s.is_test and s.status='confirmed' and r.paid<r.total and not exists(select 1 from public.erp_billing_closing_sales cs where cs.sale_id=s.id) limit 1;
 if c is null then raise exception 'Venda de homologação não encontrada';end if;
 insert into public.erp_customer_networks(network_name,network_code,network_kind,headquarters_customer_id,default_cycle,default_collection_mode,default_due_days,created_by)
 values('Rede transacional','QA-'||gen_random_uuid(),'rede',c,'mensal','centralizado',7,actor) returning id into n;
 insert into public.erp_customer_network_members(network_id,customer_id,unit_sequence,display_code,legacy_customer_code,joined_by)
 select n,c,1,'QA-'||n,customer_code,actor from public.customers where id=c;
 report:=public.pamda_relatorio_rede_clientes(n,current_date,current_date);
 if report->>'payments_integrated'<>'true' then raise exception 'Conciliação não integrada';end if;
 if not exists(select 1 from jsonb_array_elements(report->'units') u where (u->>'branch_id')::uuid=b and (u->>'purchases_real')::numeric>0 and (u->>'paid_real')::numeric>=0) then raise exception 'Relatório sem valores reais';end if;
 perform public.pamda_network_closing(n,current_date,current_date,'consolidado',null,null,request_key);
 select count(*) into prior from public.erp_billing_closings where network_id=n;
 perform public.pamda_network_closing(n,current_date,current_date,'consolidado',null,null,request_key);
 if prior<>1 or (select count(*) from public.erp_billing_closings where network_id=n)<>prior then raise exception 'Fechamento de rede duplicado';end if;
end $$;
