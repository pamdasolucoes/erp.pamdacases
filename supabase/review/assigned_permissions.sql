-- Respect the permissions configured by an administrator. No grants to users or roles.
-- Run as a single transaction after review. Guard-only replacements preserve deployed business logic.
BEGIN;
DO $patch$
DECLARE r record; v_oid oid; v_definition text; v_updated text;
BEGIN
 FOR r IN SELECT * FROM (VALUES
 ('public','pamda_cadastrar_item_basico','products.manage'),
 ('public','pamda_cadastrar_kit','products.manage'),
 ('public','pamda_admin_criar_capa_com_kit','products.manage'),
 ('public','pamda_admin_editar_produto','products.manage'),
 ('private','pamda_admin_produto_acao_impl','products.manage'),
 ('public','pamda_admin_salvar_modelo_panda_ia','products.manage'),
 ('public','pamda_users_read','users.manage'),
 ('public','pamda_user_save','users.manage'),
 ('public','pamda_admin_registrar_perfil','users.manage'),
 ('public','pamda_admin_definir_permissao','users.manage'),
 ('public','pamda_admin_atualizar_perfil','users.manage'),
 ('public','pamda_admin_criar_rede','customers.manage'),
 ('public','pamda_admin_vincular_cliente_rede','customers.manage'),
 ('public','pamda_admin_configurar_cobranca_rede','customers.manage'),
 ('public','pamda_conceder_credito_teste','finance.manage'),
 ('public','pamda_confirmar_pagamento_teste','finance.manage'),
 ('public','pamda_finalizar_venda_teste','sales.confirm')) AS target(schema_name,function_name,permission_key) LOOP
  SELECT p.oid INTO STRICT v_oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname=r.schema_name AND p.proname=r.function_name AND p.prokind='f';
  v_definition:=pg_get_functiondef(v_oid);
  IF r.function_name IN ('pamda_cadastrar_item_basico','pamda_cadastrar_kit') THEN
   v_updated:=replace(v_definition, 'p.role = ''admin_gerencial''',format('public.pamda_has_permission(%L)',r.permission_key));
  ELSE
   v_updated:=replace(replace(v_definition,'IF NOT public.pamda_is_admin()',format('IF NOT public.pamda_has_permission(%L)',r.permission_key)), 'if not public.pamda_is_admin()',format('if not public.pamda_has_permission(%L)',r.permission_key));
  END IF;
  IF v_updated=v_definition AND position(format('public.pamda_has_permission(%L)',r.permission_key) IN v_definition)=0 THEN
   RAISE EXCEPTION 'Unexpected authorization contract: %.%',r.schema_name,r.function_name;
  END IF;
  -- Preserve administrator self-protection without preventing delegated managers from saving their own unchanged role.
  IF r.function_name='pamda_user_save' THEN
   v_updated:=replace(v_updated,'if v_user=auth.uid() and (','if v_user=auth.uid() and public.pamda_is_admin() and (');
  ELSIF r.function_name='pamda_admin_atualizar_perfil' THEN
   v_updated:=replace(v_updated,'IF p_user_id=(SELECT auth.uid()) AND (','IF p_user_id=(SELECT auth.uid()) AND public.pamda_is_admin() AND (');
  END IF;
  EXECUTE v_updated;
 END LOOP;
END $patch$;

-- Contextual reads needed to perform the assigned action; the actual write permission stays separate.
DO $patch$
DECLARE v_definition text; v_updated text;
BEGIN
 v_definition:=pg_get_functiondef('public.pamda_operation_read(text,date,date)'::regprocedure);
 v_updated:=replace(v_definition,'perform pamda_private.require_permission(v_permission);',
  'if not (public.pamda_has_permission(v_permission) or (p_module=''stock'' and (public.pamda_has_permission(''stock.manage'') or public.pamda_has_permission(''stock.cost''))) or (p_module in (''receivables'',''closings'') and public.pamda_has_permission(''finance.manage'')) or (p_module=''production'' and public.pamda_has_permission(''production.manage''))) then raise exception ''Acesso não autorizado'' using errcode=''42501''; end if;');
 IF v_updated=v_definition AND position('p_module=''stock'' and' in v_definition)=0 THEN RAISE EXCEPTION 'Unexpected operation read contract'; END IF;
 EXECUTE v_updated;
 v_definition:=pg_get_functiondef('public.pamda_shared_production_read()'::regprocedure);
 v_updated:=replace(v_definition,'NOT public.pamda_has_permission(''production.read'')','NOT (public.pamda_has_permission(''production.read'') OR public.pamda_has_permission(''production.manage''))');
 EXECUTE v_updated;
 v_definition:=pg_get_functiondef('public.pamda_contexto_comercial_cliente(uuid,uuid)'::regprocedure);
 v_updated:=replace(v_definition,'OR public.pamda_has_permission(''customers.manage''))','OR public.pamda_has_permission(''customers.manage'') OR public.pamda_has_permission(''customers.shipping.manage'') OR public.pamda_has_permission(''sales.read''))');
 EXECUTE v_updated;
 v_definition:=pg_get_functiondef('public.pamda_descartar_venda_vazia(uuid)'::regprocedure);
 v_updated:=replace(v_definition,'NOT public.pamda_is_admin()','NOT public.pamda_has_permission(''sales.confirm'')');
 EXECUTE v_updated;
 v_definition:=pg_get_functiondef('public.pamda_saldo_credito_teste(uuid)'::regprocedure);
 v_updated:=replace(v_definition,'public.pamda_is_admin()','public.pamda_has_permission(''finance.manage'') OR public.pamda_has_permission(''finance.read'')');
 EXECUTE v_updated;
