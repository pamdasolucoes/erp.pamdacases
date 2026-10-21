-- PROPOSTA DE REVISAO; nao executar em producao sem aprovacao explicita.
-- Contratos esperados: products, kit_components, erp_panda_ia_phone_models,
-- erp_product_admin_audit, erp_user_profiles e public.pamda_is_admin().
-- Deve ser comparado com as definicoes/grants reais antes de qualquer aplicacao.
-- Nao cria produtos nem altera dados durante a instalacao; teste isolado em PGlite.

-- Inspecao somente leitura: comparar assinaturas, corpos e grants antes de aplicar.
SELECT n.nspname AS schema_name, p.proname AS function_name,
  pg_get_function_arguments(p.oid) AS arguments,
  pg_get_function_result(p.oid) AS result,
  p.prosecdef AS security_definer, p.proconfig AS configuration, p.proacl AS grants,
  pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE (n.nspname='public' AND p.proname IN ('pamda_admin_editar_produto','pamda_admin_produto_acao'))
   OR (n.nspname='private' AND p.proname='pamda_admin_produto_acao_impl')
ORDER BY n.nspname,p.proname;
SELECT n.nspname AS schema_name,n.nspacl AS schema_grants
FROM pg_namespace n WHERE n.nspname='private';

-- Inspecao somente leitura: colunas, restricoes e SKUs duplicados no esquema oficial.
SELECT table_name,column_name,data_type,is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name IN (
  'products','kit_components','erp_panda_ia_phone_models','erp_product_admin_audit','erp_user_profiles'
)
ORDER BY table_name,ordinal_position;
SELECT c.conrelid::regclass AS table_name,c.conname,pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
WHERE c.conrelid IN (
  'public.products'::regclass,'public.kit_components'::regclass,
  'public.erp_panda_ia_phone_models'::regclass,'public.erp_product_admin_audit'::regclass
)
ORDER BY c.conrelid::regclass::text,c.conname;
SELECT upper(btrim(sku)) AS normalized_sku,count(*) AS row_count
FROM public.products
GROUP BY upper(btrim(sku))
HAVING count(*)>1
ORDER BY normalized_sku;

BEGIN;
DO $preflight$
BEGIN
  IF EXISTS (
    SELECT upper(btrim(sku))
    FROM public.products
    GROUP BY upper(btrim(sku))
    HAVING count(*)>1
  ) THEN
    RAISE EXCEPTION 'Existem SKUs duplicados ignorando maiúsculas/espaços; revisar antes da instalação';
  END IF;
  IF to_regnamespace('private') IS NOT NULL
     AND (has_schema_privilege('anon',to_regnamespace('private'),'USAGE')
       OR has_schema_privilege('authenticated',to_regnamespace('private'),'USAGE')) THEN
    RAISE EXCEPTION 'O schema private já está acessível por anon/authenticated; revisar privilégios sem afetar outras funções';
  END IF;
END;
$preflight$;

