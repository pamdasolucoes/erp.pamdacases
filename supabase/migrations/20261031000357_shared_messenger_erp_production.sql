-- One canonical production queue for ERP sales and Messenger approvals.
ALTER TABLE public.erp_messenger_messages ADD COLUMN approval_payload jsonb;
ALTER TABLE public.erp_stock_movements DROP CONSTRAINT erp_stock_movements_kind_check;
ALTER TABLE public.erp_stock_movements ADD CONSTRAINT erp_stock_movements_kind_check CHECK(kind IN ('entry','adjustment','sale','reversal','production'));

CREATE TABLE public.erp_production_tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source text NOT NULL CHECK(source IN ('erp','messenger')),
 channel_id uuid REFERENCES public.erp_messenger_channels(id), message_id uuid REFERENCES public.erp_messenger_messages(id),
 sale_item_key uuid UNIQUE, line_no integer NOT NULL DEFAULT 0, sale_id uuid REFERENCES public.erp_sales(id),
 product_id uuid NOT NULL REFERENCES public.products(id), physical_product_id uuid REFERENCES public.products(id),
 quantity numeric NOT NULL CHECK(quantity>0 AND quantity<=100000), stock_quantity numeric NOT NULL DEFAULT 0 CHECK(stock_quantity>=0),
 case_source text NOT NULL CHECK(case_source IN ('pamda','customer')), model text NOT NULL, customer_name text NOT NULL,
 external_order text NOT NULL DEFAULT '', stage text NOT NULL DEFAULT 'queued' CHECK(stage IN ('queued','separated','printed','inspected','packed','cancelled')),
 stock_consumed boolean NOT NULL DEFAULT false,requires_print boolean NOT NULL DEFAULT true,legacy_stock_locked boolean NOT NULL DEFAULT false, retry_of uuid REFERENCES public.erp_production_tasks(id),
 separated_at timestamptz, separated_by uuid REFERENCES auth.users(id), printed_at timestamptz, printed_by uuid REFERENCES auth.users(id),
 inspected_at timestamptz, inspected_by uuid REFERENCES auth.users(id), packed_at timestamptz, packed_by uuid REFERENCES auth.users(id),
 created_by uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(message_id,line_no)
);
CREATE INDEX erp_production_tasks_sale ON public.erp_production_tasks(sale_id);
CREATE INDEX erp_production_tasks_queue ON public.erp_production_tasks(stage,created_at);
CREATE INDEX erp_production_tasks_reservations ON public.erp_production_tasks(physical_product_id) WHERE stage='queued';
CREATE TABLE public.erp_production_task_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),task_id uuid NOT NULL REFERENCES public.erp_production_tasks(id),
 action text NOT NULL,reason text NOT NULL DEFAULT '',actor_id uuid NOT NULL REFERENCES auth.users(id),
 request_key uuid NOT NULL UNIQUE, details jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.erp_production_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_production_task_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY production_tasks_read ON public.erp_production_tasks FOR SELECT TO authenticated USING(
 public.pamda_has_permission('production.read') OR (channel_id IS NOT NULL AND messenger_private.messenger_access(channel_id)));
CREATE POLICY production_task_events_read ON public.erp_production_task_events FOR SELECT TO authenticated USING(
 public.pamda_has_permission('production.read'));
REVOKE ALL ON public.erp_production_tasks,public.erp_production_task_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.erp_production_tasks,public.erp_production_task_events TO authenticated;

