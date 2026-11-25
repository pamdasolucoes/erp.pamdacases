CREATE OR REPLACE FUNCTION pamda_private.check_production_items(sale uuid, items jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
 IF EXISTS(SELECT 1 FROM public.erp_production_tasks t WHERE t.sale_id=sale AND t.source='messenger' AND t.retry_of IS NULL AND (t.stage<>'cancelled' OR EXISTS(SELECT 1 FROM public.erp_production_tasks replacement WHERE replacement.retry_of=t.id AND replacement.stage<>'cancelled')) AND
 (SELECT count(*) FROM jsonb_array_elements(items) i WHERE i->'customization'->>'production_task_id'=t.id::text AND i->>'product_id'=t.product_id::text AND (i->>'quantity')::numeric=t.quantity)<>1) THEN
 RAISE EXCEPTION 'Item vinculado à produção: preserve produto e quantidade. Para corrigir, cancele o item na fila e envie uma nova aprovação'; END IF;
END $function$;

CREATE OR REPLACE FUNCTION pamda_private.production_item_managed(sale uuid, custom jsonb, product uuid, qty numeric)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 SELECT EXISTS(SELECT 1 FROM public.erp_production_tasks t WHERE t.sale_id=sale AND t.id::text=custom->>'production_task_id' AND t.product_id=product AND t.quantity=qty AND t.retry_of IS NULL AND (t.stage<>'cancelled' OR EXISTS(SELECT 1 FROM public.erp_production_tasks replacement WHERE replacement.retry_of=t.id AND replacement.stage<>'cancelled')));
$function$;
