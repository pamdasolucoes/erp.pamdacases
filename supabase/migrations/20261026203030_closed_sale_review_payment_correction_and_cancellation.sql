insert into public.erp_permission_catalog(key,description) values('sales.maintain','Manutenção de movimento: corrigir pagamento e cancelar venda fechada') on conflict(key) do nothing;

create table pamda_private.sale_maintenance_requests(request_key uuid primary key,actor uuid not null,sale_id uuid not null references public.erp_sales(id),payload jsonb not null,created_at timestamptz not null default now());
alter table pamda_private.sale_maintenance_requests enable row level security;
revoke all on pamda_private.sale_maintenance_requests from public,anon,authenticated;

create function public.pamda_sale_movement_read(p_sale_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare s public.erp_sales%rowtype;
begin
 if auth.uid() is null or not(public.pamda_has_permission('sales.read') or public.pamda_has_permission('reports.read') or public.pamda_has_permission('sales.maintain')) then raise exception 'Sem permissão de consulta' using errcode='42501'; end if;
 select * into s from public.erp_sales where id=p_sale_id and not is_test;
 if not found then raise exception 'Pedido não encontrado'; end if;
 return jsonb_build_object('sale',to_jsonb(s),'can_maintain',public.pamda_has_permission('sales.maintain'),
 'items',(select coalesce(jsonb_agg(to_jsonb(i)-'unit_cost_snapshot'-'direct_unit_cost_snapshot'-'cost_verified' order by i.created_at,i.id),'[]') from public.erp_sale_items i where sale_id=s.id),
 'payments',(select coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('method_name',coalesce(m.name,p.method_code)) order by p.created_at,p.id),'[]') from public.erp_real_payments p left join public.erp_payment_methods m on m.code=p.method_code where p.sale_id=s.id),
 'methods',(select coalesce(jsonb_agg(jsonb_build_object('code',code,'name',name) order by name),'[]') from public.erp_payment_methods where active and code<>'credito_cliente'),
 'events',(select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'type',e.event_type,'at',e.occurred_at,'actor',coalesce(u.display_name,u.username),'details',e.details) order by e.occurred_at,e.id),'[]') from public.erp_sale_events e left join public.erp_user_profiles u on u.user_id=e.actor_user_id where e.sale_id=s.id));
end $$;

