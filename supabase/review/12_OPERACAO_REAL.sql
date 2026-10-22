-- Operação real. Não converte vendas/créditos de teste em operações reais.
create schema if not exists pamda_private;
revoke all on schema pamda_private from public, anon, authenticated;

create table public.erp_operations_audit (
 id uuid primary key default gen_random_uuid(), actor_user_id uuid not null references auth.users(id),
 action text not null, entity_id uuid, details jsonb not null default '{}', created_at timestamptz not null default now()
);
create table public.erp_stock_movements (
 id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products(id),
 sale_id uuid references public.erp_sales(id), quantity numeric not null,
 balance_after numeric not null check(balance_after>=0), kind text not null check(kind in ('entry','adjustment','sale','reversal')),
 unit_cost numeric check(unit_cost>=0), reason text not null check(length(btrim(reason))>=3),
 request_key uuid not null, actor_user_id uuid not null references auth.users(id), created_at timestamptz not null default now(),
 unique(request_key,product_id,kind), check(quantity<>0 or kind='adjustment')
);
create table public.erp_suppliers (
 id uuid primary key default gen_random_uuid(), name text not null check(length(btrim(name))>0),
 contact text not null default '', notes text not null default '', active boolean not null default true,
 created_at timestamptz not null default now()
);
create table public.erp_stock_entries (
 id uuid primary key default gen_random_uuid(), supplier_id uuid references public.erp_suppliers(id),
 entry_date date not null, items jsonb not null, total numeric not null check(total>=0), reason text not null,
 request_key uuid unique not null, actor_user_id uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create table public.erp_expenses (
 id uuid primary key default gen_random_uuid(), description text not null check(length(btrim(description))>=3),
 category text not null, amount numeric(14,2) not null check(amount>0), expense_date date not null,
 paid boolean not null default false, request_key uuid unique not null,
 actor_user_id uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create table public.erp_real_payments (
 id uuid primary key default gen_random_uuid(), sale_id uuid not null references public.erp_sales(id),
 method_code text not null, amount numeric(14,2) not null check(amount>0),
 status text not null check(status in ('pending','scheduled','paid','void')),
 channel text not null check(channel in ('erp','site')), scheduled_for timestamptz,
 paid_at timestamptz, reference text, actor_user_id uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
create table public.erp_receivables (
 sale_id uuid primary key references public.erp_sales(id), due_date date not null,
 total numeric(14,2) not null check(total>=0), paid numeric(14,2) not null default 0 check(paid>=0 and paid<=total)
);
create table public.erp_production_jobs (
 sale_id uuid primary key references public.erp_sales(id),
 status text not null default 'queued' check(status in ('blocked','queued','in_progress','ready','cancelled')),
 started_at timestamptz, finished_at timestamptz, updated_at timestamptz not null default now()
);
create table public.erp_deliveries (
 sale_id uuid primary key references public.erp_sales(id),
 status text not null default 'pending' check(status in ('pending','dispatched','delivered','cancelled')),
 carrier text not null default '', actual_cost numeric(14,2) check(actual_cost>=0),
 updated_at timestamptz not null default now()
);
create table public.erp_billing_closings (
 id uuid primary key default gen_random_uuid(), customer_id uuid not null references public.customers(id),
 period_start date not null, period_end date not null check(period_end>=period_start),
 request_key uuid unique not null, actor_user_id uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create table public.erp_billing_closing_sales (
 closing_id uuid not null references public.erp_billing_closings(id),
 sale_id uuid unique not null references public.erp_sales(id), primary key(closing_id,sale_id)
);
create table public.erp_operational_settings (
 singleton boolean primary key default true check(singleton), company_name text not null default 'PAMDA CASES',
 cnpj text not null default '', phone text not null default '', pix_key text not null default '',
 production_after_payment boolean not null default false, updated_at timestamptz not null default now()
);
insert into public.erp_operational_settings(singleton) values(true);
alter table public.erp_sale_items add column unit_cost_snapshot numeric, add column cost_verified boolean not null default false;
alter table public.erp_sales add column finalize_key uuid;
-- Remove somente a restrição que obrigava todas as vendas a serem de teste.
do $$ declare c record; begin
 for c in select conname from pg_constraint where conrelid='public.erp_sales'::regclass and contype='c'
 and pg_get_constraintdef(oid) ~ 'is_test = true' loop
 execute format('alter table public.erp_sales drop constraint %I',c.conname);
 end loop;
end $$;
alter table public.erp_sales alter column is_test set default false;

insert into public.erp_permission_catalog(key,description) values
 ('stock.read','Consultar estoque'),('stock.cost','Consultar custos de estoque'),
 ('expenses.manage','Gerenciar despesas'),('purchases.manage','Registrar entradas e fornecedores'),
 ('deliveries.manage','Gerenciar entregas'),('reports.read','Relatórios de vendas'),
 ('profitability.read','Consultar lucratividade'),('audit.read','Consultar auditoria'),('settings.manage','Configurações')
 on conflict(key) do nothing;
insert into public.erp_role_permissions(role,permission_key,allowed)
 select role,key,true from (values
 ('venda_atendimento','sales.confirm'),('venda_atendimento','stock.read'),('venda_atendimento','reports.read'),
 ('financeiro','finance.read'),('financeiro','finance.manage'),('financeiro','expenses.manage'),
 ('financeiro','deliveries.manage'),('estoque_expedicao','stock.read'),('estoque_expedicao','stock.manage'),
 ('estoque_expedicao','purchases.manage'),('estoque_expedicao','deliveries.manage'),
 ('producao','production.read'),('producao','production.manage')) as v(role,key)
 on conflict(role,permission_key) do nothing;

create function pamda_private.require_permission(p_key text) returns void language plpgsql security invoker set search_path='' as $$
begin if auth.uid() is null or not public.pamda_has_permission(p_key) then
 raise exception 'Acesso não autorizado: %',p_key using errcode='42501'; end if; end $$;

create function pamda_private.audit(p_action text,p_id uuid,p_details jsonb) returns void language sql security invoker set search_path='' as $$
 insert into public.erp_operations_audit(actor_user_id,action,entity_id,details) values(auth.uid(),p_action,p_id,p_details);
$$;

-- Nenhuma escrita direta pelo navegador. As funções abaixo validam autorização e transações.
do $$ declare t text; begin
 foreach t in array array['erp_operations_audit','erp_stock_movements','erp_suppliers','erp_stock_entries','erp_expenses',
 'erp_real_payments','erp_receivables','erp_production_jobs','erp_deliveries','erp_billing_closings',
 'erp_billing_closing_sales','erp_operational_settings'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 end loop;
end $$;

create function public.pamda_my_permissions() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_object_agg(key,public.pamda_has_permission(key)),'{}') from public.erp_permission_catalog where auth.uid() is not null;
$$;

create function public.pamda_stock_write(p_data jsonb,p_request_key uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_item jsonb; v_product public.products%rowtype; v_qty numeric; v_cost numeric; v_total numeric:=0;
 v_kind text:=p_data->>'kind'; v_reason text:=btrim(p_data->>'reason');
begin
 perform pamda_private.require_permission(case when v_kind='entry' then 'purchases.manage' else 'stock.manage' end);
 if p_request_key is null or v_kind not in ('entry','adjustment') or coalesce(length(v_reason),0)<3 then raise exception 'Informe tipo, motivo e chave da operação'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_key::text,0));
 select id into v_id from public.erp_stock_movements where request_key=p_request_key limit 1;
 if found then return v_id; end if;
 if jsonb_typeof(p_data->'items') is distinct from 'array' or jsonb_array_length(p_data->'items') not between 1 and 200 then raise exception 'Informe os produtos'; end if;
 if (select count(*)<>count(distinct x->>'product_id') from jsonb_array_elements(p_data->'items') x) then raise exception 'Produto repetido na entrada'; end if;
 for v_item in select value from jsonb_array_elements(p_data->'items') order by value->>'product_id' loop
 select * into v_product from public.products where id=(v_item->>'product_id')::uuid for update;
 if not found or not v_product.controls_inventory or not v_product.active then raise exception 'Produto sem controle de estoque ou inativo'; end if;
 if v_kind='adjustment' then
   if (v_item->>'counted')::numeric is null or (v_item->>'counted')::numeric<0 then raise exception 'Informe o saldo contado'; end if;
   v_qty:=(v_item->>'counted')::numeric-v_product.current_inventory;
 else v_qty:=(v_item->>'quantity')::numeric; end if;
 if v_qty is null or v_qty='NaN'::numeric or abs(v_qty)>1000000 or (v_kind='entry' and v_qty<=0) then raise exception 'Quantidade inválida'; end if;
 if v_product.current_inventory+v_qty<0 then raise exception 'Saldo insuficiente'; end if;
 v_cost:=nullif(v_item->>'unit_cost','')::numeric;
 if v_kind='entry' and (v_cost is null or v_cost<0 or v_cost='NaN'::numeric or v_cost>1000000) then raise exception 'Informe o custo unitário da entrada'; end if;
 update public.products set current_inventory=current_inventory+v_qty,stock_verified=true,
 current_cost=case when v_kind='entry' then
   case when current_inventory>0 then round((current_inventory*current_cost+v_qty*v_cost)/(current_inventory+v_qty),4) else v_cost end
   else current_cost end,updated_at=now() where id=v_product.id;
 insert into public.erp_stock_movements(product_id,quantity,balance_after,kind,unit_cost,reason,request_key,actor_user_id)
 values(v_product.id,v_qty,v_product.current_inventory+v_qty,v_kind,v_cost,v_reason,p_request_key,auth.uid()) returning id into v_id;
 v_total:=v_total+coalesce(v_cost,0)*v_qty;
 end loop;
 if v_kind='entry' then
 insert into public.erp_stock_entries(supplier_id,entry_date,items,total,reason,request_key,actor_user_id)
 values(nullif(p_data->>'supplier_id','')::uuid,(p_data->>'date')::date,p_data->'items',v_total,v_reason,p_request_key,auth.uid()); end if;
 perform pamda_private.audit('stock.'||v_kind,v_id,p_data);
 return v_id;
end $$;

create function public.pamda_finalize_sale(p_sale_id uuid,p_payments jsonb,p_request_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.erp_sales%rowtype; i record; c record; p jsonb; v_sum numeric:=0; v_paid numeric:=0; v_cost numeric;
 v_amount numeric; v_status text; v_key uuid:=gen_random_uuid(); v_due integer; v_after boolean; v_snap jsonb;
begin
 perform pamda_private.require_permission('sales.confirm');
 if p_request_key is null then raise exception 'Chave da operação obrigatória'; end if;
 select * into s from public.erp_sales where id=p_sale_id for update;
 if not found then raise exception 'Venda não encontrada'; end if;
 if s.status='confirmed' and not s.is_test and s.finalize_key=p_request_key then return jsonb_build_object('sale_id',s.id,'status','confirmed'); end if;
 if s.status<>'draft' or s.order_number is null or not s.shipping_confirmed then raise exception 'Venda precisa estar pendente, numerada e com frete confirmado'; end if;
 if not public.pamda_is_admin() and s.created_by<>auth.uid() then raise exception 'Finalize apenas suas próprias vendas' using errcode='42501'; end if;
 if not exists(select 1 from public.erp_sale_items where sale_id=s.id) then raise exception 'Inclua produtos'; end if;
 if (select sum(line_subtotal) from public.erp_sale_items where sale_id=s.id) is distinct from s.subtotal then raise exception 'Total dos itens divergente. Salve a venda novamente'; end if;
 if jsonb_typeof(p_payments) is distinct from 'array' or jsonb_array_length(p_payments)>20 then raise exception 'Pagamentos inválidos'; end if;
 for p in select value from jsonb_array_elements(p_payments) loop
 v_amount:=(p->>'amount')::numeric; v_status:=p->>'status';
 if v_amount is null or v_amount<=0 or v_amount>1000000 or v_amount<>round(v_amount,2) or v_amount='NaN'::numeric or v_status is null or v_status not in ('pending','scheduled','paid')
 or coalesce(p->>'channel','erp')<>'erp' then raise exception 'Informe pagamento válido pelo ERP'; end if;
 if p->>'method_code'='credito_cliente' then raise exception 'Créditos de teste não podem quitar vendas reais'; end if;
 if not exists(select 1 from public.erp_payment_methods where code=p->>'method_code' and active) then raise exception 'Forma de pagamento inativa'; end if;
 if v_status='paid' then
 perform pamda_private.require_permission('finance.manage');
 if coalesce(length(btrim(p->>'reference')),0)<3 then raise exception 'Informe a referência do recebimento'; end if;
 v_paid:=v_paid+v_amount; end if;
 if v_status='scheduled' and nullif(p->>'scheduled_for','') is null then raise exception 'Informe o vencimento agendado'; end if;
 insert into public.erp_real_payments(sale_id,method_code,amount,status,channel,scheduled_for,paid_at,reference,actor_user_id)
 values(s.id,p->>'method_code',v_amount,v_status,'erp',nullif(p->>'scheduled_for','')::timestamptz,
 case when v_status='paid' then now() end,nullif(p->>'reference',''),auth.uid());
 v_sum:=v_sum+v_amount;
 end loop;
 if v_sum<>s.total then raise exception 'Soma dos pagamentos deve corresponder ao total'; end if;
 -- Lock all catalog rows in deterministic order, including kit components.
 perform 1 from public.products where id in (
 select product_id from public.erp_sale_items where sale_id=s.id union
 select k.component_product_id from public.kit_components k join public.erp_sale_items si on si.product_id=k.kit_product_id where si.sale_id=s.id
 ) order by id for update;
 for i in select si.*,pr.type,pr.current_cost,pr.controls_inventory,pr.stock_verified from public.erp_sale_items si join public.products pr on pr.id=si.product_id where si.sale_id=s.id loop
 v_cost:=i.current_cost;
 if i.type='kit' then
 if not exists(select 1 from public.kit_components where kit_product_id=i.product_id) then raise exception 'Kit sem componentes'; end if;
 if exists(select 1 from public.kit_components k join public.products pr on pr.id=k.component_product_id where k.kit_product_id=i.product_id and pr.type='kit') then raise exception 'Kit aninhado precisa ser desmembrado antes da venda'; end if;
 select case when bool_and(pr.current_cost is not null) then sum(k.quantity*pr.current_cost) end into v_cost from public.kit_components k join public.products pr on pr.id=k.component_product_id where k.kit_product_id=i.product_id;
 end if;
 update public.erp_sale_items set unit_cost_snapshot=v_cost,cost_verified=(v_cost is not null) where id=i.id;
 end loop;
 for c in select product_id,sum(qty) qty from (
 select si.product_id,si.quantity qty from public.erp_sale_items si join public.products pr on pr.id=si.product_id where si.sale_id=s.id and pr.controls_inventory and pr.type<>'kit'
 union all select k.component_product_id,si.quantity*k.quantity from public.erp_sale_items si join public.kit_components k on k.kit_product_id=si.product_id join public.products pr on pr.id=k.component_product_id where si.sale_id=s.id and pr.controls_inventory
 ) x group by product_id order by product_id loop
 if not exists(select 1 from public.products where id=c.product_id and stock_verified and current_inventory>=c.qty) then raise exception 'Estoque não conferido ou insuficiente para finalizar'; end if;
 update public.products set current_inventory=current_inventory-c.qty,updated_at=now() where id=c.product_id;
 insert into public.erp_stock_movements(product_id,sale_id,quantity,balance_after,kind,unit_cost,reason,request_key,actor_user_id)
 select id,s.id,-c.qty,current_inventory,'sale',current_cost,'Venda '||s.order_number,v_key,auth.uid() from public.products where id=c.product_id;
 end loop;
 select coalesce(t.due_days,0) into v_due from public.erp_payment_terms t where t.id=s.payment_term_id;
 insert into public.erp_receivables(sale_id,due_date,total,paid) values(s.id,(now() at time zone 'America/Sao_Paulo')::date+coalesce(v_due,0),s.total,v_paid);
 select production_after_payment into v_after from public.erp_operational_settings where singleton;
 insert into public.erp_production_jobs(sale_id,status) values(s.id,case when v_after and v_paid<s.total then 'blocked' else 'queued' end);
 insert into public.erp_deliveries(sale_id) values(s.id);
 update public.erp_sales set status='confirmed',is_test=false,confirmed_at=now(),finalize_key=p_request_key,updated_at=now() where id=s.id;
 select jsonb_build_object('order_number',s.order_number,'customer',s.customer_snapshot,'branch',s.branch_snapshot,'total',s.total,
 'items',(select jsonb_agg(to_jsonb(si)-'unit_cost_snapshot'-'cost_verified') from public.erp_sale_items si where si.sale_id=s.id),
 'company',(select to_jsonb(st) from public.erp_operational_settings st where singleton)) into v_snap;
 insert into public.erp_sale_receipts(sale_id,receipt_number,receipt_snapshot,issued_at) values(s.id,s.order_number::text,v_snap,now());
 insert into public.erp_sale_events(sale_id,actor_user_id,event_type,details) values(s.id,auth.uid(),'sale_finalized',jsonb_build_object('total',s.total));
 perform pamda_private.audit('sale.finalized',s.id,jsonb_build_object('total',s.total));
 return jsonb_build_object('sale_id',s.id,'status','confirmed');
end $$;

create function public.pamda_operation_write(p_action text,p_data jsonb,p_request_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_sale uuid; v_amount numeric; v_row record; v_total numeric; v_paid numeric; v_status text;
begin
 if p_request_key is null then raise exception 'Chave obrigatória'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_key::text,0));
 if p_action='expense' then
 perform pamda_private.require_permission('expenses.manage');
 if (p_data->>'amount')::numeric='NaN'::numeric or (p_data->>'amount')::numeric>1000000000 then raise exception 'Valor da despesa inválido'; end if;
 insert into public.erp_expenses(description,category,amount,expense_date,paid,request_key,actor_user_id)
 values(p_data->>'description',p_data->>'category',(p_data->>'amount')::numeric,(p_data->>'date')::date,coalesce((p_data->>'paid')::boolean,false),p_request_key,auth.uid())
 on conflict(request_key) do update set request_key=excluded.request_key returning id into v_id;
 elsif p_action='expense_paid' then
 perform pamda_private.require_permission('expenses.manage');
 update public.erp_expenses set paid=true where id=(p_data->>'id')::uuid returning id into v_id;
 elsif p_action='supplier' then
 perform pamda_private.require_permission('purchases.manage');
 v_id:=coalesce(nullif(p_data->>'id','')::uuid,p_request_key);
 insert into public.erp_suppliers(id,name,contact,notes,active) values(v_id,p_data->>'name',coalesce(p_data->>'contact',''),coalesce(p_data->>'notes',''),coalesce((p_data->>'active')::boolean,true))
 on conflict(id) do update set name=excluded.name,contact=excluded.contact,notes=excluded.notes,active=excluded.active;
 elsif p_action='payment' then
 perform pamda_private.require_permission('finance.manage');
 v_sale:=(p_data->>'sale_id')::uuid;
 perform 1 from public.erp_sales where id=v_sale and status='confirmed' and not is_test for update;
 if not found then raise exception 'Venda real confirmada não encontrada'; end if;
 select total,paid into v_total,v_paid from public.erp_receivables where sale_id=v_sale for update;
 if exists(select 1 from public.erp_operations_audit where entity_id=p_request_key and action='payment') then return jsonb_build_object('id',p_request_key); end if;
 v_amount:=(p_data->>'amount')::numeric;
 if v_amount is null or v_amount<=0 or v_amount>v_total-v_paid or v_amount<>round(v_amount,2) or v_amount='NaN'::numeric or coalesce(length(btrim(p_data->>'reference')),0)<3 then raise exception 'Informe valor até o saldo e referência do recebimento'; end if;
 if not exists(select 1 from public.erp_payment_methods where code=p_data->>'method_code' and active and code<>'credito_cliente') then raise exception 'Forma de pagamento inválida'; end if;
 -- Allocate receipt against pending installments without increasing the sale total.
 v_total:=v_amount;
 for v_row in select * from public.erp_real_payments where sale_id=v_sale and status in ('pending','scheduled') order by scheduled_for nulls last,created_at,id for update loop
 exit when v_total=0;
 if v_row.amount<=v_total then
 update public.erp_real_payments set status='paid',paid_at=now(),reference=p_data->>'reference',method_code=p_data->>'method_code' where id=v_row.id;
 v_total:=v_total-v_row.amount;
 else
 update public.erp_real_payments set amount=amount-v_total where id=v_row.id;
 insert into public.erp_real_payments(sale_id,method_code,amount,status,channel,paid_at,reference,actor_user_id) values(v_sale,p_data->>'method_code',v_total,'paid','erp',now(),p_data->>'reference',auth.uid());
 v_total:=0;
 end if;
 end loop;
 if v_total<>0 then raise exception 'Parcelas e saldo divergentes'; end if;
 update public.erp_receivables set paid=paid+v_amount where sale_id=v_sale;
 update public.erp_production_jobs set status='queued',updated_at=now() where sale_id=v_sale and status='blocked' and exists(select 1 from public.erp_receivables where sale_id=v_sale and paid=total);
 v_id:=p_request_key;
 elsif p_action='production' then
 perform pamda_private.require_permission('production.manage'); v_sale:=(p_data->>'sale_id')::uuid;
 select status into v_status from public.erp_production_jobs where sale_id=v_sale for update;
 if (v_status='queued' and p_data->>'status'='in_progress') or (v_status='in_progress' and p_data->>'status'='ready') then
 update public.erp_production_jobs set status=p_data->>'status',started_at=case when p_data->>'status'='in_progress' then now() else started_at end,
 finished_at=case when p_data->>'status'='ready' then now() else finished_at end,updated_at=now() where sale_id=v_sale;
 else raise exception 'Transição de produção inválida ou bloqueada'; end if; v_id:=v_sale;
 elsif p_action='delivery' then
 perform pamda_private.require_permission('deliveries.manage'); v_sale:=(p_data->>'sale_id')::uuid;
 if (p_data->>'actual_cost')::numeric is null or (p_data->>'actual_cost')::numeric='NaN'::numeric or (p_data->>'actual_cost')::numeric>1000000 then raise exception 'Informe o custo real da entrega'; end if;
 select status into v_status from public.erp_deliveries where sale_id=v_sale for update;
 if v_status is null or v_status='cancelled' or p_data->>'status' not in ('pending','dispatched','delivered') then raise exception 'Entrega inválida'; end if;
 if v_status='delivered' and p_data->>'status'<>'delivered' then raise exception 'Entrega já concluída'; end if;
 if p_data->>'status' in ('dispatched','delivered') and not exists(select 1 from public.erp_production_jobs where sale_id=v_sale and status='ready') then raise exception 'Conclua a produção antes da expedição'; end if;
 update public.erp_deliveries set status=p_data->>'status',carrier=coalesce(p_data->>'carrier',''),actual_cost=(p_data->>'actual_cost')::numeric,updated_at=now() where sale_id=v_sale;
 update public.erp_sales set shipping_actual_cost=(p_data->>'actual_cost')::numeric where id=v_sale; v_id:=v_sale;
 elsif p_action='closing' then
 perform pamda_private.require_permission('finance.manage');
 select id into v_id from public.erp_billing_closings where request_key=p_request_key;
 if v_id is not null then return jsonb_build_object('id',v_id); end if;
 perform 1 from public.customers where id=(p_data->>'customer_id')::uuid for update;
 insert into public.erp_billing_closings(customer_id,period_start,period_end,request_key,actor_user_id)
 values((p_data->>'customer_id')::uuid,(p_data->>'start')::date,(p_data->>'end')::date,p_request_key,auth.uid()) returning id into v_id;
 insert into public.erp_billing_closing_sales(closing_id,sale_id)
 select v_id,s.id from public.erp_sales s join public.erp_receivables r on r.sale_id=s.id
 where s.customer_id=(p_data->>'customer_id')::uuid and not s.is_test and s.status='confirmed' and r.paid<r.total
 and (s.confirmed_at at time zone 'America/Sao_Paulo')::date between (p_data->>'start')::date and (p_data->>'end')::date
 and not exists(select 1 from public.erp_billing_closing_sales cs where cs.sale_id=s.id);
 if not found then raise exception 'Nenhuma venda em aberto disponível no período'; end if;
 elsif p_action='settings' then
 perform pamda_private.require_permission('settings.manage');
 if coalesce(length(btrim(p_data->>'company_name')),0)=0 then raise exception 'Informe a empresa'; end if;
 update public.erp_operational_settings set company_name=p_data->>'company_name',cnpj=coalesce(p_data->>'cnpj',''),phone=coalesce(p_data->>'phone',''),pix_key=coalesce(p_data->>'pix_key',''),production_after_payment=coalesce((p_data->>'production_after_payment')::boolean,false),updated_at=now() where singleton; v_id:=p_request_key;
 else raise exception 'Operação desconhecida'; end if;
 if v_id is null then raise exception 'Registro não encontrado'; end if;
 perform pamda_private.audit(p_action,v_id,p_data);
 return jsonb_build_object('id',v_id);
end $$;

-- Leituras retornam somente os dados necessários ao módulo autorizado.
create function public.pamda_operation_read(p_module text,p_start date default null,p_end date default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_data jsonb; v_permission text;
begin
 v_permission:=case p_module when 'stock' then 'stock.read' when 'purchases' then 'purchases.manage'
 when 'expenses' then 'expenses.manage' when 'receivables' then 'finance.read' when 'closings' then 'finance.read'
 when 'production' then 'production.read' when 'deliveries' then 'deliveries.manage' when 'reports' then 'reports.read'
 when 'profitability' then 'profitability.read' when 'audit' then 'audit.read' when 'settings' then 'settings.manage' end;
 if v_permission is null then raise exception 'Módulo desconhecido'; end if;
 perform pamda_private.require_permission(v_permission);
 if p_module='stock' then
 select jsonb_build_object('products',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'code',code,'name',name,'balance',current_inventory,'verified',stock_verified,'min',min_inventory,'cost',case when public.pamda_has_permission('stock.cost') then current_cost end) order by code),'[]') from public.products where controls_inventory and active),
 'movements',(select coalesce(jsonb_agg(to_jsonb(x)-'unit_cost'),'[]') from (select m.*,p.code,p.name from public.erp_stock_movements m join public.products p on p.id=m.product_id order by m.created_at desc limit 500) x)) into v_data;
 elsif p_module='purchases' then
 select jsonb_build_object('suppliers',(select coalesce(jsonb_agg(to_jsonb(t) order by name),'[]') from public.erp_suppliers t),
 'products',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'code',code,'name',name) order by code),'[]') from public.products where active and controls_inventory),
 'entries',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from (select e.*,s.name supplier_name from public.erp_stock_entries e left join public.erp_suppliers s on s.id=e.supplier_id order by e.created_at desc limit 500) t)) into v_data;
 elsif p_module='expenses' then
 select jsonb_build_object('rows',coalesce(jsonb_agg(to_jsonb(t) order by expense_date desc),'[]')) into v_data from public.erp_expenses t where (p_start is null or expense_date>=p_start) and (p_end is null or expense_date<=p_end);
 elsif p_module='receivables' then
 select jsonb_build_object('rows',coalesce(jsonb_agg(to_jsonb(t) order by due_date),'[]'), 'methods',(select jsonb_agg(jsonb_build_object('code',code,'name',name)) from public.erp_payment_methods where active and code<>'credito_cliente')) into v_data
 from (select r.*,s.order_number,s.customer_id,s.customer_snapshot->>'name' customer_name from public.erp_receivables r join public.erp_sales s on s.id=r.sale_id where s.status='confirmed' and not s.is_test) t;
 elsif p_module='closings' then
 select jsonb_build_object('rows',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from (select c.*,cu.name customer_name,
 (select sum(r.total) from public.erp_billing_closing_sales cs join public.erp_receivables r on r.sale_id=cs.sale_id where cs.closing_id=c.id) total,
 (select sum(r.total-r.paid) from public.erp_billing_closing_sales cs join public.erp_receivables r on r.sale_id=cs.sale_id where cs.closing_id=c.id) balance,
 (select jsonb_agg(s.order_number) from public.erp_billing_closing_sales cs join public.erp_sales s on s.id=cs.sale_id where cs.closing_id=c.id) orders
 from public.erp_billing_closings c join public.customers cu on cu.id=c.customer_id order by created_at desc) t),
 'customers',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'code',customer_code) order by name),'[]') from public.customers where active)) into v_data;
 elsif p_module='production' then
 select jsonb_build_object('rows',coalesce(jsonb_agg(to_jsonb(t) order by created_at),'[]')) into v_data
 from (select j.*,s.order_number,s.customer_snapshot->>'name' customer_name,s.notes,s.created_at,
 (select jsonb_agg(jsonb_build_object('name',i.description_snapshot,'quantity',i.quantity,'customization',i.customization)) from public.erp_sale_items i where i.sale_id=s.id) items
 from public.erp_production_jobs j join public.erp_sales s on s.id=j.sale_id where s.status='confirmed' and not s.is_test) t;
 elsif p_module='deliveries' then
 select jsonb_build_object('rows',coalesce(jsonb_agg(to_jsonb(t) order by order_number desc),'[]')) into v_data
 from (select d.*,s.order_number,s.customer_snapshot->>'name' customer_name,s.branch_snapshot address,s.shipping_charged,j.status production_status
 from public.erp_deliveries d join public.erp_sales s on s.id=d.sale_id join public.erp_production_jobs j on j.sale_id=s.id where not s.is_test and s.status='confirmed') t;
 elsif p_module in ('reports','profitability') then
 select jsonb_build_object('rows',coalesce(jsonb_agg(to_jsonb(t) order by confirmed_at desc),'[]'),
 'expenses',case when p_module='profitability' then (select coalesce(sum(amount),0) from public.erp_expenses where (p_start is null or expense_date>=p_start) and (p_end is null or expense_date<=p_end)) end) into v_data
 from (select s.id,s.order_number,s.confirmed_at,s.customer_id,s.customer_snapshot->>'name' customer_name,s.total,s.subtotal,s.discount_amount,s.shipping_charged,
 case when p_module='profitability' then s.shipping_actual_cost end delivery_cost,
 case when p_module='profitability' then (select sum(i.quantity*i.unit_cost_snapshot) from public.erp_sale_items i where i.sale_id=s.id) end product_cost,
 case when p_module='profitability' then (select bool_and(i.cost_verified and i.unit_cost_snapshot is not null) from public.erp_sale_items i where i.sale_id=s.id) end cost_verified
 from public.erp_sales s where s.status='confirmed' and not s.is_test
 and (p_start is null or (s.confirmed_at at time zone 'America/Sao_Paulo')::date>=p_start) and (p_end is null or (s.confirmed_at at time zone 'America/Sao_Paulo')::date<=p_end)) t;
 elsif p_module='audit' then
 select jsonb_build_object('rows',coalesce(jsonb_agg(to_jsonb(t) order by happened_at desc),'[]')) into v_data from (
 select a.id,a.action,a.actor_user_id,a.details,a.created_at happened_at from public.erp_operations_audit a
 union all select a.id,a.action,a.actor_user_id,a.details,a.created_at from public.erp_access_audit a
 union all select a.id,a.action,a.actor_user_id,jsonb_build_object('before',a.before_data,'after',a.after_data,'reason',a.reason),a.occurred_at from public.erp_product_admin_audit a
 union all select a.id,a.event_type,a.actor_user_id,a.details,a.occurred_at from public.erp_sale_events a
 ) t where (p_start is null or happened_at>=p_start) and (p_end is null or happened_at<p_end+1);
 elsif p_module='settings' then select to_jsonb(s) into v_data from public.erp_operational_settings s where singleton;
 end if;
 return v_data;
end $$;

do $$ declare f record; begin
 for f in select oid::regprocedure sig from pg_proc where pronamespace='public'::regnamespace and proname in
 ('pamda_my_permissions','pamda_stock_write','pamda_finalize_sale','pamda_operation_write','pamda_operation_read') loop
 execute format('revoke all on function %s from public,anon',f.sig);
 execute format('grant execute on function %s to authenticated',f.sig);
 end loop;
end $$;
create index on public.erp_stock_movements(product_id,created_at);
create index on public.erp_stock_movements(sale_id);
create index on public.erp_real_payments(sale_id,status);
create index on public.erp_expenses(expense_date);
create index on public.erp_operations_audit(created_at);