CREATE FUNCTION public.pamda_messenger_catalog() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT (public.pamda_has_permission('sales.draft') OR public.pamda_has_permission('production.read') OR public.pamda_has_permission('production.manage')) THEN RAISE EXCEPTION 'Sem acesso a aprovações' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('customers',CASE WHEN public.pamda_has_permission('sales.draft') THEN
 (SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'code',c.customer_code,'name',c.name,'branches',
 (SELECT coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'primary',b.is_primary) ORDER BY b.is_primary DESC NULLS LAST,b.name),'[]') FROM public.customer_branches b WHERE b.customer_id=c.id AND b.active)) ORDER BY c.customer_code),'[]') FROM public.customers c WHERE c.active) ELSE '[]'::jsonb END,
 'products',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'code',p.code,'name',p.name,'model',p.model_phone,'type',p.type,'inventory',p.current_inventory,'verified',p.stock_verified) ORDER BY p.name),'[]') FROM public.products p WHERE p.active));
END $$;

-- Helper is private and never exposed as an API authorization shortcut.
CREATE FUNCTION pamda_private.production_item_managed(sale uuid,custom jsonb,product uuid,qty numeric) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.erp_production_tasks t WHERE t.sale_id=sale AND t.id::text=custom->>'production_task_id' AND t.product_id=product AND t.quantity=qty AND t.retry_of IS NULL AND (t.stage<>'cancelled' OR EXISTS(SELECT 1 FROM public.erp_production_tasks replacement WHERE replacement.retry_of=t.id AND replacement.stage<>'cancelled')));
$$;
REVOKE ALL ON FUNCTION pamda_private.production_item_managed(uuid,jsonb,uuid,numeric) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION pamda_private.check_production_items(sale uuid,items jsonb) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.erp_production_tasks t WHERE t.sale_id=sale AND t.source='messenger' AND t.retry_of IS NULL AND (t.stage<>'cancelled' OR EXISTS(SELECT 1 FROM public.erp_production_tasks replacement WHERE replacement.retry_of=t.id AND replacement.stage<>'cancelled')) AND
 (SELECT count(*) FROM jsonb_array_elements(items) i WHERE i->'customization'->>'production_task_id'=t.id::text AND i->>'product_id'=t.product_id::text AND (i->>'quantity')::numeric=t.quantity)<>1) THEN
 RAISE EXCEPTION 'Item vinculado à produção: preserve produto e quantidade. Para corrigir, cancele o item na fila e envie uma nova aprovação'; END IF;
END $$;
REVOKE ALL ON FUNCTION pamda_private.check_production_items(uuid,jsonb) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION pamda_private.enqueue_erp_production() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE i record; physical uuid; multiplier numeric;
BEGIN
 FOR i IN SELECT si.*,p.model_phone,p.type,p.controls_inventory,p.code FROM public.erp_sale_items si JOIN public.products p ON p.id=si.product_id WHERE si.sale_id=NEW.sale_id LOOP
  IF pamda_private.production_item_managed(i.sale_id,i.customization,i.product_id,i.quantity) THEN CONTINUE; END IF;
  physical:=NULL;multiplier:=0;
  IF i.controls_inventory AND i.type<>'kit' THEN physical:=i.product_id;multiplier:=1;
  ELSIF i.type='kit' THEN
   SELECT CASE WHEN count(*)=1 THEN min(k.component_product_id::text)::uuid END,CASE WHEN count(*)=1 THEN sum(k.quantity) ELSE 0 END INTO physical,multiplier FROM public.kit_components k JOIN public.products p ON p.id=k.component_product_id WHERE k.kit_product_id=i.product_id AND p.controls_inventory;
  END IF;
  INSERT INTO public.erp_production_tasks(source,sale_id,sale_item_key,product_id,physical_product_id,quantity,stock_quantity,case_source,model,customer_name,stage,stock_consumed,requires_print,legacy_stock_locked,created_by)
  SELECT 'erp',i.sale_id,i.id,i.product_id,physical,i.quantity,coalesce(multiplier,0)*i.quantity,CASE WHEN i.type='servico' AND i.code='2' THEN 'customer' ELSE 'pamda' END,coalesce((SELECT string_agg(concat_ws(' · ',nullif(c->>'model',''),nullif(c->>'color','')),' / ') FROM jsonb_array_elements(CASE WHEN jsonb_typeof(i.customization->'customerCases')='array' THEN i.customization->'customerCases' ELSE '[]'::jsonb END) c),nullif(i.customization->>'model',''),i.model_phone,i.description_snapshot),s.customer_snapshot->>'name',CASE WHEN NEW.status='ready' THEN 'packed' WHEN NEW.status='cancelled' THEN 'cancelled' WHEN NEW.status='in_progress' THEN 'separated' ELSE 'queued' END,true,(i.type<>'fisico' OR i.description_snapshot ILIKE '%personaliz%'),(TG_OP='UPDATE'),s.created_by FROM public.erp_sales s WHERE s.id=i.sale_id AND NOT s.is_test
  ON CONFLICT(sale_item_key) DO NOTHING;
 END LOOP;
 IF TG_OP='INSERT' AND NEW.status<>'blocked' AND EXISTS(SELECT 1 FROM public.erp_production_tasks WHERE sale_id=NEW.sale_id) THEN
 UPDATE public.erp_production_jobs SET status=CASE WHEN NOT EXISTS(SELECT 1 FROM public.erp_production_tasks WHERE sale_id=NEW.sale_id AND stage NOT IN ('packed','cancelled')) THEN 'ready' WHEN EXISTS(SELECT 1 FROM public.erp_production_tasks WHERE sale_id=NEW.sale_id AND stage NOT IN ('queued','cancelled')) THEN 'in_progress' ELSE 'queued' END WHERE sale_id=NEW.sale_id;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION pamda_private.enqueue_erp_production() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER erp_enqueue_shared_production AFTER INSERT OR UPDATE OF sale_id ON public.erp_production_jobs FOR EACH ROW EXECUTE FUNCTION pamda_private.enqueue_erp_production();