CREATE UNIQUE INDEX IF NOT EXISTS products_sku_normalized_unique
  ON public.products (upper(btrim(sku)));

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION public.pamda_admin_editar_produto(
  p_produto_id uuid,
  p_expected_updated_at timestamp with time zone,
  p_changes jsonb,
  p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_old public.products%ROWTYPE;
  v_new public.products%ROWTYPE;
  v_bad text;
BEGIN
  IF NOT public.pamda_is_admin() THEN
    RAISE EXCEPTION 'Somente administrador ativo pode editar produtos' USING ERRCODE='42501';
  END IF;
  IF p_produto_id IS NULL OR p_expected_updated_at IS NULL
     OR p_changes IS NULL OR jsonb_typeof(p_changes)<>'object'
     OR p_changes='{}'::jsonb OR length(btrim(coalesce(p_motivo,'')))<5 THEN
    RAISE EXCEPTION 'Produto, versão, alteração e motivo são obrigatórios';
  END IF;

  SELECT keys.key INTO v_bad
  FROM jsonb_object_keys(p_changes) AS keys(key)
  WHERE keys.key NOT IN ('name','description','category','brand','model_phone',
    'current_cost','managerial_cost','sale_price','image_url')
  LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Campo não editável nesta tela: %', v_bad;
  END IF;
  IF (p_changes ? 'name' AND (jsonb_typeof(p_changes->'name')<>'string'
       OR length(btrim(p_changes->>'name')) NOT BETWEEN 2 AND 160))
     OR (p_changes ? 'category' AND (jsonb_typeof(p_changes->'category')<>'string'
       OR length(btrim(p_changes->>'category')) NOT BETWEEN 1 AND 160))
     OR (p_changes ? 'brand' AND (jsonb_typeof(p_changes->'brand')<>'string'
       OR length(btrim(p_changes->>'brand')) NOT BETWEEN 1 AND 100))
     OR (p_changes ? 'description' AND jsonb_typeof(p_changes->'description') NOT IN ('string','null'))
     OR (p_changes ? 'model_phone' AND jsonb_typeof(p_changes->'model_phone') NOT IN ('string','null'))
     OR (p_changes ? 'image_url' AND jsonb_typeof(p_changes->'image_url') NOT IN ('string','null')) THEN
    RAISE EXCEPTION 'Campos textuais inválidos';
  END IF;
  IF (p_changes ? 'current_cost' AND jsonb_typeof(p_changes->'current_cost') NOT IN ('number','null'))
     OR (p_changes ? 'managerial_cost' AND jsonb_typeof(p_changes->'managerial_cost') NOT IN ('number','null'))
     OR (p_changes ? 'sale_price' AND jsonb_typeof(p_changes->'sale_price') NOT IN ('number','null')) THEN
    RAISE EXCEPTION 'Custos e preço devem ser números ou NULL';
  END IF;
  IF (p_changes ? 'current_cost' AND p_changes->>'current_cost' IS NOT NULL
       AND (p_changes->>'current_cost')::numeric<0)
     OR (p_changes ? 'managerial_cost' AND p_changes->>'managerial_cost' IS NOT NULL
       AND (p_changes->>'managerial_cost')::numeric<0)
     OR (p_changes ? 'sale_price' AND p_changes->>'sale_price' IS NOT NULL
       AND (p_changes->>'sale_price')::numeric<0) THEN
    RAISE EXCEPTION 'Custos e preço não podem ser negativos';
  END IF;
  IF p_changes ? 'model_phone' AND p_changes->>'model_phone' IS NOT NULL
     AND length(btrim(p_changes->>'model_phone'))>160 THEN
    RAISE EXCEPTION 'Modelo do celular inválido';
  END IF;
  IF p_changes ? 'image_url' AND p_changes->>'image_url' IS NOT NULL
     AND (p_changes->>'image_url' !~* '^https://[^[:space:]]+$'
       OR length(p_changes->>'image_url')>2000) THEN
    RAISE EXCEPTION 'A imagem precisa de uma URL HTTPS válida';
  END IF;

  SELECT * INTO v_old FROM public.products WHERE id=p_produto_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Produto não encontrado'; END IF;
  IF NOT v_old.active THEN RAISE EXCEPTION 'Produto arquivado não pode ser editado'; END IF;
  IF v_old.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Produto foi alterado em outra sessão. Atualize a página';
  END IF;
  IF v_old.type='kit' AND p_changes ? 'sale_price'
     AND p_changes->>'sale_price' IS NULL
     AND (v_old.b2b_site_visible OR EXISTS (
       SELECT 1 FROM public.erp_panda_ia_phone_models m
       WHERE m.kit_product_id=v_old.id AND m.published
     )) THEN
    RAISE EXCEPTION 'Despublique o modelo Panda IA antes de remover o preço do kit';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.erp_panda_ia_phone_models m
    WHERE m.published AND (m.kit_product_id=v_old.id OR m.base_product_id=v_old.id)
  ) AND (p_changes ? 'name' OR p_changes ? 'brand' OR p_changes ? 'model_phone') THEN
    RAISE EXCEPTION 'Despublique o modelo Panda IA antes de alterar nome, marca ou modelo';
  END IF;

  UPDATE public.products SET
    name=CASE WHEN p_changes ? 'name' THEN btrim(p_changes->>'name') ELSE name END,
    description=CASE WHEN p_changes ? 'description' THEN p_changes->>'description' ELSE description END,
    category=CASE WHEN p_changes ? 'category' THEN btrim(p_changes->>'category') ELSE category END,
    brand=CASE WHEN p_changes ? 'brand' THEN btrim(p_changes->>'brand') ELSE brand END,
    model_phone=CASE WHEN p_changes ? 'model_phone' THEN nullif(btrim(p_changes->>'model_phone'),'') ELSE model_phone END,
    current_cost=CASE WHEN p_changes ? 'current_cost' THEN (p_changes->>'current_cost')::numeric ELSE current_cost END,
    managerial_cost=CASE WHEN p_changes ? 'managerial_cost' THEN (p_changes->>'managerial_cost')::numeric ELSE managerial_cost END,
    sale_price=CASE WHEN p_changes ? 'sale_price' THEN (p_changes->>'sale_price')::numeric ELSE sale_price END,
    image_url=CASE WHEN p_changes ? 'image_url' THEN nullif(btrim(p_changes->>'image_url'),'') ELSE image_url END,
    updated_at=clock_timestamp()
  WHERE id=p_produto_id
  RETURNING * INTO v_new;

  INSERT INTO public.erp_product_admin_audit(product_id,actor_user_id,action,before_data,after_data,reason)
  VALUES(p_produto_id,(SELECT auth.uid()),'editar_produto',to_jsonb(v_old),to_jsonb(v_new),btrim(p_motivo));
  RETURN jsonb_build_object('id',v_new.id,'code',v_new.code,'sku',v_new.sku,
    'type',v_new.type,'updated_at',v_new.updated_at);
