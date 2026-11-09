-- Basic creation only. No profile, permission, RLS or other RPC changes.
BEGIN;
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
    -- Resolve active profile and individual overrides on the server.
    IF auth.uid() IS NULL OR NOT coalesce(public.pamda_has_permission('products.manage'), false) THEN
        RAISE EXCEPTION 'Acesso não autorizado' USING ERRCODE = '42501';
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


REVOKE ALL ON FUNCTION public.pamda_cadastrar_item_basico(text,text,text,text,text,text,numeric,numeric,numeric,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pamda_cadastrar_item_basico(text,text,text,text,text,text,numeric,numeric,numeric,boolean,text) TO authenticated;

COMMIT;