END $patch$;

-- No direct writes to business or authorization tables are added.
ALTER POLICY erp_customers_read_by_staff ON public.customers USING (
 (SELECT public.pamda_has_permission('customers.manage') OR public.pamda_has_permission('customers.shipping.manage') OR public.pamda_has_permission('sales.draft') OR public.pamda_has_permission('sales.read')));
ALTER POLICY erp_branches_read_by_staff ON public.customer_branches USING (
 (SELECT public.pamda_has_permission('customers.manage') OR public.pamda_has_permission('customers.shipping.manage') OR public.pamda_has_permission('sales.draft') OR public.pamda_has_permission('sales.read')));
ALTER POLICY erp_payment_methods_staff_select ON public.erp_payment_methods USING ((SELECT public.pamda_has_permission('sales.draft') OR public.pamda_has_permission('customers.manage') OR public.pamda_has_permission('customers.shipping.manage')));
ALTER POLICY erp_payment_terms_staff_select ON public.erp_payment_terms USING ((SELECT public.pamda_has_permission('sales.draft') OR public.pamda_has_permission('customers.manage') OR public.pamda_has_permission('customers.shipping.manage')));
ALTER POLICY erp_customer_payment_staff_select ON public.erp_customer_payment_settings USING ((SELECT public.pamda_has_permission('sales.draft') OR public.pamda_has_permission('customers.manage') OR public.pamda_has_permission('customers.shipping.manage')));
ALTER POLICY erp_branch_payment_staff_select ON public.erp_branch_payment_settings USING ((SELECT public.pamda_has_permission('sales.draft') OR public.pamda_has_permission('customers.manage') OR public.pamda_has_permission('customers.shipping.manage')));
ALTER POLICY erp_panda_ia_models_staff_admin_read ON public.erp_panda_ia_phone_models USING ((SELECT public.pamda_has_permission('products.manage')));
ALTER POLICY erp_sales_staff_read ON public.erp_sales USING ((SELECT public.pamda_has_permission('sales.read') OR public.pamda_has_permission('sales.confirm') OR public.pamda_has_permission('sales.cancel') OR public.pamda_has_permission('sales.maintain')) OR (created_by=(SELECT auth.uid()) AND (SELECT public.pamda_has_permission('sales.draft'))));
ALTER POLICY erp_sale_events_admin_read ON public.erp_sale_events USING (EXISTS(SELECT 1 FROM public.erp_sales s WHERE s.id=erp_sale_events.sale_id));
ALTER POLICY sale_test_receipts_admin_read ON public.erp_sale_test_receipts USING ((SELECT public.pamda_has_permission('sales.confirm') OR public.pamda_has_permission('finance.read') OR public.pamda_has_permission('finance.manage')));
ALTER POLICY sale_test_payments_admin_read ON public.erp_sale_test_payments USING ((SELECT public.pamda_has_permission('sales.confirm') OR public.pamda_has_permission('finance.read') OR public.pamda_has_permission('finance.manage')));
ALTER POLICY production_tasks_read ON public.erp_production_tasks USING ((SELECT public.pamda_has_permission('production.read') OR public.pamda_has_permission('production.manage')) OR (channel_id IS NOT NULL AND messenger_private.messenger_access(channel_id)));
ALTER POLICY production_task_events_read ON public.erp_production_task_events USING ((SELECT public.pamda_has_permission('production.read') OR public.pamda_has_permission('production.manage')));
ALTER POLICY panda_ia_tech_assets_admin_select ON storage.objects USING (bucket_id='panda-ia-modelos' AND (SELECT public.pamda_has_permission('products.manage')));
ALTER POLICY panda_ia_tech_assets_admin_insert ON storage.objects WITH CHECK (bucket_id='panda-ia-modelos' AND (SELECT public.pamda_has_permission('products.manage')));
ALTER POLICY panda_ia_tech_assets_admin_update ON storage.objects USING (bucket_id='panda-ia-modelos' AND (SELECT public.pamda_has_permission('products.manage'))) WITH CHECK (bucket_id='panda-ia-modelos' AND (SELECT public.pamda_has_permission('products.manage')));
ALTER POLICY panda_ia_tech_assets_admin_delete ON storage.objects USING (bucket_id='panda-ia-modelos' AND (SELECT public.pamda_has_permission('products.manage')));
COMMIT;