UPDATE public.erp_production_jobs SET sale_id=sale_id;

CREATE FUNCTION pamda_private.cancel_sale_tasks() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.status='cancelled' AND OLD.status IS DISTINCT FROM NEW.status THEN
 UPDATE public.erp_production_tasks SET stage='cancelled',updated_at=now() WHERE sale_id=NEW.id AND stage<>'cancelled';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION pamda_private.cancel_sale_tasks() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER erp_cancel_shared_tasks AFTER UPDATE OF status ON public.erp_sales FOR EACH ROW EXECUTE FUNCTION pamda_private.cancel_sale_tasks();

DO $patch$
DECLARE definition text;
BEGIN
 SELECT replace(pg_get_functiondef('public.pamda_finalize_sale(uuid,jsonb,uuid)'::regprocedure),chr(13),'') INTO definition;
 definition:=replace(definition,'where si.sale_id=s.id and pr.controls_inventory','where si.sale_id=s.id and NOT pamda_private.production_item_managed(si.sale_id,si.customization,si.product_id,si.quantity) and pr.controls_inventory');
 definition:=replace(definition,'-- Lock all catalog rows',E'perform pamda_private.check_production_items(s.id,(select jsonb_agg(jsonb_build_object(''product_id'',product_id,''quantity'',quantity,''customization'',customization)) from public.erp_sale_items where sale_id=s.id));\n -- Lock all catalog rows');
 IF position('production_item_managed' in definition)=0 THEN RAISE EXCEPTION 'Finalizador divergente'; END IF;
 EXECUTE definition;
 SELECT replace(pg_get_functiondef('public.pamda_salvar_rascunho_venda(uuid,uuid,jsonb,numeric,numeric,text,text,uuid,uuid,uuid)'::regprocedure),chr(13),'') INTO definition;
 definition:=replace(definition,'DELETE FROM public.erp_sale_items WHERE sale_id=v_sale;',E'PERFORM pamda_private.check_production_items(v_sale,p_itens);\n  DELETE FROM public.erp_sale_items WHERE sale_id=v_sale;');
 IF position('check_production_items' in definition)=0 THEN RAISE EXCEPTION 'Rascunho divergente'; END IF;
 EXECUTE definition;
 SELECT pg_get_functiondef('public.pamda_operation_write(text,jsonb,uuid)'::regprocedure) INTO definition;
 definition:=replace(definition,'select status into v_status from public.erp_production_jobs',E'if exists(select 1 from public.erp_production_tasks where sale_id=v_sale) then raise exception ''Use as etapas da fila compartilhada de produção''; end if;\n select status into v_status from public.erp_production_jobs');
 EXECUTE definition;
 SELECT pg_get_functiondef('public.pamda_merge_pending_sales(uuid[],uuid)'::regprocedure) INTO definition;
 definition:=replace(definition,'update public.erp_sales set status=''cancelled'',',E'update public.erp_production_tasks set sale_id=v_id,updated_at=now() where sale_id=any(v_ids);\n update public.erp_messenger_messages set sale_id=v_id where sale_id=any(v_ids);\n update public.erp_sales set status=''cancelled'',');
 EXECUTE definition;
 SELECT pg_get_functiondef('public.pamda_resumo_erp()'::regprocedure) INTO definition;
 definition:=replace(definition,'(select count(*) from public.erp_production_jobs where status in (''blocked'',''queued'',''in_progress''))','(select count(*) from public.erp_production_tasks where stage not in (''packed'',''cancelled''))');
 EXECUTE definition;
 SELECT pg_get_functiondef('public.pamda_operation_read(text,date,date)'::regprocedure) INTO definition;
 definition:=replace(definition,'''balance'',current_inventory','''balance'',current_inventory,''reserved'',(select coalesce(sum(t.stock_quantity),0) from public.erp_production_tasks t where t.physical_product_id=products.id and t.stage=''queued'' and not t.stock_consumed)');
 EXECUTE definition;
END $patch$;


CREATE FUNCTION public.pamda_shared_production_read() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.pamda_has_permission('production.read') THEN RAISE EXCEPTION 'Sem acesso à produção' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('can_manage',public.pamda_has_permission('production.manage'),'rows',(
 SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.created_at DESC),'[]') FROM (
 SELECT t.*,p.name product_name,s.order_number,c.name channel_name,EXISTS(SELECT 1 FROM public.erp_production_jobs WHERE sale_id=t.sale_id AND status='blocked') payment_blocked,(SELECT body FROM public.erp_messenger_messages WHERE id=t.message_id) message_body,
 (SELECT display_name FROM public.erp_user_profiles WHERE user_id=t.separated_by) separated_name,
 (SELECT display_name FROM public.erp_user_profiles WHERE user_id=t.printed_by) printed_name,
 (SELECT display_name FROM public.erp_user_profiles WHERE user_id=t.inspected_by) inspected_name,
 (SELECT display_name FROM public.erp_user_profiles WHERE user_id=t.packed_by) packed_name,
 (SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'path',a.object_path,'filename',a.filename)),'[]') FROM public.erp_messenger_attachments a WHERE a.message_id=t.message_id AND a.mime_type LIKE 'image/%') images,
 (SELECT coalesce(jsonb_agg(jsonb_build_object('action',e.action,'reason',e.reason,'created_at',e.created_at,'actor',u.display_name) ORDER BY e.created_at),'[]') FROM public.erp_production_task_events e LEFT JOIN public.erp_user_profiles u ON u.user_id=e.actor_id WHERE e.task_id=t.id) events
 FROM public.erp_production_tasks t JOIN public.products p ON p.id=t.product_id LEFT JOIN public.erp_sales s ON s.id=t.sale_id LEFT JOIN public.erp_messenger_channels c ON c.id=t.channel_id
 WHERE (s.id IS NULL OR s.status<>'cancelled') AND (t.stage NOT IN ('packed','cancelled') OR t.id IN (SELECT id FROM public.erp_production_tasks WHERE stage IN ('packed','cancelled') ORDER BY updated_at DESC LIMIT 500)) ORDER BY t.created_at DESC
 ) q));
