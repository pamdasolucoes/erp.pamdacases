-- Revisar e homologar antes de aplicar em produção. Não modifica cadastros existentes.
BEGIN;
CREATE SCHEMA IF NOT EXISTS pamda_private;
REVOKE ALL ON SCHEMA pamda_private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA pamda_private TO authenticated;

-- Unicidade também para diferenças de caixa e espaços, inclusive arquivados.
CREATE UNIQUE INDEX IF NOT EXISTS products_sku_normalized_unique ON public.products (upper(btrim(sku)));

-- Escritas administrativas passam pelas RPCs auditadas; RLS sozinha não audita.
REVOKE UPDATE, DELETE ON public.products FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.erp_product_admin_audit FROM authenticated, anon;

CREATE OR REPLACE FUNCTION pamda_private.product_admin_action(
 p_id uuid, p_expected timestamptz, p_action text, p_sku text, p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_old public.products%ROWTYPE; v_new public.products%ROWTYPE;
 v_kit public.products%ROWTYPE; v_sku text; v_ids uuid[]; v_count integer;
BEGIN
 IF auth.uid() IS NULL OR NOT public.pamda_is_admin() THEN
  RAISE EXCEPTION 'Somente administrador ativo' USING ERRCODE='42501';
 END IF;
 IF p_action IS NULL OR p_action NOT IN ('sku','archive') OR p_expected IS NULL
    OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 5 AND 1000 THEN
  RAISE EXCEPTION 'Informe versão e motivo de 5 a 1000 caracteres';
 END IF;
 -- Serializa com cadastro de kit, publicação e outras alterações administrativas.
 LOCK TABLE public.products, public.kit_components, public.erp_panda_ia_phone_models IN SHARE ROW EXCLUSIVE MODE;
 SELECT * INTO v_old FROM public.products WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Produto não encontrado'; END IF;
 IF v_old.updated_at IS DISTINCT FROM p_expected THEN
  RAISE EXCEPTION 'Produto alterado em outra sessão. Atualize o catálogo';
 END IF;
 IF p_action='archive' THEN
  IF EXISTS(SELECT 1 FROM public.erp_panda_ia_phone_models WHERE published AND (base_product_id=p_id OR kit_product_id=p_id))
     OR v_old.b2b_site_visible THEN
   RAISE EXCEPTION 'Despublique o produto/modelo no Panda IA antes de arquivar. Os vínculos serão preservados';
  END IF;
  IF EXISTS(SELECT 1 FROM public.kit_components c JOIN public.products k ON k.id=c.kit_product_id WHERE c.component_product_id=p_id AND k.active) THEN
   RAISE EXCEPTION 'Arquive primeiro os kits ativos que utilizam este componente';
  END IF;
  IF NOT v_old.active THEN RAISE EXCEPTION 'Produto já arquivado'; END IF;
  UPDATE public.products SET active=false,updated_at=clock_timestamp() WHERE id=p_id RETURNING * INTO v_new;
 ELSE
  v_sku:=upper(btrim(coalesce(p_sku,'')));
  IF length(v_sku) NOT BETWEEN 2 AND 100 OR v_sku !~ '^[A-Z0-9][A-Z0-9._-]+$' THEN
   RAISE EXCEPTION 'SKU inválido: use 2 a 100 letras, números, ponto, hífen ou sublinhado';
  END IF;
  IF v_sku=v_old.sku THEN RAISE EXCEPTION 'Informe um SKU diferente'; END IF;
  IF v_old.type='fisico' AND v_sku LIKE 'KIT-%' THEN RAISE EXCEPTION 'Prefixo KIT- reservado aos kits'; END IF;
  IF EXISTS(SELECT 1 FROM public.kit_components c JOIN public.products b ON b.id=c.component_product_id WHERE c.kit_product_id=p_id AND b.type='fisico') THEN
   RAISE EXCEPTION 'Altere o SKU pela capa-base para manter o kit coerente';
  END IF;
  SELECT coalesce(array_agg(DISTINCT k.id),ARRAY[]::uuid[]) INTO v_ids
  FROM public.products k JOIN public.kit_components c ON c.kit_product_id=k.id
  WHERE c.component_product_id=p_id AND v_old.type='fisico';
  -- Associação por UUID; nomes e prefixos nunca descobrem o vínculo.
  FOREACH v_kit.id IN ARRAY v_ids LOOP
   SELECT * INTO v_kit FROM public.products WHERE id=v_kit.id;
   SELECT count(*) INTO v_count FROM public.kit_components c JOIN public.products b ON b.id=c.component_product_id WHERE c.kit_product_id=v_kit.id AND b.type='fisico';
   IF v_kit.type<>'kit' OR v_kit.sku IS DISTINCT FROM 'KIT-'||v_old.sku OR v_count<>1 OR length(v_sku)>96 THEN
    RAISE EXCEPTION 'Kit especial ou vínculo ambíguo: revisão manual necessária antes de alterar SKU';
   END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM public.erp_panda_ia_phone_models m WHERE
     (m.base_product_id=p_id AND NOT(m.kit_product_id=ANY(v_ids))) OR
     (m.kit_product_id=ANY(v_ids) AND m.base_product_id<>p_id)) THEN
   RAISE EXCEPTION 'Vínculo Panda IA inconsistente. Revise antes de alterar';
  END IF;
  IF EXISTS(SELECT 1 FROM public.products WHERE id<>p_id AND NOT(id=ANY(v_ids)) AND
     (upper(btrim(sku))=v_sku OR (cardinality(v_ids)>0 AND upper(btrim(sku))='KIT-'||v_sku))) THEN
   RAISE EXCEPTION 'SKU da base ou do kit já utilizado, inclusive em produto arquivado';
  END IF;
  FOREACH v_kit.id IN ARRAY v_ids LOOP
   SELECT * INTO v_kit FROM public.products WHERE id=v_kit.id;
   UPDATE public.products SET sku='KIT-'||v_sku,updated_at=clock_timestamp() WHERE id=v_kit.id RETURNING * INTO v_new;
   INSERT INTO public.erp_product_admin_audit(product_id,actor_user_id,action,before_data,after_data,reason)
    VALUES(v_kit.id,auth.uid(),'alterar_sku_kit',to_jsonb(v_kit),to_jsonb(v_new),btrim(p_reason));
  END LOOP;
  UPDATE public.products SET sku=v_sku,updated_at=clock_timestamp() WHERE id=p_id RETURNING * INTO v_new;
 END IF;
 INSERT INTO public.erp_product_admin_audit(product_id,actor_user_id,action,before_data,after_data,reason)
 VALUES(p_id,auth.uid(),CASE WHEN p_action='sku' THEN 'alterar_sku' ELSE 'arquivar_produto' END,to_jsonb(v_old),to_jsonb(v_new),btrim(p_reason));
 RETURN jsonb_build_object('id',p_id,'sku',v_new.sku,'active',v_new.active,'updated_at',v_new.updated_at,'linked_kit_ids',v_ids);
END; $$;
REVOKE ALL ON FUNCTION pamda_private.product_admin_action(uuid,timestamptz,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION pamda_private.product_admin_action(uuid,timestamptz,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.pamda_admin_produto_acao(p_id uuid,p_expected timestamptz,p_action text,p_sku text,p_reason text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT pamda_private.product_admin_action(p_id,p_expected,p_action,p_sku,p_reason);
$$;
REVOKE ALL ON FUNCTION public.pamda_admin_produto_acao(uuid,timestamptz,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pamda_admin_produto_acao(uuid,timestamptz,text,text,text) TO authenticated;
COMMIT;
