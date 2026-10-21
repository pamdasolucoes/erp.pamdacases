CREATE OR REPLACE FUNCTION public.pamda_admin_criar_capa_com_kit(p_modelo text, p_marca text, p_sku_capa text, p_preco_capa numeric, p_preco_kit numeric, p_custo_capa numeric DEFAULT NULL::numeric, p_custo_gerencial_capa numeric DEFAULT NULL::numeric, p_custo_gerencial_kit numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_model text;v_brand text;v_case_id uuid;v_case_code text;v_case_sku text;
 v_kit_id uuid;v_kit_code text;v_kit_sku text;v_service_id uuid;
BEGIN
 IF NOT public.pamda_is_admin() THEN RAISE EXCEPTION 'Somente administrador pode cadastrar produtos' USING ERRCODE='42501'; END IF;
 v_model:=btrim(coalesce(p_modelo,''));
 v_brand:=btrim(coalesce(p_marca,''));
 IF length(v_model) NOT BETWEEN 2 AND 160 OR length(v_brand) NOT BETWEEN 2 AND 100
    OR length(btrim(coalesce(p_sku_capa,''))) NOT BETWEEN 2 AND 100 THEN
   RAISE EXCEPTION 'Informe modelo, marca e SKU válidos';
 END IF;
 IF p_preco_capa IS NULL OR p_preco_capa<=0 OR p_preco_kit IS NULL OR p_preco_kit<=0
    OR p_preco_kit < p_preco_capa
    OR (p_custo_capa IS NOT NULL AND p_custo_capa<0)
    OR (p_custo_gerencial_capa IS NOT NULL AND p_custo_gerencial_capa<0)
    OR (p_custo_gerencial_kit IS NOT NULL AND p_custo_gerencial_kit<0)
 THEN RAISE EXCEPTION 'Preços e custos inválidos; confirme valores reais'; END IF;
 SELECT id INTO v_service_id FROM public.products WHERE sku='SRV-DTF-UV' AND type='servico' AND active;
 IF v_service_id IS NULL THEN RAISE EXCEPTION 'Serviço SRV-DTF-UV não configurado'; END IF;
 IF EXISTS(SELECT 1 FROM public.products WHERE upper(btrim(sku))=upper(btrim(p_sku_capa))
  OR upper(btrim(sku))='KIT-'||upper(btrim(p_sku_capa))) THEN
   RAISE EXCEPTION 'SKU da capa ou do kit já existe';
 END IF;
 SELECT produto_id,codigo,sku INTO v_case_id,v_case_code,v_case_sku
 FROM public.pamda_cadastrar_item_basico('fisico','Capa TPU transparente - '||v_model,
    p_sku_capa,'Capas TPU Transparente',v_brand,v_model,
    p_custo_capa,p_preco_capa,p_custo_gerencial_capa,false,NULL);
 SELECT kit_id,codigo,sku INTO v_kit_id,v_kit_code,v_kit_sku
 FROM public.pamda_cadastrar_kit(v_case_id,v_service_id,p_preco_kit,p_custo_gerencial_kit);
 INSERT INTO public.erp_panda_ia_phone_models(
  kit_product_id,base_product_id,model_label,brand,source,updated_by
 ) VALUES(v_kit_id,v_case_id,v_model,v_brand,'erp_manual',(SELECT auth.uid()));
 INSERT INTO public.erp_product_admin_audit(product_id,actor_user_id,action,after_data,reason)
 VALUES
 (v_case_id,(SELECT auth.uid()),'cadastrar_capa_base',
  jsonb_build_object('code',v_case_code,'sku',v_case_sku,'model',v_model,'brand',v_brand,
   'unit_price',p_preco_capa),'Cadastro manual para homologação'),
 (v_kit_id,(SELECT auth.uid()),'cadastrar_kit_personalizado',
  jsonb_build_object('code',v_kit_code,'sku',v_kit_sku,'case_id',v_case_id,
   'service_id',v_service_id,'unit_price',p_preco_kit),
  'Kit vinculado à capa e ao serviço DTF UV');
 RETURN jsonb_build_object(
  'case_id',v_case_id,'case_code',v_case_code,'case_sku',v_case_sku,
  'kit_id',v_kit_id,'kit_code',v_kit_code,'kit_sku',v_kit_sku,
  'model',v_model,'published',false,'stock_verified',false
 );
END;
$function$;

CREATE OR REPLACE FUNCTION public.pamda_admin_editar_produto(p_produto_id uuid, p_expected_updated_at timestamp with time zone, p_changes jsonb, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_old public.products%ROWTYPE;v_new public.products%ROWTYPE;v_bad text;v_k text;
 v_active boolean;
BEGIN
 IF NOT public.pamda_is_admin() THEN RAISE EXCEPTION 'Somente administrador pode editar produtos' USING ERRCODE='42501'; END IF;
 IF p_produto_id IS NULL OR p_expected_updated_at IS NULL OR
    p_changes IS NULL OR jsonb_typeof(p_changes)<>'object' OR
    p_changes='{}'::jsonb OR length(btrim(coalesce(p_motivo,'')))<5 THEN
  RAISE EXCEPTION 'Produto, versão, alteração e motivo são obrigatórios';
 END IF;
 SELECT key INTO v_bad FROM jsonb_object_keys(p_changes) AS key
 WHERE key NOT IN('name','description','category','brand','model_phone',
   'current_cost','managerial_cost','sale_price','image_url','active')
 LIMIT 1;
 IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'Campo não editável nesta tela: %',v_bad; END IF;
 SELECT * INTO v_old FROM public.products WHERE id=p_produto_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Produto não encontrado'; END IF;
 IF v_old.updated_at IS DISTINCT FROM p_expected_updated_at THEN
  RAISE EXCEPTION 'Produto foi alterado em outra sessão. Atualize a página';
 END IF;
 IF (p_changes ? 'name' AND length(btrim(coalesce(p_changes->>'name','')))<2)
  OR (p_changes ? 'category' AND btrim(coalesce(p_changes->>'category',''))='')
  OR (p_changes ? 'brand' AND btrim(coalesce(p_changes->>'brand',''))='') THEN
  RAISE EXCEPTION 'Nome, categoria ou marca inválidos';
 END IF;
 IF p_changes ? 'active' AND jsonb_typeof(p_changes->'active')<>'boolean' THEN
   RAISE EXCEPTION 'Ativo deve ser booleano';
 END IF;
 v_active:=CASE WHEN p_changes ? 'active' THEN (p_changes->>'active')::boolean ELSE v_old.active END;
 IF NOT v_active AND (
  EXISTS(SELECT 1 FROM public.erp_panda_ia_phone_models m WHERE m.published
    AND (m.kit_product_id=v_old.id OR m.base_product_id=v_old.id))
  OR EXISTS(SELECT 1 FROM public.products k JOIN public.kit_components kc ON kc.kit_product_id=k.id
    WHERE kc.component_product_id=v_old.id AND k.active AND k.b2b_site_visible)
 ) THEN RAISE EXCEPTION 'Despublique primeiro o modelo/kit antes de inativar a capa'; END IF;
 IF p_changes ? 'model_phone' AND EXISTS(
  SELECT 1 FROM public.erp_panda_ia_phone_models m WHERE m.kit_product_id=v_old.id AND m.published
 ) THEN RAISE EXCEPTION 'Despublique o modelo antes de alterar sua referência'; END IF;
 UPDATE public.products SET
  name=CASE WHEN p_changes ? 'name' THEN btrim(p_changes->>'name') ELSE name END,
  description=CASE WHEN p_changes ? 'description' THEN p_changes->>'description' ELSE description END,
  category=CASE WHEN p_changes ? 'category' THEN btrim(p_changes->>'category') ELSE category END,
  brand=CASE WHEN p_changes ? 'brand' THEN btrim(p_changes->>'brand') ELSE brand END,
  model_phone=CASE WHEN p_changes ? 'model_phone' THEN nullif(btrim(coalesce(p_changes->>'model_phone','')),'') ELSE model_phone END,
  current_cost=CASE WHEN p_changes ? 'current_cost' THEN (p_changes->>'current_cost')::numeric ELSE current_cost END,
  managerial_cost=CASE WHEN p_changes ? 'managerial_cost' THEN (p_changes->>'managerial_cost')::numeric ELSE managerial_cost END,
  sale_price=CASE WHEN p_changes ? 'sale_price' THEN (p_changes->>'sale_price')::numeric ELSE sale_price END,
  image_url=CASE WHEN p_changes ? 'image_url' THEN nullif(btrim(coalesce(p_changes->>'image_url','')),'') ELSE image_url END,
  active=v_active,updated_at=clock_timestamp()
 WHERE id=p_produto_id
 RETURNING * INTO v_new;
 INSERT INTO public.erp_product_admin_audit(product_id,actor_user_id,action,before_data,after_data,reason)
 VALUES(p_produto_id,(SELECT auth.uid()),'editar_produto',to_jsonb(v_old),to_jsonb(v_new),btrim(p_motivo));
 RETURN jsonb_build_object('id',v_new.id,'code',v_new.code,'sku',v_new.sku,
   'type',v_new.type,'updated_at',v_new.updated_at);
END;
$function$;

CREATE OR REPLACE FUNCTION public.pamda_admin_salvar_modelo_panda_ia(p_kit_id uuid, p_nome text, p_marca text, p_imagem_url text, p_mascara_url text, p_conferido boolean, p_publicar boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_kit public.products%ROWTYPE;v_base uuid;v_before jsonb;v_new jsonb;
 v_body text;v_mask text;
BEGIN
 IF NOT public.pamda_is_admin() THEN RAISE EXCEPTION 'Acesso restrito ao administrador' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_kit FROM public.products WHERE id=p_kit_id AND type='kit' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Kit não encontrado'; END IF;
 SELECT p.id INTO v_base FROM public.kit_components kc
 JOIN public.products p ON p.id=kc.component_product_id
 WHERE kc.kit_product_id=p_kit_id AND p.type='fisico';
 IF v_base IS NULL THEN RAISE EXCEPTION 'Kit sem capa-base física'; END IF;
 IF length(btrim(coalesce(p_nome,''))) NOT BETWEEN 2 AND 160 OR
  length(btrim(coalesce(p_marca,''))) NOT BETWEEN 2 AND 100 OR
  p_conferido IS NULL OR p_publicar IS NULL THEN RAISE EXCEPTION 'Modelo, marca ou confirmação inválidos'; END IF;
 v_body:=nullif(btrim(coalesce(p_imagem_url,'')),'');
 v_mask:=nullif(btrim(coalesce(p_mascara_url,'')),'');
 IF (v_body IS NOT NULL AND (v_body !~* '^https://[^[:space:]]+$' OR length(v_body)>2000))
  OR (v_mask IS NOT NULL AND (v_mask !~* '^https://[^[:space:]]+$' OR length(v_mask)>2000)) THEN
   RAISE EXCEPTION 'URLs de imagem ou máscara inválidas';
 END IF;
 IF p_publicar AND (NOT p_conferido OR v_body IS NULL OR v_mask IS NULL OR
  NOT v_kit.active OR v_kit.sale_price IS NULL) THEN
  RAISE EXCEPTION 'Para publicar, confirme visualmente imagem e máscara e configure kit ativo com preço';
 END IF;
 SELECT to_jsonb(t) INTO v_before FROM public.erp_panda_ia_phone_models t WHERE kit_product_id=p_kit_id;
 INSERT INTO public.erp_panda_ia_phone_models(
  kit_product_id,base_product_id,model_label,brand,body_url,mask_url,
  technical_verified,published,source,updated_by
 ) VALUES(p_kit_id,v_base,btrim(p_nome),btrim(p_marca),
          v_body,v_mask,p_conferido,p_publicar,'erp_manual',(SELECT auth.uid()))
 ON CONFLICT(kit_product_id) DO UPDATE SET
  base_product_id=excluded.base_product_id,model_label=excluded.model_label,
  brand=excluded.brand,body_url=excluded.body_url,mask_url=excluded.mask_url,
  technical_verified=excluded.technical_verified,published=excluded.published,
  source=excluded.source,updated_by=excluded.updated_by,updated_at=now();
 UPDATE public.products SET b2b_site_visible=p_publicar,updated_at=now()
 WHERE id=p_kit_id AND b2b_site_visible IS DISTINCT FROM p_publicar;
 SELECT to_jsonb(t) INTO v_new FROM public.erp_panda_ia_phone_models t WHERE kit_product_id=p_kit_id;
 INSERT INTO public.erp_product_admin_audit(product_id,actor_user_id,action,before_data,after_data)
 VALUES(p_kit_id,(SELECT auth.uid()),'salvar_modelo_panda_ia',v_before,v_new);
 RETURN jsonb_build_object('kit_id',p_kit_id,'published',p_publicar,'model',v_new);
END;
$function$;

CREATE OR REPLACE FUNCTION public.pamda_cadastrar_item_basico(p_tipo text, p_nome text, p_sku text, p_categoria text DEFAULT NULL::text, p_marca text DEFAULT NULL::text, p_modelo text DEFAULT NULL::text, p_custo numeric DEFAULT NULL::numeric, p_preco numeric DEFAULT NULL::numeric, p_custo_gerencial numeric DEFAULT NULL::numeric, p_especial boolean DEFAULT false, p_imagem text DEFAULT NULL::text)
 RETURNS TABLE(produto_id uuid, codigo text, sku text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_codigo BIGINT;
    v_produto_id UUID;
    v_sku TEXT;
BEGIN
    -- Verificar administrador autenticado.
    IF auth.uid() IS NULL OR NOT EXISTS (
        SELECT 1
        FROM public.erp_user_profiles p
        WHERE p.user_id = auth.uid()
          AND p.role = 'admin_gerencial'
          AND p.active = TRUE
    ) THEN
        RAISE EXCEPTION 'Acesso não autorizado'
            USING ERRCODE = '42501';
    END IF;

    -- Kits terão função própria, com componentes.
    IF p_tipo NOT IN ('fisico', 'servico', 'insumo') THEN
        RAISE EXCEPTION 'Tipo de produto inválido';
    END IF;

    IF p_especial AND p_tipo <> 'fisico' THEN
        RAISE EXCEPTION
            'Somente capas físicas podem usar a faixa especial';
    END IF;

    IF NULLIF(BTRIM(p_nome), '') IS NULL
       OR NULLIF(BTRIM(p_sku), '') IS NULL THEN
        RAISE EXCEPTION 'Nome e SKU são obrigatórios';
    END IF;

    IF p_custo < 0
       OR p_preco < 0
       OR p_custo_gerencial < 0 THEN
        RAISE EXCEPTION 'Custos e preços não podem ser negativos';
    END IF;

    v_sku := UPPER(BTRIM(p_sku));

    -- Selecionar a faixa numérica correta.
    IF p_tipo = 'servico' THEN
        v_codigo := nextval(
            'public.pamda_codigo_servicos_seq'::regclass
        );

    ELSIF p_especial THEN
        v_codigo := nextval(
            'public.pamda_codigo_especiais_seq'::regclass
        );

    ELSE
        v_codigo := nextval(
            'public.pamda_codigo_produtos_seq'::regclass
        );
    END IF;

    -- Novo registro, com estoque inicial zero.
    INSERT INTO public.products (
        code,
        sku,
        name,
        category,
        brand,
        model_phone,
        type,
        current_cost,
        managerial_cost,
        sale_price,
        controls_inventory,
        current_inventory,
        min_inventory,
        stock_verified,
        image_url,
        active,
        b2b_site_visible
    )
    VALUES (
        v_codigo::TEXT,
        v_sku,
        BTRIM(p_nome),
        COALESCE(
            NULLIF(BTRIM(p_categoria), ''),
            CASE
                WHEN p_tipo = 'servico'
                THEN 'Serviços'
                ELSE 'Capas'
            END
        ),
        COALESCE(NULLIF(BTRIM(p_marca), ''), 'Pamda'),
        NULLIF(BTRIM(p_modelo), ''),
        p_tipo,
        p_custo,
        p_custo_gerencial,
        p_preco,
        p_tipo IN ('fisico', 'insumo'),
        0,
        0,
        FALSE,
        p_imagem,
        TRUE,
        FALSE
    )
    RETURNING id INTO v_produto_id;

    RETURN QUERY
    SELECT v_produto_id, v_codigo::TEXT, v_sku;
END;
$function$;

CREATE OR REPLACE FUNCTION public.pamda_cadastrar_kit(p_capa_id uuid, p_servico_id uuid, p_preco_venda numeric DEFAULT NULL::numeric, p_custo_gerencial numeric DEFAULT NULL::numeric)
 RETURNS TABLE(kit_id uuid, codigo text, sku text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_capa public.products%ROWTYPE;
    v_servico public.products%ROWTYPE;
    v_codigo BIGINT;
    v_nome TEXT;
    v_sku TEXT;
    v_modelo TEXT;
    v_preco NUMERIC;
    v_custo NUMERIC;
    v_kit_id UUID;
BEGIN
    -- Somente administrador ativo
    IF auth.uid() IS NULL OR NOT EXISTS (
        SELECT 1
        FROM public.erp_user_profiles p
        WHERE p.user_id = auth.uid()
          AND p.role = 'admin_gerencial'
          AND p.active = TRUE
    ) THEN
        RAISE EXCEPTION 'Acesso não autorizado'
            USING ERRCODE = '42501';
    END IF;

    IF p_preco_venda < 0 OR p_custo_gerencial < 0 THEN
        RAISE EXCEPTION 'Custos e preços inválidos';
    END IF;

    -- Buscar capa física
    SELECT *
    INTO v_capa
    FROM public.products
    WHERE id = p_capa_id
      AND type = 'fisico'
      AND active = TRUE
    FOR SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Capa física não encontrada';
    END IF;

    -- Buscar serviço
    SELECT *
    INTO v_servico
    FROM public.products
    WHERE id = p_servico_id
      AND type = 'servico'
      AND active = TRUE
    FOR SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Serviço não encontrado';
    END IF;

    IF v_capa.code !~ '^[0-9]+$'
       OR v_capa.code::BIGINT NOT BETWEEN 101 AND 19999
    THEN
        RAISE EXCEPTION 'Código físico fora da faixa permitida';
    END IF;

    -- Caso especial: capa carteira
    IF v_capa.sku = 'CAP-CARTEIRA' THEN

        IF v_servico.sku = 'SRV-DTF-CARTEIRA-1F' THEN
            v_codigo := 20000 + v_capa.code::BIGINT;
            v_sku := 'KIT-CARTEIRA-1F';
            v_nome := 'Capa Carteira em Couro Sintético Personalizada - 1 face';
            v_preco := 45;

        ELSIF v_servico.sku = 'SRV-DTF-CARTEIRA-2F' THEN
            v_codigo := 40000 + v_capa.code::BIGINT;
            v_sku := 'KIT-CARTEIRA-2F';
            v_nome := 'Capa Carteira em Couro Sintético Personalizada - 2 faces';
            v_preco := 60;

        ELSE
            RAISE EXCEPTION 'Serviço incompatível com capa carteira';
        END IF;

    ELSE
        -- Kits normais utilizam a impressão interna.
        IF v_servico.sku <> 'SRV-DTF-UV' THEN
            RAISE EXCEPTION 'Serviço incompatível com a capa';
        END IF;

        v_codigo := 20000 + v_capa.code::BIGINT;

        CASE v_capa.sku
            WHEN 'CAP-MAGSAFE' THEN
                v_sku := 'KIT-MAGSAFE';
                v_nome := 'Capa personalizada MagSafe';
                v_preco := 35;

            WHEN 'CAP-SPACE' THEN
                v_sku := 'KIT-SPACE';
                v_nome := 'Capa personalizada Space';
                v_preco := 35;

            WHEN 'CAP-VELUDO' THEN
                v_sku := 'KIT-VELUDO';
                v_nome := 'Capa personalizada Veludo';
                v_preco := 35;

            ELSE
                v_sku := 'KIT-' || v_capa.sku;

                v_modelo := COALESCE(
                    NULLIF(BTRIM(v_capa.model_phone), ''),
                    NULLIF(
                        BTRIM(SPLIT_PART(v_capa.name, ' - ', 2)),
                        ''
                    )
                );

                IF v_modelo IS NULL THEN
                    RAISE EXCEPTION 'Modelo da capa não informado';
                END IF;

                v_nome :=
                    'Capa personalizada TPU transparente - '
                    || v_modelo;

                IF v_capa.code::BIGINT BETWEEN 101 AND 200 THEN
                    v_preco := NULL;
                ELSE
                    v_preco := 25;
                END IF;
        END CASE;
    END IF;

    -- Permitir preço específico informado pelo administrador.
    v_preco := COALESCE(p_preco_venda, v_preco);

    IF v_preco IS NULL THEN
        RAISE EXCEPTION 'Informe o preço deste kit especial';
    END IF;

    -- Não transformar custos desconhecidos em zero.
    IF v_capa.current_cost IS NOT NULL
       AND v_servico.current_cost IS NOT NULL THEN
        v_custo :=
            v_capa.current_cost + v_servico.current_cost;
    ELSE
        v_custo := NULL;
    END IF;

    -- Criar o kit oficial.
    INSERT INTO public.products (
        code, sku, name, description,
        category, brand, model_phone,
        type, current_cost, managerial_cost,
        sale_price, controls_inventory,
        current_inventory, min_inventory,
        stock_verified, image_url,
        active, b2b_site_visible
    )
    VALUES (
        v_codigo::TEXT,
        v_sku,
        v_nome,
        'Kit composto: ' || v_capa.name ||
            ' + ' || v_servico.name,
        'Kits Personalizados',
        'Pamda',
        v_capa.model_phone,
        'kit',
        v_custo,
        p_custo_gerencial,
        v_preco,
        FALSE,
        0,
        0,
        FALSE,
        v_capa.image_url,
        TRUE,
        FALSE
    )
    RETURNING id INTO v_kit_id;

    -- Relacionar a capa física.
    INSERT INTO public.kit_components (
        kit_product_id,
        component_product_id,
        quantity,
        sort_order
    )
    VALUES (v_kit_id, v_capa.id, 1, 1);

    -- Relacionar a impressão.
    INSERT INTO public.kit_components (
        kit_product_id,
        component_product_id,
        quantity,
        sort_order
    )
    VALUES (v_kit_id, v_servico.id, 1, 2);

    RETURN QUERY
    SELECT v_kit_id, v_codigo::TEXT, v_sku;
END;
$function$;

CREATE OR REPLACE FUNCTION public.pamda_is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ SELECT EXISTS (
 SELECT 1 FROM public.erp_user_profiles p
 WHERE p.user_id=(SELECT auth.uid()) AND p.active AND p.role='admin_gerencial'
); $function$;

