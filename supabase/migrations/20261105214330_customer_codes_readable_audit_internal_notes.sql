CREATE FUNCTION pamda_private.available_customer_code() RETURNS text LANGUAGE sql STABLE SET search_path='' AS $$
 WITH used AS (SELECT DISTINCT btrim(customer_code)::numeric n FROM public.customers WHERE btrim(customer_code)~'^[0-9]+$' AND length(btrim(customer_code))<=18),
 candidates AS (SELECT 1::numeric n UNION SELECT n+1 FROM used WHERE n>=1)
 SELECT min(c.n)::text FROM candidates c WHERE NOT EXISTS(SELECT 1 FROM used u WHERE u.n=c.n);
$$;
REVOKE ALL ON FUNCTION pamda_private.available_customer_code() FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.pamda_next_customer_code() RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN IF auth.uid() IS NULL OR NOT public.pamda_has_permission('customers.manage') THEN RAISE EXCEPTION 'Acesso negado' USING ERRCODE='42501';END IF;RETURN pamda_private.available_customer_code();END $$;
REVOKE ALL ON FUNCTION public.pamda_next_customer_code() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pamda_next_customer_code() TO authenticated;
CREATE OR REPLACE FUNCTION public.pamda_admin_cadastrar_cliente_com_matriz(p_codigo text, p_nome text, p_endereco text, p_numero text, p_bairro text, p_cidade text, p_estado text, p_cep text, p_telefone text DEFAULT ''::text)
 RETURNS TABLE(cliente_id uuid, matriz_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_customer uuid; v_branch uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('pamda.customer-code',0));
 IF NOT public.pamda_has_permission('customers.manage') THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 IF p_codigo IS NULL OR btrim(p_codigo)='' OR p_nome IS NULL OR btrim(p_nome)=''
   OR p_endereco IS NULL OR btrim(p_endereco)='' OR p_cidade IS NULL OR btrim(p_cidade)=''
   OR p_estado IS NULL OR btrim(p_estado)='' THEN
   RAISE EXCEPTION 'Código, nome e endereço são obrigatórios';
 END IF;
 INSERT INTO public.customers(customer_code,name,phone)
 VALUES(btrim(p_codigo),btrim(p_nome),COALESCE(p_telefone,''))
 RETURNING id INTO v_customer;
 INSERT INTO public.customer_branches(customer_id,name,address,number,neighborhood,city,state,zip_code,phone,is_primary)
 VALUES(v_customer,'Matriz',btrim(p_endereco),p_numero,COALESCE(p_bairro,''),btrim(p_cidade),btrim(p_estado),COALESCE(p_cep,''),COALESCE(p_telefone,''),true)
 RETURNING id INTO v_branch;
 INSERT INTO public.erp_commercial_change_audit(actor_user_id,customer_id,branch_id,action,after_data)
 VALUES((SELECT auth.uid()),v_customer,v_branch,'cadastrar_cliente_com_matriz',
 jsonb_build_object('codigo',btrim(p_codigo),'matriz',true));
 RETURN QUERY SELECT v_customer,v_branch;
END; $function$
;
CREATE FUNCTION public.pamda_create_customer_auto(p_nome text,p_endereco text,p_numero text,p_bairro text,p_cidade text,p_estado text,p_cep text,p_telefone text DEFAULT '') RETURNS TABLE(cliente_id uuid,matriz_id uuid,codigo text) LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE next_code text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.pamda_has_permission('customers.manage') THEN RAISE EXCEPTION 'Acesso negado' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('pamda.customer-code',0));
 next_code:=pamda_private.available_customer_code();
 RETURN QUERY SELECT c.cliente_id,c.matriz_id,next_code FROM public.pamda_admin_cadastrar_cliente_com_matriz(next_code,p_nome,p_endereco,p_numero,p_bairro,p_cidade,p_estado,p_cep,p_telefone)c;