END $$;

CREATE FUNCTION public.pamda_messenger_approve(p_message uuid,p_data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
  UPDATE public.erp_sales SET notes=concat_ws(E'\n\n',notes,ch.name||E'\n'||m.body),subtotal=v_subtotal,first_product_at=coalesce(first_product_at,now()),updated_at=now() WHERE id=sale;
  INSERT INTO public.erp_sale_events(sale_id,actor_user_id,event_type,details) VALUES(sale,auth.uid(),'messenger_approved',jsonb_build_object('message_id',m.id));
 END IF;
 UPDATE public.erp_messenger_messages SET sale_id=sale,approval_payload=p_data,kind='approval' WHERE id=m.id;
 RETURN jsonb_build_object('message_id',m.id,'sale_id',sale);
END $$;

CREATE FUNCTION public.pamda_shared_production_action(p_task uuid,p_action text,p_reason text,p_request_key uuid,p_expected_updated_at timestamptz) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.erp_production_tasks; e public.erp_production_task_events; qty numeric; next_stage text; replacement uuid; sale uuid;
BEGIN
 PERFORM pamda_private.require_permission('production.manage');
 IF length(coalesce(p_reason,''))>2000 THEN RAISE EXCEPTION 'Motivo excede 2000 caracteres'; END IF;
 IF p_request_key IS NULL THEN RAISE EXCEPTION 'Chave obrigatória'; END IF;
 SELECT sale_id INTO sale FROM public.erp_production_tasks WHERE id=p_task;
 IF sale IS NOT NULL THEN PERFORM 1 FROM public.erp_sales WHERE id=sale FOR UPDATE; END IF;
 SELECT * INTO t FROM public.erp_production_tasks WHERE id=p_task FOR UPDATE;
 IF t.id IS NULL THEN RAISE EXCEPTION 'Item não encontrado'; END IF;
 SELECT * INTO e FROM public.erp_production_task_events WHERE request_key=p_request_key;
 IF FOUND THEN IF e.task_id<>t.id OR e.action<>p_action OR e.reason<>coalesce(p_reason,'') THEN RAISE EXCEPTION 'Chave reutilizada'; END IF; RETURN to_jsonb(t); END IF;
 IF t.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'Item alterado. Atualize a fila' USING ERRCODE='40001'; END IF;
 IF t.stage='cancelled' OR (sale IS NOT NULL AND EXISTS(SELECT 1 FROM public.erp_sales WHERE id=sale AND status='cancelled')) THEN RAISE EXCEPTION 'Produção cancelada'; END IF;
 IF sale IS NOT NULL AND EXISTS(SELECT 1 FROM public.erp_production_jobs WHERE sale_id=sale AND status='blocked') THEN RAISE EXCEPTION 'Produção aguardando pagamento'; END IF;
 next_stage:=CASE t.stage WHEN 'queued' THEN 'separated' WHEN 'separated' THEN CASE WHEN t.requires_print THEN 'printed' ELSE 'inspected' END WHEN 'printed' THEN 'inspected' WHEN 'inspected' THEN 'packed' END;
 IF p_action='cancel' THEN
  IF coalesce(length(btrim(p_reason)),0)<3 THEN RAISE EXCEPTION 'Informe o motivo do cancelamento'; END IF;
  IF t.stock_consumed AND NOT t.legacy_stock_locked AND t.printed_at IS NULL AND (t.stage IN ('queued','separated') OR NOT t.requires_print) AND t.physical_product_id IS NOT NULL THEN
   UPDATE public.products SET current_inventory=current_inventory+t.stock_quantity,updated_at=now() WHERE id=t.physical_product_id;
   INSERT INTO public.erp_stock_movements(product_id,sale_id,quantity,balance_after,kind,unit_cost,reason,request_key,actor_user_id)
   SELECT id,t.sale_id,t.stock_quantity,current_inventory,'reversal',current_cost,'Cancelamento antes da impressão: '||p_reason,p_request_key,auth.uid() FROM public.products WHERE id=t.physical_product_id;
  END IF;
  UPDATE public.erp_production_tasks SET stage='cancelled',updated_at=clock_timestamp() WHERE id=t.id;
  IF sale IS NOT NULL AND EXISTS(SELECT 1 FROM public.erp_sales WHERE id=sale AND status='draft') THEN
   DELETE FROM public.erp_sale_items WHERE sale_id=sale AND customization->>'production_task_id'=coalesce(t.retry_of,t.id)::text AND NOT EXISTS(SELECT 1 FROM public.erp_production_tasks active_task WHERE (active_task.id=coalesce(t.retry_of,t.id) OR active_task.retry_of=coalesce(t.retry_of,t.id)) AND active_task.stage<>'cancelled');
   UPDATE public.erp_sales SET subtotal=coalesce((SELECT sum(line_subtotal) FROM public.erp_sale_items WHERE sale_id=sale),0),updated_at=now() WHERE id=sale;
  END IF;
 ELSIF p_action='error' THEN
  IF coalesce(length(btrim(p_reason)),0)<3 THEN RAISE EXCEPTION 'Informe o erro e motivo'; END IF;
  UPDATE public.erp_production_tasks SET updated_at=clock_timestamp() WHERE id=t.id;
 ELSIF p_action='reprint' THEN
  IF NOT t.requires_print THEN RAISE EXCEPTION 'Item sem impressão. Registre a correção no ERP'; END IF;
  IF (t.printed_at IS NULL AND t.stage NOT IN ('printed','inspected','packed')) OR coalesce(length(btrim(p_reason)),0)<3 THEN RAISE EXCEPTION 'Informe motivo da reimpressão de capa já impressa'; END IF;
  INSERT INTO public.erp_production_tasks(source,channel_id,message_id,line_no,sale_id,product_id,physical_product_id,quantity,stock_quantity,case_source,model,customer_name,external_order,retry_of,created_by)
  VALUES(t.source,t.channel_id,t.message_id,(SELECT coalesce(max(line_no),0)+1 FROM public.erp_production_tasks WHERE message_id=t.message_id),t.sale_id,t.product_id,t.physical_product_id,t.quantity,t.stock_quantity,t.case_source,t.model,t.customer_name,t.external_order,coalesce(t.retry_of,t.id),auth.uid()) RETURNING id INTO replacement;
  UPDATE public.erp_production_tasks SET stage='cancelled',updated_at=clock_timestamp() WHERE id=t.id;
 ELSE
  IF p_action IS DISTINCT FROM next_stage THEN RAISE EXCEPTION 'Etapa fora de ordem'; END IF;
  IF p_action='separated' THEN
   IF NOT t.stock_consumed AND t.physical_product_id IS NOT NULL THEN
    UPDATE public.products SET current_inventory=current_inventory-t.stock_quantity,updated_at=now() WHERE id=t.physical_product_id;
    INSERT INTO public.erp_stock_movements(product_id,sale_id,quantity,balance_after,kind,unit_cost,reason,request_key,actor_user_id)
    SELECT id,t.sale_id,-t.stock_quantity,current_inventory,'production',current_cost,'Separação da produção '||t.id,p_request_key,auth.uid() FROM public.products WHERE id=t.physical_product_id;
   END IF;
   UPDATE public.erp_production_tasks SET stock_consumed=true,separated_at=now(),separated_by=auth.uid() WHERE id=t.id;
  ELSIF p_action='printed' THEN UPDATE public.erp_production_tasks SET printed_at=now(),printed_by=auth.uid() WHERE id=t.id;
  ELSIF p_action='inspected' THEN UPDATE public.erp_production_tasks SET inspected_at=now(),inspected_by=auth.uid() WHERE id=t.id;
  ELSIF p_action='packed' THEN UPDATE public.erp_production_tasks SET packed_at=now(),packed_by=auth.uid() WHERE id=t.id; END IF;
  UPDATE public.erp_production_tasks SET stage=p_action,updated_at=clock_timestamp() WHERE id=t.id;
 END IF;
 INSERT INTO public.erp_production_task_events(task_id,action,reason,actor_id,request_key,details) VALUES(t.id,p_action,coalesce(p_reason,''),auth.uid(),p_request_key,jsonb_build_object('previous_stage',t.stage,'printed_loss',(t.printed_at IS NOT NULL OR (t.requires_print AND t.stage IN ('printed','inspected','packed'))) AND p_action IN ('cancel','error','reprint'),'replacement_task',replacement));
 IF sale IS NOT NULL THEN
  UPDATE public.erp_production_jobs SET status=CASE WHEN NOT EXISTS(SELECT 1 FROM public.erp_production_tasks WHERE sale_id=sale AND stage NOT IN ('packed','cancelled')) THEN 'ready' WHEN EXISTS(SELECT 1 FROM public.erp_production_tasks WHERE sale_id=sale AND stage NOT IN ('queued','cancelled')) THEN 'in_progress' ELSE 'queued' END,updated_at=now() WHERE sale_id=sale;
 END IF;
 RETURN (SELECT to_jsonb(q) FROM public.erp_production_tasks q WHERE id=t.id);
END $$;


REVOKE ALL ON FUNCTION public.pamda_messenger_catalog(),public.pamda_shared_production_read(),public.pamda_messenger_approve(uuid,jsonb),public.pamda_shared_production_action(uuid,text,text,uuid,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pamda_messenger_catalog(),public.pamda_shared_production_read(),public.pamda_messenger_approve(uuid,jsonb),public.pamda_shared_production_action(uuid,text,text,uuid,timestamptz) TO authenticated;

CREATE FUNCTION public.pamda_messenger_authors(p_channel uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT messenger_private.messenger_access(p_channel) THEN RAISE EXCEPTION 'Grupo não autorizado' USING ERRCODE='42501'; END IF;
 RETURN (SELECT coalesce(jsonb_object_agg(p.user_id,p.display_name),'{}') FROM public.erp_user_profiles p WHERE EXISTS(SELECT 1 FROM public.erp_messenger_messages m WHERE m.channel_id=p_channel AND m.author_id=p.user_id));
END $$;
REVOKE ALL ON FUNCTION public.pamda_messenger_authors(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pamda_messenger_authors(uuid) TO authenticated;

-- Deleting the conversation never destroys artwork required by production.
ALTER POLICY messenger_files_read ON storage.objects USING (
 bucket_id='erp-messenger' AND EXISTS(SELECT 1 FROM public.erp_messenger_messages m WHERE m.channel_id::text=split_part(objects.name,'/',1) AND m.id::text=split_part(objects.name,'/',2) AND messenger_private.messenger_access(m.channel_id) AND
 (m.deleted_at IS NULL OR (public.pamda_has_permission('production.read') AND (m.production_sale_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.erp_production_tasks t WHERE t.message_id=m.id))))));
ALTER POLICY messenger_attachments_read ON public.erp_messenger_attachments USING (
 EXISTS(SELECT 1 FROM public.erp_messenger_messages m WHERE m.id=erp_messenger_attachments.message_id AND messenger_private.messenger_access(m.channel_id) AND
 (m.deleted_at IS NULL OR (public.pamda_has_permission('production.read') AND EXISTS(SELECT 1 FROM public.erp_production_tasks t WHERE t.message_id=m.id)))));

DO $realtime$ BEGIN IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.erp_production_tasks; END IF; END $realtime$;

UPDATE public.erp_permission_catalog SET description='Consultar fila de produção do ERP e Messenger' WHERE key='production.read';
UPDATE public.erp_permission_catalog SET description='Produção: separar, imprimir, conferir, embalar e registrar erros' WHERE key='production.manage';
NOTIFY pgrst, 'reload schema';
