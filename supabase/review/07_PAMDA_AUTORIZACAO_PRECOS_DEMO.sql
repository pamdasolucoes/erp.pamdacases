-- PARA REVISAO. Executar somente apos aprovacao no projeto existente erp-pamda.
-- Autorizacao EXCLUSIVA de simulacao: nao grava venda, catalogo ou aprovacao oficial.
-- Custos/precos do catalogo demo sao declarados pelo navegador e NAO sao confiaveis
-- para uma venda oficial. A futura confirmacao deve reler o catalogo no servidor,
-- recalcular custos/totais e gravar snapshots/aprovacao vinculados atomicamente.
-- Nao depende das migrations antigas 04/05 nem da migration de clientes 06.
BEGIN;

CREATE FUNCTION public.pamda_demo_pricing_integer(value jsonb, nullable boolean DEFAULT false)
RETURNS bigint LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE result numeric;
BEGIN
  IF nullable AND value='null'::jsonb THEN RETURN NULL; END IF;
  IF value IS NULL OR jsonb_typeof(value)<>'number' OR value::text !~ '^[0-9]+$' THEN
    RAISE EXCEPTION 'Valor monetario ou quantidade invalida.';
  END IF;
  result := value::text::numeric;
  IF result>9007199254740991 THEN RAISE EXCEPTION 'Precisao excedida.'; END IF;
  RETURN result::bigint;
END;
$$;
REVOKE ALL ON FUNCTION public.pamda_demo_pricing_integer(jsonb,boolean) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.pamda_demo_component_micros(components jsonb, depth integer DEFAULT 0)
RETURNS bigint LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE item jsonb; cost bigint; quantity numeric; total numeric := 0;
BEGIN
  IF depth>16 OR components IS NULL OR jsonb_typeof(components)<>'array' OR jsonb_array_length(components)>1000
    THEN RAISE EXCEPTION 'Composicao invalida.'; END IF;
  FOR item IN SELECT * FROM jsonb_array_elements(components) LOOP
    cost := public.pamda_demo_pricing_integer(item->'unitCostMicros');
    IF item->'quantity' IS NULL OR jsonb_typeof(item->'quantity')<>'number' THEN RAISE EXCEPTION 'Quantidade de componente invalida.'; END IF;
    quantity := (item->>'quantity')::numeric;
    IF quantity<=0 OR quantity<>round(quantity,6) OR quantity*1000000>9007199254740991 THEN RAISE EXCEPTION 'Quantidade de componente invalida.'; END IF;
    IF item->'components' IS NULL OR jsonb_typeof(item->'components')<>'array' THEN RAISE EXCEPTION 'Composicao invalida.'; END IF;
    IF jsonb_array_length(item->'components')>0 AND cost<>public.pamda_demo_component_micros(item->'components',depth+1)
      THEN RAISE EXCEPTION 'Custo de componente divergente.'; END IF;
    total := total + round(cost*quantity);
    IF total>9007199254740991 THEN RAISE EXCEPTION 'Precisao excedida.'; END IF;
  END LOOP;
  RETURN total::bigint;
