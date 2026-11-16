create table public.customer_branches(id uuid default gen_random_uuid(),customer_id uuid,name text default 'Unidade do cadastro original'::text,trade_name text,address text default ''::text,number text,complement text,neighborhood text default ''::text,city text default ''::text,state text default ''::text,zip_code text default ''::text,phone text default ''::text,contact_name text default ''::text,notes text,active boolean default true,override_policy jsonb,address_needs_review boolean default false,import_source_customer_code text,created_at timestamp with time zone default now(),updated_at timestamp with time zone default now(),is_primary boolean default false,shipping_fee_override numeric(12,2),primary key (id));
create table public.customers(id uuid default gen_random_uuid(),customer_code text,name text,company_name text,cnpj text,cpf text,cpf_cnpj_original text,state_registration text,legacy_person_type text,phone text default ''::text,mobile_phone text,whatsapp_phone text,email text,contact_name text default ''::text,reference_name text,reference_phone text,legacy_registered_on date,legacy_last_purchase_on date,legacy_registered_raw text,legacy_last_purchase_raw text,notes text,active boolean default true,is_chain boolean default false,customer_kind text default 'a_classificar'::text,billing_mode text,created_at timestamp with time zone default now(),updated_at timestamp with time zone default now(),default_shipping_fee numeric(12,2),primary key (id));
create table public.erp_deliveries(sale_id uuid,status text default 'pending'::text,carrier text default ''::text,actual_cost numeric(14,2),updated_at timestamp with time zone default now(),primary key (sale_id));
create table public.erp_messenger_messages(id uuid default gen_random_uuid(),channel_id uuid,author_id uuid,request_key uuid,kind text,body text,sale_id uuid,production_sale_id uuid,created_at timestamp with time zone default now(),deleted_at timestamp with time zone,deleted_by uuid,approval_payload jsonb,primary key (id));
create table public.erp_operational_settings(singleton boolean default true,company_name text default 'PAMDA CASES'::text,cnpj text default ''::text,phone text default ''::text,pix_key text default ''::text,production_after_payment boolean default false,updated_at timestamp with time zone default now(),primary key (singleton));
create table public.erp_operations_audit(id uuid default gen_random_uuid(),actor_user_id uuid,action text,entity_id uuid,details jsonb default '{}'::jsonb,created_at timestamp with time zone default now(),primary key (id));
create table public.erp_payment_methods(id uuid default gen_random_uuid(),code text,name text,active boolean default true,created_at timestamp with time zone default now(),primary key (id));
create table public.erp_payment_terms(id uuid default gen_random_uuid(),code text,name text,due_days integer default 0,installments integer default 1,notes text,active boolean default true,created_at timestamp with time zone default now(),primary key (id));
create table public.erp_production_jobs(sale_id uuid,status text default 'queued'::text,started_at timestamp with time zone,finished_at timestamp with time zone,updated_at timestamp with time zone default now(),primary key (sale_id));
create table public.erp_production_tasks(id uuid default gen_random_uuid(),source text,channel_id uuid,message_id uuid,sale_item_key uuid,line_no integer default 0,sale_id uuid,product_id uuid,physical_product_id uuid,quantity numeric,stock_quantity numeric default 0,case_source text,model text,customer_name text,external_order text default ''::text,stage text default 'queued'::text,stock_consumed boolean default false,requires_print boolean default true,legacy_stock_locked boolean default false,retry_of uuid,separated_at timestamp with time zone,separated_by uuid,printed_at timestamp with time zone,printed_by uuid,inspected_at timestamp with time zone,inspected_by uuid,packed_at timestamp with time zone,packed_by uuid,created_by uuid,created_at timestamp with time zone default now(),updated_at timestamp with time zone default now(),primary key (id));
create table public.erp_real_payments(id uuid default gen_random_uuid(),sale_id uuid,method_code text,amount numeric(14,2),status text,channel text,scheduled_for timestamp with time zone,paid_at timestamp with time zone,reference text,actor_user_id uuid,created_at timestamp with time zone default now(),primary key (id));
create table public.erp_receivables(sale_id uuid,due_date date,total numeric(14,2),paid numeric(14,2) default 0,primary key (sale_id));
create table public.erp_sale_events(id uuid default gen_random_uuid(),sale_id uuid,actor_user_id uuid,event_type text,details jsonb default '{}'::jsonb,occurred_at timestamp with time zone default now(),primary key (id));
create table public.erp_sale_items(id uuid default gen_random_uuid(),sale_id uuid,product_id uuid,product_code_snapshot text,product_sku_snapshot text,description_snapshot text,quantity numeric(12,3),negotiated_unit_price numeric(12,2),line_subtotal numeric(12,2) generated always as (round((quantity * negotiated_unit_price), 2)) stored,customization jsonb default '{}'::jsonb,created_at timestamp with time zone default now(),unit_cost_snapshot numeric,cost_verified boolean default false,direct_unit_cost_snapshot numeric,primary key (id));
create table public.erp_sale_merges(request_key uuid,actor_user_id uuid,sale_id uuid,source_ids uuid[],created_at timestamp with time zone default now(),primary key (request_key));
create table public.erp_sale_receipts(id uuid default gen_random_uuid(),sale_id uuid,receipt_number text,issued_at timestamp with time zone,receipt_snapshot jsonb,created_at timestamp with time zone default now(),primary key (id));
create table public.erp_sales(id uuid default gen_random_uuid(),customer_id uuid,branch_id uuid,created_by uuid,status text default 'draft'::text,created_at timestamp with time zone default now(),updated_at timestamp with time zone default now(),confirmed_at timestamp with time zone,payment_method_id uuid,payment_term_id uuid,customer_snapshot jsonb default '{}'::jsonb,branch_snapshot jsonb default '{}'::jsonb,seller_snapshot text,notes text,discount_reason text,subtotal numeric(12,2) default 0,discount_amount numeric(12,2) default 0,shipping_charged numeric(12,2) default 0,shipping_actual_cost numeric(12,2),total numeric(12,2) generated always as (((subtotal - discount_amount) + shipping_charged)) stored,draft_key uuid,shipping_confirmed boolean default false,cancelled_at timestamp with time zone,cancelled_by uuid,cancellation_reason text,order_number bigint,first_product_at timestamp with time zone,is_test boolean default false,test_finalize_key uuid,test_confirmed_by uuid,finalize_key uuid,internal_notes text,primary key (id));
create table public.erp_user_profiles(user_id uuid,username text,display_name text,role text,active boolean default true,can_view_financial_metrics boolean default false,created_at timestamp with time zone default now(),updated_at timestamp with time zone default now(),primary key (user_id));
create table public.kit_components(id uuid default gen_random_uuid(),kit_product_id uuid,component_product_id uuid,quantity numeric(12,2) default 1,sort_order integer default 0,created_at timestamp with time zone default now(),primary key (id));
create table public.products(id uuid default gen_random_uuid(),code text,sku text,name text,description text,category text default 'Capas'::text,brand text default 'Pamda'::text,model_phone text,type text default 'fisico'::text,current_cost numeric(12,2),managerial_cost numeric(12,2),sale_price numeric(12,2),controls_inventory boolean default true,current_inventory numeric(12,2) default 0,min_inventory numeric(12,2) default 0,max_inventory numeric(12,2),stock_verified boolean default false,image_url text,source_tab text,active boolean default true,b2b_site_visible boolean default false,notes text,created_at timestamp with time zone default now(),updated_at timestamp with time zone default now(),primary key (id));
alter table public.erp_sale_merges enable row level security;
create policy sale_merges_read on public.erp_sale_merges for select using(true);
CREATE OR REPLACE FUNCTION public.pamda_customer_sale_history(p_customer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if auth.uid() is null or not(public.pamda_has_permission('sales.read') or public.pamda_has_permission('reports.read') or public.pamda_has_permission('sales.maintain')) then raise exception 'Sem permissão de consulta' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',id,'order_number',order_number,'status',status,'total',total,'date',coalesce(confirmed_at,created_at),'branch',branch_snapshot->>'name') order by created_at desc,id),'[]') from public.erp_sales where customer_id=p_customer_id and not is_test);
end $function$;

CREATE OR REPLACE FUNCTION public.pamda_finalize_sale(p_sale_id uuid, p_payments jsonb, p_request_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s public.erp_sales%rowtype; i record; c record; p jsonb; v_sum numeric:=0; v_paid numeric:=0; v_cost numeric;
 v_amount numeric; v_status text; v_key uuid:=gen_random_uuid(); v_due integer; v_after boolean; v_snap jsonb;
begin
 perform pamda_private.require_permission('sales.confirm');
 if p_request_key is null then raise exception 'Chave da operação obrigatória'; end if;
 select * into s from public.erp_sales where id=p_sale_id for update;
 if not found then raise exception 'Venda não encontrada'; end if;
 if s.status='confirmed' and not s.is_test and s.finalize_key=p_request_key then return jsonb_build_object('sale_id',s.id,'status','confirmed'); end if;
 if s.status<>'draft' or s.order_number is null or not s.shipping_confirmed then raise exception 'Venda precisa estar pendente, numerada e com frete confirmado'; end if;
 
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
 -- sales.confirm authorizes receiving this sale only.
 -- Referência opcional: recebimento conferido pelo operador.
 v_paid:=v_paid+v_amount; end if;
 if v_status='scheduled' and nullif(p->>'scheduled_for','') is null then raise exception 'Informe o vencimento agendado'; end if;
 insert into public.erp_real_payments(sale_id,method_code,amount,status,channel,scheduled_for,paid_at,reference,actor_user_id)
 values(s.id,p->>'method_code',v_amount,v_status,'erp',nullif(p->>'scheduled_for','')::timestamptz,
 case when v_status='paid' then now() end,nullif(p->>'reference',''),auth.uid());
 v_sum:=v_sum+v_amount;
 end loop;
 if v_sum<>s.total then raise exception 'Soma dos pagamentos deve corresponder ao total'; end if;
 perform pamda_private.check_production_items(s.id,(select jsonb_agg(jsonb_build_object('product_id',product_id,'quantity',quantity,'customization',customization)) from public.erp_sale_items where sale_id=s.id));
 -- Lock all catalog rows in deterministic order, including kit components.
 perform 1 from public.products where id in (
 select product_id from public.erp_sale_items where sale_id=s.id union
 select k.component_product_id from public.kit_components k join public.erp_sale_items si on si.product_id=k.kit_product_id where si.sale_id=s.id
 ) order by id for update;
 for i in select si.*,pr.type,pr.current_cost,pr.managerial_cost,pr.controls_inventory,pr.stock_verified from public.erp_sale_items si join public.products pr on pr.id=si.product_id where si.sale_id=s.id loop
 v_cost:=i.current_cost;
 if i.type='kit' then
 if not exists(select 1 from public.kit_components where kit_product_id=i.product_id) then raise exception 'Kit sem componentes'; end if;
 if exists(select 1 from public.kit_components k join public.products pr on pr.id=k.component_product_id where k.kit_product_id=i.product_id and pr.type='kit') then raise exception 'Kit aninhado precisa ser desmembrado antes da venda'; end if;
 select case when bool_and(pr.current_cost is not null) then sum(k.quantity*pr.current_cost) end into v_cost from public.kit_components k join public.products pr on pr.id=k.component_product_id where k.kit_product_id=i.product_id;
 end if;
 update public.erp_sale_items set direct_unit_cost_snapshot=v_cost,unit_cost_snapshot=coalesce(i.managerial_cost,v_cost),cost_verified=(coalesce(i.managerial_cost,v_cost) is not null) where id=i.id;
 end loop;
 for c in select product_id,sum(qty) qty from (
 select si.product_id,si.quantity qty from public.erp_sale_items si join public.products pr on pr.id=si.product_id where si.sale_id=s.id and NOT pamda_private.production_item_managed(si.sale_id,si.customization,si.product_id,si.quantity) and pr.controls_inventory and pr.type<>'kit'
 union all select k.component_product_id,si.quantity*k.quantity from public.erp_sale_items si join public.kit_components k on k.kit_product_id=si.product_id join public.products pr on pr.id=k.component_product_id where si.sale_id=s.id and NOT pamda_private.production_item_managed(si.sale_id,si.customization,si.product_id,si.quantity) and pr.controls_inventory
 ) x group by product_id order by product_id loop
 
 if exists(select 1 from public.products where id=c.product_id and (not stock_verified or current_inventory<c.qty)) then
 perform pamda_private.audit('sale.stock_shortage',s.id,jsonb_build_object('product_id',c.product_id,'quantity',c.qty,'inventory',(select current_inventory from public.products where id=c.product_id)));
 end if;
 
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
end $function$;

CREATE OR REPLACE FUNCTION public.pamda_merge_pending_sales(p_sale_ids uuid[], p_request_key uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_ids uuid[]; v_old public.erp_sale_merges%rowtype; s public.erp_sales%rowtype; v_id uuid; v_count integer;
begin
 perform pamda_private.require_permission('sales.confirm');
 if p_request_key is null or p_sale_ids is null or cardinality(p_sale_ids) not between 2 and 50 then raise exception 'Selecione entre 2 e 50 pendências'; end if;
 select array_agg(distinct x order by x) into v_ids from unnest(p_sale_ids) x;
 if cardinality(v_ids)<>cardinality(p_sale_ids) or array_position(v_ids,null) is not null then raise exception 'Seleção inválida'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_key::text,0));
 select * into v_old from public.erp_sale_merges where request_key=p_request_key;
 if found then
 if v_old.actor_user_id<>auth.uid() or v_old.source_ids<>v_ids then raise exception 'Chave já utilizada'; end if;
 return v_old.sale_id;
 end if;
 perform 1 from public.erp_sales where id=any(v_ids) order by id for update;
 select count(*) into v_count from public.erp_sales where id=any(v_ids) and status='draft' and not is_test;
 if v_count<>cardinality(v_ids) then raise exception 'Somente pendências reais abertas podem ser mescladas'; end if;
 if (select count(distinct customer_id) from public.erp_sales where id=any(v_ids))<>1 then raise exception 'Mescle somente pedidos do mesmo cliente'; end if;
 if exists(select 1 from public.erp_sales where id=any(v_ids) and first_product_at is null) then raise exception 'Todas as pendências precisam ter produtos'; end if;
 if (select count(*) from public.erp_sale_items where sale_id=any(v_ids))>200 then raise exception 'O pedido mesclado excede 200 itens'; end if;
 select * into s from public.erp_sales where id=p_sale_ids[1];
 -- New target avoids overwriting either source through an already-open editor.
 v_id:=public.pamda_iniciar_venda(s.customer_id,s.branch_id,p_request_key);
 insert into public.erp_sale_items(sale_id,product_id,product_code_snapshot,product_sku_snapshot,description_snapshot,quantity,negotiated_unit_price,customization)
 select v_id,product_id,product_code_snapshot,product_sku_snapshot,description_snapshot,quantity,negotiated_unit_price,customization from public.erp_sale_items where sale_id=any(v_ids) order by created_at,id;
 update public.erp_sales set
 subtotal=(select sum(subtotal) from public.erp_sales where id=any(v_ids)),
 discount_amount=(select sum(discount_amount) from public.erp_sales where id=any(v_ids)),
 discount_reason='Descontos preservados dos pedidos mesclados',
 shipping_charged=(select sum(shipping_charged) from public.erp_sales where id=any(v_ids)),
 shipping_confirmed=false,
 shipping_actual_cost=(select case when bool_and(shipping_actual_cost is not null) then sum(shipping_actual_cost) end from public.erp_sales where id=any(v_ids)),
 payment_method_id=s.payment_method_id,payment_term_id=s.payment_term_id,
 notes=(select string_agg('Pedido '||order_number||' · '||coalesce(branch_snapshot->>'name','')||E'\n'||coalesce(notes,''),E'\n\n' order by created_at,id) from public.erp_sales where id=any(v_ids)),updated_at=now()
 where id=v_id;
 insert into public.erp_sale_events(sale_id,actor_user_id,event_type,details)
 select id,auth.uid(),'sale_merged',jsonb_build_object('target_sale_id',v_id) from public.erp_sales where id=any(v_ids);
 update public.erp_production_tasks set sale_id=v_id,updated_at=now() where sale_id=any(v_ids);
 update public.erp_messenger_messages set sale_id=v_id where sale_id=any(v_ids);
 update public.erp_sales set status='cancelled',cancelled_at=now(),cancelled_by=auth.uid(),cancellation_reason='Mesclada no pedido '||(select order_number from public.erp_sales where id=v_id),updated_at=now() where id=any(v_ids);
 insert into public.erp_sale_merges(request_key,actor_user_id,sale_id,source_ids) values(p_request_key,auth.uid(),v_id,v_ids);
 insert into public.erp_sale_events(sale_id,actor_user_id,event_type,details) values(v_id,auth.uid(),'sale_merge_created',jsonb_build_object('source_sale_ids',v_ids));
 perform pamda_private.audit('sale.merged',v_id,jsonb_build_object('source_sale_ids',v_ids));
 return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.pamda_operation_read(p_module text, p_start date DEFAULT NULL::date, p_end date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_data jsonb; v_permission text;
begin
 v_permission:=case p_module when 'stock' then 'stock.read' when 'purchases' then 'purchases.manage'
 when 'expenses' then 'expenses.manage' when 'receivables' then 'finance.read' when 'closings' then 'finance.read'
 when 'production' then 'production.read' when 'deliveries' then 'deliveries.manage' when 'reports' then 'reports.read'
 when 'profitability' then 'profitability.read' when 'audit' then 'audit.read' when 'settings' then 'settings.manage' end;
 if v_permission is null then raise exception 'Módulo desconhecido'; end if;
 perform pamda_private.require_permission(v_permission);
 if p_module='stock' then
 select jsonb_build_object('products',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'code',code,'name',name,'balance',current_inventory,'reserved',(select coalesce(sum(t.stock_quantity),0) from public.erp_production_tasks t where t.physical_product_id=products.id and t.stage='queued' and not t.stock_consumed),'verified',stock_verified,'min',min_inventory,'cost',case when public.pamda_has_permission('stock.cost') then current_cost end) order by code),'[]') from public.products where controls_inventory and active),
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
 (select sum(r.total) from public.erp_billing_closing_sales cs join public.erp_receivables r on r.sale_id=cs.sale_id where cs.closing_id=c.id and exists(select 1 from public.erp_sales active_sale where active_sale.id=cs.sale_id and active_sale.status='confirmed')) total,
 (select sum(r.total-r.paid) from public.erp_billing_closing_sales cs join public.erp_receivables r on r.sale_id=cs.sale_id where cs.closing_id=c.id and exists(select 1 from public.erp_sales active_sale where active_sale.id=cs.sale_id and active_sale.status='confirmed')) balance,
 (select jsonb_agg(s.order_number) from public.erp_billing_closing_sales cs join public.erp_sales s on s.id=cs.sale_id where cs.closing_id=c.id and exists(select 1 from public.erp_sales active_sale where active_sale.id=cs.sale_id and active_sale.status='confirmed')) orders
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
 SELECT jsonb_build_object('rows',coalesce(jsonb_agg(to_jsonb(t) ORDER BY happened_at DESC,id),'[]')) INTO v_data FROM(
 SELECT a.*,coalesce(nullif(u.display_name,''),u.username,CASE WHEN a.actor_user_id IS NULL THEN 'Sistema / importação' ELSE 'Usuário removido' END) actor_name,
 coalesce('Venda nº '||s.order_number::text||' · '||coalesce(c.name,s.customer_snapshot->>'name'),'Cliente '||c.customer_code||' · '||c.name,'Produto '||p.code||' · '||p.name,'Grupo '||ch.name,'Usuário '||coalesce(target.display_name,target.username),'Registro operacional') entity_label,
 pamda_private.audit_references(a.details) reference_names
 FROM(
 SELECT a.id,a.action,a.actor_user_id,a.details,a.created_at happened_at,a.entity_id FROM public.erp_operations_audit a
 UNION ALL SELECT a.id,a.action,a.actor_user_id,a.details,a.created_at,a.target_user_id FROM public.erp_access_audit a
 UNION ALL SELECT a.id,a.action,a.actor_user_id,jsonb_build_object('before',a.before_data,'after',a.after_data,'reason',a.reason),a.occurred_at,a.product_id FROM public.erp_product_admin_audit a
 UNION ALL SELECT a.id,a.event_type,a.actor_user_id,a.details,a.occurred_at,a.sale_id FROM public.erp_sale_events a
 UNION ALL SELECT a.id,a.action,a.actor_user_id,jsonb_build_object('before',a.before_data,'after',a.after_data,'reason',a.reason),a.created_at,a.customer_id FROM public.erp_commercial_change_audit a
 UNION ALL SELECT e.id,'production.'||e.action,e.actor_id,e.details||jsonb_build_object('reason',e.reason,'model',t.model,'quantity',t.quantity),e.created_at,e.task_id FROM public.erp_production_task_events e JOIN public.erp_production_tasks t ON t.id=e.task_id
 )a
 LEFT JOIN public.erp_user_profiles u ON u.user_id=a.actor_user_id
 LEFT JOIN public.erp_production_tasks task ON task.id=a.entity_id
 LEFT JOIN public.erp_sales s ON s.id=coalesce(task.sale_id,a.entity_id)
 LEFT JOIN public.customers c ON c.id=coalesce(s.customer_id,a.entity_id)
 LEFT JOIN public.products p ON p.id=coalesce(task.product_id,a.entity_id)
 LEFT JOIN public.erp_messenger_channels ch ON ch.id=coalesce(task.channel_id,a.entity_id)
 LEFT JOIN public.erp_user_profiles target ON target.user_id=a.entity_id
 WHERE (p_start IS NULL OR (a.happened_at AT TIME ZONE 'America/Sao_Paulo')::date>=p_start) AND (p_end IS NULL OR (a.happened_at AT TIME ZONE 'America/Sao_Paulo')::date<=p_end)
 )t;
 elsif p_module='settings' then select to_jsonb(s) into v_data from public.erp_operational_settings s where singleton;
 end if;
 return v_data;