END $$;
REVOKE ALL ON FUNCTION public.pamda_create_customer_auto(text,text,text,text,text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pamda_create_customer_auto(text,text,text,text,text,text,text,text) TO authenticated;
ALTER TABLE public.erp_sales ADD COLUMN internal_notes text;
DO $$ DECLARE r record;block text;BEGIN
 FOR r IN SELECT m.sale_id,m.body,c.name FROM public.erp_messenger_messages m JOIN public.erp_messenger_channels c ON c.id=m.channel_id WHERE m.sale_id IS NOT NULL AND m.approval_payload IS NOT NULL ORDER BY m.created_at LOOP
 block:=r.name||E'\n'||r.body;
 UPDATE public.erp_sales SET internal_notes=concat_ws(E'\n\n',internal_notes,block),notes=nullif(btrim(replace(notes,block,''),E'\n '),'') WHERE id=r.sale_id AND strpos(coalesce(notes,''),block)>0;
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.pamda_messenger_approve(p_message uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE m public.erp_messenger_messages; ch public.erp_messenger_channels; customer public.customers; branch public.customer_branches;
 item jsonb; p public.products; physical uuid; multiplier numeric; sale uuid; task uuid; n integer:=0; v_subtotal numeric; prior jsonb;
BEGIN
 SELECT * INTO m FROM public.erp_messenger_messages WHERE id=p_message FOR UPDATE;
 IF NOT FOUND OR m.deleted_at IS NOT NULL OR m.author_id<>auth.uid() OR NOT messenger_private.messenger_access(m.channel_id) THEN RAISE EXCEPTION 'Mensagem não autorizada' USING ERRCODE='42501'; END IF;
 IF NOT public.pamda_has_permission('sales.draft') AND NOT public.pamda_has_permission('production.manage') THEN RAISE EXCEPTION 'Sem permissão para aprovar' USING ERRCODE='42501'; END IF;
 SELECT * INTO ch FROM public.erp_messenger_channels WHERE id=m.channel_id AND active;
 IF ch.mode='chat' OR ch.id IS NULL THEN RAISE EXCEPTION 'Este grupo é somente de conversa'; END IF;
 IF EXISTS(SELECT 1 FROM public.erp_production_tasks WHERE message_id=m.id) THEN
  IF m.approval_payload IS DISTINCT FROM p_data THEN RAISE EXCEPTION 'Aprovação já registrada com outros dados. Confira a produção antes de alterar'; END IF;
  RETURN jsonb_build_object('message_id',m.id,'sale_id',m.sale_id,'already_created',true);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.erp_messenger_attachments WHERE message_id=m.id AND mime_type LIKE 'image/%' AND EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='erp-messenger' AND o.name=object_path)) THEN RAISE EXCEPTION 'Confirme e envie a imagem antes de aprovar'; END IF;
 IF jsonb_typeof(p_data->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(p_data->'items') NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Informe de 1 a 20 modelos'; END IF;
 IF ch.mode='erp_order' THEN
  IF NOT public.pamda_has_permission('sales.draft') THEN RAISE EXCEPTION 'Sem permissão de venda'; END IF;
  SELECT * INTO customer FROM public.customers WHERE id=(p_data->>'customer_id')::uuid AND active;
  SELECT * INTO branch FROM public.customer_branches WHERE id=(p_data->>'branch_id')::uuid AND customer_id=customer.id AND active;
  IF customer.id IS NULL OR branch.id IS NULL OR p_data->>'confirmed_customer_code' IS DISTINCT FROM customer.customer_code OR p_data->>'confirmed_customer_name' IS DISTINCT FROM customer.name THEN RAISE EXCEPTION 'Confirme código, nome oficial e unidade do cliente'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(ch.id::text||customer.id::text,0));
  SELECT s.id INTO sale FROM public.erp_sales s WHERE s.customer_id=customer.id AND s.branch_id=branch.id AND s.status='draft' AND s.created_by=auth.uid()
  AND EXISTS(SELECT 1 FROM public.erp_production_tasks t WHERE t.sale_id=s.id AND t.channel_id=ch.id AND t.stage<>'cancelled' AND t.created_at>now()-interval '20 minutes') ORDER BY s.created_at DESC LIMIT 1 FOR UPDATE;
  IF sale IS NULL THEN
   PERFORM public.pamda_prepare_order_number(m.request_key,NULL);
   sale:=public.pamda_iniciar_venda(customer.id,branch.id,m.request_key);
  END IF;
 ELSE
  IF coalesce(length(btrim(p_data->>'external_order')),0)=0 OR coalesce(length(btrim(p_data->>'customer_name')),0)=0 THEN RAISE EXCEPTION 'Informe comprador e número do pedido do marketplace'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(ch.id::text||lower(btrim(p_data->>'external_order')),0));
  IF coalesce((p_data->>'allow_additional_item')::boolean,false)=false AND EXISTS(SELECT 1 FROM public.erp_production_tasks WHERE channel_id=ch.id AND lower(external_order)=lower(btrim(p_data->>'external_order')) AND stage<>'cancelled') THEN RAISE EXCEPTION 'Pedido do marketplace já está na produção. Se for outra capa do mesmo pedido, confirme a opção de item adicional'; END IF;
 END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_data->'items') LOOP
  SELECT * INTO p FROM public.products WHERE id=(item->>'product_id')::uuid AND active;
  IF p.id IS NULL OR nullif(btrim(item->>'model'),'') IS NULL OR length(item->>'model')>200 OR (item->>'quantity')::integer NOT BETWEEN 1 AND 1000 OR item->>'case_source' NOT IN ('customer','pamda') THEN RAISE EXCEPTION 'Produto, modelo, origem ou quantidade inválidos'; END IF;
  physical:=NULL;multiplier:=0;
  IF item->>'case_source'='customer' THEN
   IF ch.mode<>'erp_order' THEN RAISE EXCEPTION 'Capa do cliente é serviço B2B; marketplace utiliza o estoque Panda'; END IF;
   IF p.type<>'servico' OR p.code<>'2' THEN RAISE EXCEPTION 'Capa do cliente exige serviço de impressão em capa fornecida'; END IF;
  ELSE
   IF ch.mode='erp_order' AND p.type<>'kit' THEN RAISE EXCEPTION 'Selecione o kit personalizado para capa Panda no B2B'; END IF;
   IF p.type='kit' THEN
    SELECT count(*),min(k.component_product_id::text)::uuid,sum(k.quantity) INTO n,physical,multiplier FROM public.kit_components k JOIN public.products q ON q.id=k.component_product_id WHERE k.kit_product_id=p.id AND q.controls_inventory AND q.active;
    IF n<>1 THEN RAISE EXCEPTION 'Selecione um kit com uma capa física identificada'; END IF;
   ELSIF p.type='fisico' AND p.controls_inventory THEN physical:=p.id;multiplier:=1;
   ELSE RAISE EXCEPTION 'Produto sem capa física identificada'; END IF;
  END IF;
  task:=gen_random_uuid();
  INSERT INTO public.erp_production_tasks(id,source,channel_id,message_id,line_no,sale_id,product_id,physical_product_id,quantity,stock_quantity,case_source,model,customer_name,external_order,created_by)
  VALUES(task,'messenger',ch.id,m.id,(SELECT count(*) FROM public.erp_production_tasks WHERE message_id=m.id),sale,p.id,physical,(item->>'quantity')::integer,multiplier*(item->>'quantity')::integer,item->>'case_source',btrim(item->>'model'),CASE WHEN ch.mode='erp_order' THEN customer.name ELSE btrim(p_data->>'customer_name') END,coalesce(p_data->>'external_order',''),auth.uid());
  IF sale IS NOT NULL THEN
   IF p.sale_price IS NULL THEN RAISE EXCEPTION 'Produto sem preço oficial. Configure no ERP'; END IF;
   INSERT INTO public.erp_sale_items(sale_id,product_id,product_code_snapshot,product_sku_snapshot,description_snapshot,quantity,negotiated_unit_price,customization)
   VALUES(sale,p.id,p.code,p.sku,p.name,(item->>'quantity')::integer,p.sale_price,jsonb_build_object('model',btrim(item->>'model'),'color','','walletFaces','','production_task_id',task,'messenger_message_id',m.id,'caseSource',item->>'case_source'));
  END IF;
  INSERT INTO public.erp_production_task_events(task_id,action,actor_id,request_key,details) VALUES(task,'approved',auth.uid(),gen_random_uuid(),jsonb_build_object('message_id',m.id,'stock_reserved',physical IS NOT NULL));
 END LOOP;
 IF sale IS NOT NULL THEN
  SELECT sum(line_subtotal) INTO v_subtotal FROM public.erp_sale_items WHERE sale_id=sale;
  UPDATE public.erp_sales SET internal_notes=concat_ws(E'\n\n',internal_notes,ch.name||E'\n'||m.body),subtotal=v_subtotal,first_product_at=coalesce(first_product_at,now()),updated_at=now() WHERE id=sale;
  INSERT INTO public.erp_sale_events(sale_id,actor_user_id,event_type,details) VALUES(sale,auth.uid(),'messenger_approved',jsonb_build_object('message_id',m.id));
 END IF;
 UPDATE public.erp_messenger_messages SET sale_id=sale,approval_payload=p_data,kind='approval' WHERE id=m.id;
 RETURN jsonb_build_object('message_id',m.id,'sale_id',sale);