END;
$function$;

REVOKE ALL ON FUNCTION public.pamda_admin_editar_produto(uuid,timestamp with time zone,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pamda_admin_editar_produto(uuid,timestamp with time zone,jsonb,text) TO authenticated;

CREATE OR REPLACE FUNCTION private.pamda_admin_produto_acao_impl(
  p_produto_id uuid,
  p_acao text,
  p_expected_updated_at timestamp with time zone,
  p_dados jsonb,
  p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_old public.products%ROWTYPE;
  v_new public.products%ROWTYPE;
  v_link_old public.products%ROWTYPE;
  v_link_new public.products%ROWTYPE;
  v_link_id uuid;
  v_link_count integer;
  v_sku text;
  v_link_sku text;
  v_expected_linked timestamptz;
  v_bad text;
BEGIN
  IF NOT public.pamda_is_admin() THEN
    RAISE EXCEPTION 'Somente administrador ativo pode alterar produtos' USING ERRCODE='42501';
  END IF;
  IF p_produto_id IS NULL OR p_expected_updated_at IS NULL
     OR p_dados IS NULL OR jsonb_typeof(p_dados)<>'object'
     OR length(btrim(coalesce(p_motivo,'')))<5 THEN
    RAISE EXCEPTION 'Produto, versão, dados e motivo são obrigatórios';
  END IF;
  IF p_acao IS NULL OR p_acao NOT IN ('alterar_sku','arquivar') THEN
    RAISE EXCEPTION 'Ação de produto inválida';
  END IF;
  SELECT * INTO v_old FROM public.products WHERE id=p_produto_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Produto não encontrado'; END IF;
  IF NOT v_old.active THEN RAISE EXCEPTION 'Produto já está arquivado'; END IF;
  IF v_old.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Produto foi alterado em outra sessão. Atualize a página';
  END IF;

  IF p_acao='alterar_sku' THEN
    SELECT keys.key INTO v_bad FROM jsonb_object_keys(p_dados) AS keys(key)
    WHERE keys.key NOT IN ('sku','linked_sku','linked_product_id','expected_linked_updated_at')
    LIMIT 1;
    IF v_bad IS NOT NULL OR NOT (p_dados ? 'sku')
       OR jsonb_typeof(p_dados->'sku') IS DISTINCT FROM 'string'
       OR (p_dados ? 'linked_sku' AND jsonb_typeof(p_dados->'linked_sku') NOT IN ('string','null'))
       OR (p_dados ? 'linked_product_id' AND jsonb_typeof(p_dados->'linked_product_id') NOT IN ('string','null'))
       OR (p_dados ? 'expected_linked_updated_at' AND jsonb_typeof(p_dados->'expected_linked_updated_at') NOT IN ('string','null')) THEN
      RAISE EXCEPTION 'Dados de SKU inválidos';
    END IF;
    v_sku:=upper(btrim(p_dados->>'sku'));
    IF v_sku IS NULL OR length(v_sku) NOT BETWEEN 2 AND 100 THEN RAISE EXCEPTION 'SKU inválido'; END IF;
    IF v_sku=upper(btrim(v_old.sku)) THEN RAISE EXCEPTION 'Informe um SKU diferente do atual'; END IF;
    -- O kit nunca pode ser renomeado independentemente da capa. Kits especiais
    -- e componentes não físicos exigem revisão, sem tentar inferir outro par.
    IF v_old.type='kit' THEN
      RAISE EXCEPTION 'Altere o SKU pela capa vinculada; kits especiais exigem revisão administrativa';
    END IF;
    IF v_old.type<>'fisico' AND EXISTS (
      SELECT 1 FROM public.kit_components WHERE component_product_id=v_old.id
    ) THEN
      RAISE EXCEPTION 'Componente de kit especial exige revisão administrativa';
    END IF;
    IF v_old.type='fisico' THEN
      SELECT count(*) INTO v_link_count
      FROM public.kit_components kc
      JOIN public.products k ON k.id=kc.kit_product_id AND k.type='kit'
      WHERE kc.component_product_id=v_old.id;
      IF v_link_count>1 THEN RAISE EXCEPTION 'Produto possui vários kits vinculados; alteração bloqueada'; END IF;
      IF v_link_count=1 THEN
        SELECT kc.kit_product_id INTO v_link_id
        FROM public.kit_components kc
        JOIN public.products k ON k.id=kc.kit_product_id AND k.type='kit'
        WHERE kc.component_product_id=v_old.id
        LIMIT 1;
      END IF;
    ELSE
      v_link_count:=0;
    END IF;
    IF v_link_count=1 THEN
      IF nullif(p_dados->>'linked_product_id','') IS DISTINCT FROM v_link_id::text
         OR p_dados->>'expected_linked_updated_at' IS NULL THEN
        RAISE EXCEPTION 'Atualize o catálogo para confirmar o kit vinculado';
      END IF;
      v_expected_linked:=(p_dados->>'expected_linked_updated_at')::timestamptz;
      SELECT * INTO v_link_old FROM public.products WHERE id=v_link_id FOR UPDATE;
      IF NOT FOUND OR v_link_old.updated_at IS DISTINCT FROM v_expected_linked THEN
        RAISE EXCEPTION 'Kit vinculado foi alterado em outra sessão. Atualize a página';
      END IF;
      IF v_old.sku IN ('CAP-CARTEIRA','CAP-MAGSAFE','CAP-SPACE','CAP-VELUDO')
         OR v_sku IN ('CAP-CARTEIRA','CAP-MAGSAFE','CAP-SPACE','CAP-VELUDO')
         OR v_link_old.sku IS DISTINCT FROM 'KIT-'||v_old.sku
         OR (SELECT count(*) FROM public.kit_components WHERE kit_product_id=v_link_id)<>2
         OR NOT EXISTS (
           SELECT 1 FROM public.kit_components kc
           WHERE kc.kit_product_id=v_link_id AND kc.component_product_id=v_old.id AND kc.quantity=1
         ) OR NOT EXISTS (
           SELECT 1 FROM public.kit_components kc JOIN public.products s ON s.id=kc.component_product_id
           WHERE kc.kit_product_id=v_link_id AND s.type='servico' AND s.sku='SRV-DTF-UV' AND kc.quantity=1
         ) THEN
        RAISE EXCEPTION 'Kit especial ou incoerente exige revisão administrativa';
      END IF;
      v_link_sku:='KIT-'||v_sku;
      IF length(v_link_sku)>100 THEN RAISE EXCEPTION 'SKU da capa excede o limite para gerar o SKU do kit'; END IF;
      -- Compatibilidade com clientes anteriores: só aceita o valor derivado.
      IF p_dados->>'linked_sku' IS NOT NULL
         AND p_dados->>'linked_sku' IS DISTINCT FROM v_link_sku THEN
        RAISE EXCEPTION 'SKU do kit deve ser KIT- seguido do SKU da capa';
      END IF;
      IF v_link_sku=upper(btrim(v_link_old.sku)) OR v_sku=upper(btrim(v_link_old.sku)) THEN
        RAISE EXCEPTION 'Informe um SKU diferente do kit atual';
      END IF;
    ELSIF p_dados->>'linked_sku' IS NOT NULL OR p_dados->>'linked_product_id' IS NOT NULL
       OR p_dados->>'expected_linked_updated_at' IS NOT NULL THEN
      RAISE EXCEPTION 'Este produto não possui kit vinculado para alterar';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.products p
      WHERE upper(btrim(p.sku))=v_sku AND p.id<>v_old.id AND (v_link_count=0 OR p.id<>v_link_id)
    ) OR (v_link_count=1 AND EXISTS (
      SELECT 1 FROM public.products p
      WHERE upper(btrim(p.sku))=v_link_sku AND p.id<>v_old.id AND p.id<>v_link_id
    )) THEN
      RAISE EXCEPTION 'SKU informado já existe, inclusive em produto arquivado';
    END IF;

    UPDATE public.products SET sku=v_sku,updated_at=clock_timestamp()
    WHERE id=v_old.id RETURNING * INTO v_new;
    INSERT INTO public.erp_product_admin_audit(product_id,actor_user_id,action,before_data,after_data,reason)
    VALUES(v_old.id,(SELECT auth.uid()),'alterar_sku',to_jsonb(v_old),to_jsonb(v_new),btrim(p_motivo));
    IF v_link_count=1 THEN
      UPDATE public.products SET sku=v_link_sku,updated_at=clock_timestamp()
      WHERE id=v_link_id RETURNING * INTO v_link_new;
      INSERT INTO public.erp_product_admin_audit(product_id,actor_user_id,action,before_data,after_data,reason)
      VALUES(v_link_id,(SELECT auth.uid()),'alterar_sku',to_jsonb(v_link_old),to_jsonb(v_link_new),btrim(p_motivo));
    END IF;
    RETURN jsonb_build_object('action',p_acao,'id',v_new.id,'sku',v_new.sku,
      'linked_product_id',v_link_id,'linked_sku',v_link_new.sku);
  END IF;

  IF (SELECT count(*) FROM jsonb_object_keys(p_dados))<>1
     OR jsonb_typeof(p_dados->'confirm_sku') IS DISTINCT FROM 'string'
     OR p_dados->>'confirm_sku' IS DISTINCT FROM v_old.sku THEN
    RAISE EXCEPTION 'Digite exatamente o SKU atual para confirmar o arquivamento';
  END IF;
  IF v_old.b2b_site_visible OR EXISTS (
    SELECT 1 FROM public.erp_panda_ia_phone_models m
    WHERE m.published AND (m.kit_product_id=v_old.id OR m.base_product_id=v_old.id)
  ) THEN
    RAISE EXCEPTION 'Despublique o modelo Panda IA antes de arquivar este produto';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.kit_components kc
    JOIN public.products k ON k.id=kc.kit_product_id
    WHERE kc.component_product_id=v_old.id AND k.type='kit' AND k.active
  ) THEN
    RAISE EXCEPTION 'Arquive primeiro os kits ativos vinculados a este produto';
  END IF;
  UPDATE public.products SET active=false,updated_at=clock_timestamp()
  WHERE id=v_old.id RETURNING * INTO v_new;
  INSERT INTO public.erp_product_admin_audit(product_id,actor_user_id,action,before_data,after_data,reason)
  VALUES(v_old.id,(SELECT auth.uid()),'arquivar_produto',to_jsonb(v_old),to_jsonb(v_new),btrim(p_motivo));
  RETURN jsonb_build_object('action',p_acao,'id',v_new.id,'active',v_new.active,
    'updated_at',v_new.updated_at);
END;
$function$;

REVOKE ALL ON FUNCTION private.pamda_admin_produto_acao_impl(uuid,text,timestamp with time zone,jsonb,text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.pamda_admin_produto_acao(
  p_produto_id uuid,
  p_acao text,
  p_expected_updated_at timestamp with time zone,
  p_dados jsonb,
  p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  RETURN private.pamda_admin_produto_acao_impl(
    p_produto_id,p_acao,p_expected_updated_at,p_dados,p_motivo
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.pamda_admin_produto_acao(uuid,text,timestamp with time zone,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pamda_admin_produto_acao(uuid,text,timestamp with time zone,jsonb,text) TO authenticated;

COMMIT;