end $function$;

CREATE OR REPLACE FUNCTION public.pamda_sale_movement_read(p_sale_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s public.erp_sales%rowtype;
begin
 if auth.uid() is null or not(public.pamda_has_permission('sales.read') or public.pamda_has_permission('reports.read') or public.pamda_has_permission('sales.maintain')) then raise exception 'Sem permissão de consulta' using errcode='42501'; end if;
 select * into s from public.erp_sales where id=p_sale_id and not is_test;
 if not found then raise exception 'Pedido não encontrado'; end if;
 return jsonb_build_object('sale',to_jsonb(s),'can_maintain',public.pamda_has_permission('sales.maintain'),'can_view_cost',public.pamda_has_permission('stock.cost'),
 'items',(select coalesce(jsonb_agg(case when public.pamda_has_permission('stock.cost') then to_jsonb(i)-'direct_unit_cost_snapshot'-'cost_verified' else to_jsonb(i)-'unit_cost_snapshot'-'direct_unit_cost_snapshot'-'cost_verified' end order by i.created_at,i.id),'[]') from public.erp_sale_items i where sale_id=s.id),
 'payments',(select coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('method_name',coalesce(m.name,p.method_code)) order by p.created_at,p.id),'[]') from public.erp_real_payments p left join public.erp_payment_methods m on m.code=p.method_code where p.sale_id=s.id),
 'methods',(select coalesce(jsonb_agg(jsonb_build_object('code',code,'name',name) order by name),'[]') from public.erp_payment_methods where active and code<>'credito_cliente'),
 'events',(select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'type',e.event_type,'at',e.occurred_at,'actor',coalesce(u.display_name,u.username),'details',e.details) order by e.occurred_at,e.id),'[]') from public.erp_sale_events e left join public.erp_user_profiles u on u.user_id=e.actor_user_id where e.sale_id=s.id));