END;
$$;
REVOKE ALL ON FUNCTION public.pamda_demo_component_micros(jsonb,integer) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.pamda_authorize_demo_pricing(p_draft jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid := auth.uid(); actor_name text; item jsonb; snap jsonb;
  quantity bigint; price bigint; original_price bigint; direct_micros bigint; managerial_micros bigint;
  gross numeric := 0; discount bigint; allocated bigint; net bigint; direct_cost bigint; managerial_cost bigint;
  base_allocated numeric := 0; left_over bigint; ranked record; requires_review boolean := false;
BEGIN
  -- Identidade real e perfil atual do banco; nao aceita role/usuario enviados no payload.
  SELECT username INTO actor_name FROM public.erp_user_profiles
    WHERE user_id=actor AND active IS TRUE AND role='admin_gerencial';
  IF actor IS NULL OR actor_name IS NULL OR btrim(actor_name)='' THEN
    RAISE EXCEPTION 'Somente administrador ativo pode autorizar.' USING ERRCODE='42501';
  END IF;
  IF p_draft IS NULL OR jsonb_typeof(p_draft)<>'object'
    OR p_draft->'version' IS DISTINCT FROM '1'::jsonb OR p_draft->>'scope' IS DISTINCT FROM 'demo_only'
    OR p_draft->>'revision' IS NULL OR jsonb_typeof(p_draft->'items') IS DISTINCT FROM 'array'
    THEN RAISE EXCEPTION 'Contrato de simulacao invalido. Venda oficial permanece bloqueada.'; END IF;
  PERFORM (p_draft->>'revision')::uuid;
  IF octet_length(p_draft::text)>1000000 OR jsonb_array_length(p_draft->'items') NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'Preparacao invalida ou muito extensa.';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_draft) k WHERE k NOT IN
    ('version','revision','scope','customerId','branchId','items','additionalDiscountCents','discountReason')) THEN
    RAISE EXCEPTION 'Campo nao autorizado.';
  END IF;
  IF p_draft->>'customerId' IS NOT NULL THEN PERFORM (p_draft->>'customerId')::uuid; END IF;
  IF p_draft->>'branchId' IS NOT NULL THEN PERFORM (p_draft->>'branchId')::uuid; END IF;
  IF (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(p_draft->'items'))<>jsonb_array_length(p_draft->'items') THEN
    RAISE EXCEPTION 'Item repetido ou sem identificador.';
  END IF;
  discount := public.pamda_demo_pricing_integer(p_draft->'additionalDiscountCents');
  IF jsonb_typeof(p_draft->'discountReason') IS DISTINCT FROM 'string' OR length(p_draft->>'discountReason')>1000 THEN
    RAISE EXCEPTION 'Motivo invalido.';
  END IF;
  IF discount>0 AND btrim(p_draft->>'discountReason')='' THEN RAISE EXCEPTION 'Informe motivo do desconto adicional.'; END IF;
  FOR item IN SELECT * FROM jsonb_array_elements(p_draft->'items') LOOP
    PERFORM (item->>'id')::uuid;
    quantity := public.pamda_demo_pricing_integer(item->'quantity');
    IF quantity<1 THEN RAISE EXCEPTION 'Quantidade deve ser positiva.'; END IF;
    price := public.pamda_demo_pricing_integer(item->'unitPriceCents');
    snap := item->'snapshot';
    IF jsonb_typeof(snap) IS DISTINCT FROM 'object' OR snap->>'catalogSource' IS DISTINCT FROM 'demo'
      OR snap->>'productType' NOT IN ('fisico','servico','kit','insumo') OR snap->>'productType' IS NULL
      THEN RAISE EXCEPTION 'Snapshot invalido. Somente catalogo de demonstracao.'; END IF;
    original_price := public.pamda_demo_pricing_integer(snap->'originalUnitPriceCents');
    direct_micros := public.pamda_demo_pricing_integer(snap->'directUnitCostMicros');
    managerial_micros := public.pamda_demo_pricing_integer(snap->'managerialUnitCostMicros',true);
    IF jsonb_typeof(snap->'components') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Composicao invalida.'; END IF;
    IF snap->>'productType'='kit' THEN
      IF jsonb_array_length(snap->'components')=0 OR direct_micros<>public.pamda_demo_component_micros(snap->'components') THEN
        RAISE EXCEPTION 'Custo direto deve corresponder aos componentes do kit.';
      END IF;
    END IF;
    IF jsonb_typeof(item->'reason') IS DISTINCT FROM 'string' OR length(item->>'reason')>1000 THEN RAISE EXCEPTION 'Motivo invalido.'; END IF;
    gross := gross + price::numeric*quantity;
    IF gross>9007199254740991 OR original_price::numeric*quantity>9007199254740991
      OR direct_micros::numeric*quantity/10000>9007199254740991
      OR managerial_micros::numeric*quantity/10000>9007199254740991 THEN RAISE EXCEPTION 'Precisao excedida.'; END IF;
  END LOOP;
  IF discount>gross THEN RAISE EXCEPTION 'Desconto excede subtotal negociado.'; END IF;
  IF gross>0 THEN
    SELECT sum(trunc(discount::numeric*(value->>'unitPriceCents')::numeric*(value->>'quantity')::numeric/gross))
      INTO base_allocated FROM jsonb_array_elements(p_draft->'items');
  END IF;
  left_over := discount-base_allocated;
  FOR ranked IN SELECT value, ordinality, row_number() OVER (ORDER BY
      CASE WHEN gross>0 THEN mod(discount::numeric*(value->>'unitPriceCents')::numeric*(value->>'quantity')::numeric,gross) ELSE 0 END DESC,ordinality) AS position
    FROM jsonb_array_elements(p_draft->'items') WITH ORDINALITY LOOP
    item := ranked.value; snap := item->'snapshot';
    quantity := (item->>'quantity')::bigint; price := (item->>'unitPriceCents')::bigint;
    allocated := CASE WHEN gross>0 THEN trunc(discount::numeric*price*quantity/gross)::bigint ELSE 0 END;
    IF ranked.position<=left_over THEN allocated := allocated+1; END IF;
    net := price*quantity-allocated;
    direct_cost := round((snap->>'directUnitCostMicros')::numeric*quantity/10000)::bigint;
    managerial_cost := CASE WHEN snap->'managerialUnitCostMicros'='null'::jsonb THEN NULL
      ELSE round((snap->>'managerialUnitCostMicros')::numeric*quantity/10000)::bigint END;
    IF public.pamda_demo_pricing_integer(item->'additionalDiscountCents')<>allocated
      OR public.pamda_demo_pricing_integer(item->'netCents')<>net
      OR public.pamda_demo_pricing_integer(item->'directCostCents')<>direct_cost
      OR public.pamda_demo_pricing_integer(item->'managerialCostCents',true) IS DISTINCT FROM managerial_cost THEN
      RAISE EXCEPTION 'Totais ou custos divergentes do calculo do servidor.';
    END IF;
    IF net<direct_cost OR net<managerial_cost THEN
      requires_review := true;
      IF btrim(item->>'reason')='' THEN RAISE EXCEPTION 'Informe motivo da negociacao abaixo do custo.'; END IF;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('scope','demo_only','official_sale_allowed',false,'revision',p_draft->>'revision',
    'authorized_at',clock_timestamp(),'authorized_by',jsonb_build_object('id',actor,'username',actor_name),
    'requires_managerial_authorization',requires_review);
END;
$$;
REVOKE ALL ON FUNCTION public.pamda_authorize_demo_pricing(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pamda_authorize_demo_pricing(jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