END $function$
;
CREATE FUNCTION pamda_private.audit_references(p_data jsonb) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 WITH ids AS MATERIALIZED(SELECT DISTINCT (v#>>'{}')::uuid id FROM jsonb_path_query(coalesce(p_data,'{}'),'$.** ? (@.type() == "string")')v WHERE (v#>>'{}')~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
 refs AS(
 SELECT p.user_id id,coalesce(nullif(p.display_name,''),p.username) label FROM public.erp_user_profiles p JOIN ids i ON i.id=p.user_id
 UNION ALL SELECT c.id,'Cliente '||c.customer_code||' · '||c.name FROM public.customers c JOIN ids i USING(id)
 UNION ALL SELECT b.id,'Unidade '||b.name FROM public.customer_branches b JOIN ids i USING(id)
 UNION ALL SELECT p.id,'Produto '||p.code||' · '||p.name FROM public.products p JOIN ids i USING(id)
 UNION ALL SELECT s.id,'Venda nº '||coalesce(s.order_number::text,'sem número') FROM public.erp_sales s JOIN ids i USING(id)
 UNION ALL SELECT c.id,'Grupo '||c.name FROM public.erp_messenger_channels c JOIN ids i USING(id)
 UNION ALL SELECT p.id,p.name FROM public.erp_payment_methods p JOIN ids i USING(id)
 UNION ALL SELECT p.id,p.name FROM public.erp_payment_terms p JOIN ids i USING(id)
 UNION ALL SELECT p.id,'Fornecedor '||p.name FROM public.erp_suppliers p JOIN ids i USING(id)
 )SELECT coalesce(jsonb_object_agg(id::text,label),'{}') FROM refs;
$$;
REVOKE ALL ON FUNCTION pamda_private.audit_references(jsonb) FROM PUBLIC,anon,authenticated;
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
end $function$
;
NOTIFY pgrst,'reload schema';