end $function$;

CREATE OR REPLACE FUNCTION public.pamda_salvar_rascunho_venda(p_cliente_id uuid, p_filial_id uuid, p_itens jsonb, p_frete numeric, p_desconto numeric DEFAULT 0, p_motivo text DEFAULT NULL::text, p_observacoes text DEFAULT NULL::text, p_venda_id uuid DEFAULT NULL::uuid, p_forma_id uuid DEFAULT NULL::uuid, p_prazo_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_user uuid := (SELECT auth.uid());
 v_sale uuid;
 v_owner uuid;
 v_status text;
 v_customer jsonb;
 v_branch jsonb;
 v_default_shipping numeric;
 v_effective_shipping numeric;
 v_subtotal numeric(12,2):=0;
 v_item jsonb;
 v_prod public.products%ROWTYPE;
 v_qty numeric;
 v_unit numeric;
 v_custom jsonb;
 v_seller text;
BEGIN
 p_frete:=coalesce(p_frete,0);
 IF v_user IS NULL OR NOT public.pamda_has_permission('sales.draft') THEN
  RAISE EXCEPTION 'Acesso negado';
 END IF;
 IF p_itens IS NULL OR jsonb_typeof(p_itens)<>'array'
    OR jsonb_array_length(p_itens)>200 THEN
  RAISE EXCEPTION 'Informe uma lista válida de até 200 itens';
 END IF;
 IF (p_frete IS NOT NULL AND (p_frete<0 OR p_frete>9999999999.99))
    OR p_desconto IS NULL OR p_desconto<0 OR p_desconto>9999999999.99 THEN
  RAISE EXCEPTION 'Frete ou desconto inválido';
 END IF;
 SELECT jsonb_build_object('code',c.customer_code,'name',c.name,'phone',c.phone),
 jsonb_build_object('name',b.name,'address',b.address,'number',b.number,
    'complement',b.complement,'neighborhood',b.neighborhood,'city',b.city,
    'state',b.state,'zip_code',b.zip_code,'phone',b.phone),
 COALESCE(b.shipping_fee_override,c.default_shipping_fee)
 INTO v_customer,v_branch,v_default_shipping
 FROM public.customers c
 JOIN public.customer_branches b ON b.customer_id=c.id
 WHERE c.id=p_cliente_id AND b.id=p_filial_id AND c.active AND b.active;
 IF NOT FOUND THEN RAISE EXCEPTION 'Cliente ou filial inválidos'; END IF;
 IF p_frete IS NOT NULL AND
    (coalesce(v_default_shipping,0) IS DISTINCT FROM p_frete) AND
    NOT public.pamda_has_permission('sales.shipping.override') THEN
  RAISE EXCEPTION 'Permissão necessária para alterar frete';
 END IF;
 IF p_forma_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM public.erp_payment_methods WHERE id=p_forma_id AND active) THEN
  RAISE EXCEPTION 'Forma de pagamento inválida';
 END IF;
 IF p_prazo_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM public.erp_payment_terms WHERE id=p_prazo_id AND active) THEN
  RAISE EXCEPTION 'Prazo de pagamento inválido';
 END IF;
 SELECT display_name INTO v_seller FROM public.erp_user_profiles WHERE user_id=v_user;
 IF p_venda_id IS NULL THEN
  v_effective_shipping:=COALESCE(p_frete,v_default_shipping,0);
  INSERT INTO public.erp_sales(customer_id,branch_id,created_by,
   customer_snapshot,branch_snapshot,seller_snapshot,
   payment_method_id,payment_term_id,notes,discount_reason,
   shipping_charged,shipping_confirmed)
  VALUES(p_cliente_id,p_filial_id,v_user,v_customer,v_branch,v_seller,
   p_forma_id,p_prazo_id,p_observacoes,p_motivo,
   v_effective_shipping,COALESCE(p_frete IS NOT NULL OR v_default_shipping IS NOT NULL,false))
  RETURNING id INTO v_sale;
 ELSE
  SELECT created_by,status INTO v_owner,v_status FROM public.erp_sales
  WHERE id=p_venda_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rascunho não encontrado'; END IF;
  IF v_status<>'draft' OR (v_owner<>v_user AND NOT public.pamda_has_permission('sales.confirm')) THEN
    RAISE EXCEPTION 'Rascunho não pode ser alterado';
  END IF;
  v_sale:=p_venda_id;
  PERFORM pamda_private.check_production_items(v_sale,p_itens);
  DELETE FROM public.erp_sale_items WHERE sale_id=v_sale;
  UPDATE public.erp_sales SET customer_id=p_cliente_id,branch_id=p_filial_id,
   customer_snapshot=v_customer,branch_snapshot=v_branch,
   payment_method_id=p_forma_id,payment_term_id=p_prazo_id,
   notes=p_observacoes,discount_reason=p_motivo,
   shipping_charged=COALESCE(p_frete,shipping_charged),
   shipping_confirmed=CASE WHEN p_frete IS NOT NULL THEN true ELSE shipping_confirmed END,
   updated_at=now()
  WHERE id=v_sale;
 END IF;
 FOR v_item IN SELECT value FROM jsonb_array_elements(p_itens) LOOP
  IF jsonb_typeof(v_item)<>'object' THEN RAISE EXCEPTION 'Item inválido'; END IF;
  SELECT * INTO v_prod FROM public.products
  WHERE id=(v_item->>'product_id')::uuid AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Produto inexistente ou inativo'; END IF;
  v_qty:=(v_item->>'quantity')::numeric;
  v_unit:=COALESCE((v_item->>'unit_price')::numeric,v_prod.sale_price);
  v_custom:=COALESCE(v_item->'customization','{}'::jsonb);
  IF v_qty IS NULL OR v_qty<=0 OR v_qty>100000 OR
     v_unit IS NULL OR v_unit<0 OR v_unit>9999999999.99 OR
     jsonb_typeof(v_custom)<>'object' THEN
    RAISE EXCEPTION 'Quantidade, preço ou personalização inválidos';
  END IF;
  IF (v_unit IS DISTINCT FROM v_prod.sale_price) AND
    NOT public.pamda_has_permission('sales.discount') THEN
    RAISE EXCEPTION 'Preço negociado requer autorização';
  END IF;
  INSERT INTO public.erp_sale_items(
    sale_id,product_id,product_code_snapshot,product_sku_snapshot,
    description_snapshot,quantity,negotiated_unit_price,customization
  ) VALUES(v_sale,v_prod.id,v_prod.code,v_prod.sku,v_prod.name,v_qty,v_unit,v_custom);
  v_subtotal:=v_subtotal+round(v_qty*v_unit,2);
 END LOOP;
 IF p_desconto>v_subtotal THEN RAISE EXCEPTION 'Desconto excede subtotal'; END IF;
 IF p_desconto>0 AND NOT public.pamda_has_permission('sales.discount') THEN
  RAISE EXCEPTION 'Desconto requer autorização';
 END IF;
 IF p_desconto>0 AND (p_motivo IS NULL OR btrim(p_motivo)='') THEN
  RAISE EXCEPTION 'Informe motivo do desconto';
 END IF;
 UPDATE public.erp_sales SET subtotal=v_subtotal,discount_amount=p_desconto,
   discount_reason=p_motivo,updated_at=now() WHERE id=v_sale;
 INSERT INTO public.erp_sale_events(sale_id,actor_user_id,event_type,details)
 VALUES(v_sale,v_user,'draft_saved',
  jsonb_build_object('subtotal',v_subtotal,'discount',p_desconto,'shipping',p_frete));
 RETURN v_sale;
END;
$function$;