create function public.pamda_customer_sale_history(p_customer_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not(public.pamda_has_permission('sales.read') or public.pamda_has_permission('reports.read') or public.pamda_has_permission('sales.maintain')) then raise exception 'Sem permissão de consulta' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',id,'order_number',order_number,'status',status,'total',total,'date',coalesce(confirmed_at,created_at),'branch',branch_snapshot->>'name') order by created_at desc,id),'[]') from public.erp_sales where customer_id=p_customer_id and not is_test);
end $$;

create function public.pamda_sale_movement_write(p_sale_id uuid,p_action text,p_payments jsonb,p_reason text,p_expected_updated_at timestamptz,p_request_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare s public.erp_sales%rowtype; r pamda_private.sale_maintenance_requests%rowtype; payload jsonb; before_payments jsonb; x jsonb; pay public.erp_real_payments%rowtype; changes integer:=0;
begin
 perform pamda_private.require_permission('sales.maintain');
 if p_request_key is null or p_action is null or p_action not in ('payments','cancel') or length(btrim(coalesce(p_reason,''))) not between 3 and 2000 then raise exception 'Informe ação e motivo (3 a 2000 caracteres)'; end if;
 payload:=jsonb_build_object('action',p_action,'payments',p_payments,'reason',btrim(p_reason),'expected',p_expected_updated_at);
 perform pg_advisory_xact_lock(hashtextextended(p_request_key::text,0));
 select * into r from pamda_private.sale_maintenance_requests where request_key=p_request_key;
 if found then
 if r.actor<>auth.uid() or r.sale_id<>p_sale_id or r.payload<>payload then raise exception 'Chave já utilizada'; end if;
 return r.sale_id;
 end if;
 select * into s from public.erp_sales where id=p_sale_id for update;
 if not found or s.status<>'confirmed' or s.is_test then raise exception 'Somente vendas reais confirmadas podem ser mantidas'; end if;
 if s.updated_at is distinct from p_expected_updated_at then raise exception 'Venda alterada por outro operador. Feche e abra a consulta novamente'; end if;
 perform 1 from public.erp_receivables where sale_id=s.id for update;
 perform 1 from public.erp_real_payments where sale_id=s.id order by id for update;
 select coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]') into before_payments from public.erp_real_payments p where sale_id=s.id;
 if p_action='payments' then
 if jsonb_typeof(p_payments) is distinct from 'array' then raise exception 'Pagamentos inválidos'; end if;
 if jsonb_array_length(p_payments)<>(select count(*) from public.erp_real_payments where sale_id=s.id and status<>'void') or (select count(distinct value->>'id') from jsonb_array_elements(p_payments))<>jsonb_array_length(p_payments) then raise exception 'Lista de pagamentos desatualizada'; end if;
 for x in select value from jsonb_array_elements(p_payments) loop
 select * into pay from public.erp_real_payments where id=(x->>'id')::uuid and sale_id=s.id and status<>'void';
 if not found then raise exception 'Pagamento não pertence a esta venda'; end if;
 if x->>'method_code' is null or not exists(select 1 from public.erp_payment_methods where code=x->>'method_code' and active and code<>'credito_cliente') then raise exception 'Forma de pagamento inválida ou inativa'; end if;
 if pay.method_code is distinct from x->>'method_code' then
 if pay.channel<>'erp' then raise exception 'Pagamento de provedor externo não permite alteração manual'; end if;
 update public.erp_real_payments set method_code=x->>'method_code' where id=pay.id;
 changes:=changes+1;
 end if;
 end loop;
 if changes=0 then raise exception 'Nenhuma forma de pagamento foi alterada'; end if;
 update public.erp_sales set updated_at=clock_timestamp(),payment_method_id=case when jsonb_array_length(p_payments)=1 then (select id from public.erp_payment_methods where code=p_payments->0->>'method_code') else payment_method_id end where id=s.id;
 else
 -- Preserve the original sale, consumption and audit. No stock reversal or bank transaction.
 update public.erp_sales set status='cancelled',cancelled_at=now(),cancelled_by=auth.uid(),cancellation_reason=btrim(p_reason),updated_at=clock_timestamp() where id=s.id;
 update public.erp_real_payments set status='void' where sale_id=s.id;
 update public.erp_receivables set total=0,paid=0 where sale_id=s.id;
 update public.erp_production_jobs set status='cancelled',updated_at=now() where sale_id=s.id;
 update public.erp_deliveries set status='cancelled',updated_at=now() where sale_id=s.id;
 end if;
 insert into public.erp_sale_events(sale_id,actor_user_id,event_type,details) values(s.id,auth.uid(),case when p_action='cancel' then 'confirmed_sale_cancelled' else 'sale_payment_corrected' end,jsonb_build_object('reason',btrim(p_reason),'before_payments',before_payments,'after_payments',(select jsonb_agg(to_jsonb(p) order by id) from public.erp_real_payments p where sale_id=s.id),'stock_reversed',false));
 perform pamda_private.audit('sale.maintenance.'||p_action,s.id,jsonb_build_object('reason',btrim(p_reason),'before_payments',before_payments,'stock_reversed',false));
 insert into pamda_private.sale_maintenance_requests(request_key,actor,sale_id,payload) values(p_request_key,auth.uid(),s.id,payload);
 return s.id;
end $$;
revoke all on function public.pamda_sale_movement_read(uuid),public.pamda_customer_sale_history(uuid),public.pamda_sale_movement_write(uuid,text,jsonb,text,timestamptz,uuid) from public,anon;
grant execute on function public.pamda_sale_movement_read(uuid),public.pamda_customer_sale_history(uuid),public.pamda_sale_movement_write(uuid,text,jsonb,text,timestamptz,uuid) to authenticated;

do $$ declare d text; begin
 select pg_get_functiondef('public.pamda_real_sale_document(uuid)'::regprocedure) into d;
 d:=replace(d,'public.pamda_has_permission(''sales.read'')','(public.pamda_has_permission(''sales.read'') or public.pamda_has_permission(''reports.read'') or public.pamda_has_permission(''sales.maintain''))');
 d:=replace(d,'jsonb_build_object(''paid'',v.paid)', $r$jsonb_build_object('paid',v.paid,'payments',(select coalesce(jsonb_agg(jsonb_build_object('method_code',p.method_code,'method_name',coalesce(m.name,p.method_code),'amount',p.amount,'status',p.status) order by p.created_at,p.id),'[]') from public.erp_real_payments p left join public.erp_payment_methods m on m.code=p.method_code where p.sale_id=r.sale_id and p.status<>'void'))$r$);
 d:=replace(d,'return v_result;', $r$v_result:=jsonb_set(v_result,'{receipt_snapshot,items}',coalesce((select jsonb_agg(x-'unit_cost_snapshot'-'direct_unit_cost_snapshot'-'cost_verified') from jsonb_array_elements(coalesce(v_result->'receipt_snapshot'->'items','[]')) x),'[]'));
 return v_result;$r$);
 execute d;
 select pg_get_functiondef('public.pamda_operation_read(text,date,date)'::regprocedure) into d;
 d:=replace(d,'where cs.closing_id=c.id','where cs.closing_id=c.id and exists(select 1 from public.erp_sales active_sale where active_sale.id=cs.sale_id and active_sale.status=''confirmed'')');
 execute d;
 select pg_get_functiondef('public.pamda_operation_write(text,jsonb,uuid)'::regprocedure) into d;
 d:=replace(d,'perform pamda_private.require_permission(''production.manage''); v_sale:=(p_data->>''sale_id'')::uuid;', $r$perform pamda_private.require_permission('production.manage'); v_sale:=(p_data->>'sale_id')::uuid;
 perform 1 from public.erp_sales where id=v_sale and status='confirmed' and not is_test for update;
 if not found then raise exception 'Venda não está confirmada'; end if;$r$);
 d:=replace(d,'perform pamda_private.require_permission(''deliveries.manage''); v_sale:=(p_data->>''sale_id'')::uuid;', $r$perform pamda_private.require_permission('deliveries.manage'); v_sale:=(p_data->>'sale_id')::uuid;
 perform 1 from public.erp_sales where id=v_sale and status='confirmed' and not is_test for update;
 if not found then raise exception 'Venda não está confirmada'; end if;$r$);
 execute d;
end $$;
