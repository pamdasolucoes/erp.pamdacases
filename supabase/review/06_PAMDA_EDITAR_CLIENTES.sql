-- PAMDA CORE: edicao cadastral e auditoria. SOMENTE PARA REVISAO, nao executado pelo ERP.
-- Requer as tabelas oficiais da etapa 03 e a autenticacao ATUAL erp_user_profiles.
-- NAO executar migrations antigas 04/05 como dependencia deste arquivo.
-- Nao cria clientes/unidades, nao altera importacao, codigos ou politicas comerciais.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.customers') IS NULL OR to_regclass('public.customer_branches') IS NULL
     OR to_regclass('public.erp_user_profiles') IS NULL THEN
    RAISE EXCEPTION 'Confira customers, customer_branches e erp_user_profiles antes de aplicar.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
    AND table_name='customers' AND column_name='customer_code' AND data_type='text') THEN
    RAISE EXCEPTION 'Schema divergente: customer_code deve continuar TEXT.';
  END IF;
END;
$$;

CREATE FUNCTION public.pamda_can_edit_customers() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.erp_user_profiles p
    WHERE p.user_id=auth.uid() AND p.active IS TRUE AND p.role='admin_gerencial'
  );
$$;
REVOKE ALL ON FUNCTION public.pamda_can_edit_customers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pamda_can_edit_customers() TO authenticated;

-- Mantem SELECT e suas politicas atuais. A funcao de UPDATE tambem depende delas.
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_branches ENABLE ROW LEVEL SECURITY;
REVOKE UPDATE ON public.customers, public.customer_branches FROM PUBLIC, anon, authenticated;
REVOKE INSERT,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.customers,public.customer_branches FROM PUBLIC,anon,authenticated;
GRANT UPDATE (name,company_name,cpf,cnpj,phone,whatsapp_phone,email,contact_name,notes,active,updated_at)
  ON public.customers TO authenticated;
GRANT UPDATE (name,trade_name,address,number,complement,neighborhood,city,state,zip_code,phone,
  contact_name,notes,active,address_needs_review,updated_at) ON public.customer_branches TO authenticated;

CREATE POLICY pamda_customer_edit_allow ON public.customers FOR UPDATE TO authenticated
  USING (public.pamda_can_edit_customers()) WITH CHECK (public.pamda_can_edit_customers());
CREATE POLICY pamda_customer_edit_guard ON public.customers AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.pamda_can_edit_customers()) WITH CHECK (public.pamda_can_edit_customers());
CREATE POLICY pamda_branch_edit_allow ON public.customer_branches FOR UPDATE TO authenticated
  USING (public.pamda_can_edit_customers()) WITH CHECK (public.pamda_can_edit_customers());
CREATE POLICY pamda_branch_edit_guard ON public.customer_branches AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.pamda_can_edit_customers()) WITH CHECK (public.pamda_can_edit_customers());
CREATE POLICY pamda_customer_no_create ON public.customers AS RESTRICTIVE FOR INSERT TO anon,authenticated WITH CHECK(false);
CREATE POLICY pamda_customer_no_delete ON public.customers AS RESTRICTIVE FOR DELETE TO anon,authenticated USING(false);
CREATE POLICY pamda_branch_no_create ON public.customer_branches AS RESTRICTIVE FOR INSERT TO anon,authenticated WITH CHECK(false);
CREATE POLICY pamda_branch_no_delete ON public.customer_branches AS RESTRICTIVE FOR DELETE TO anon,authenticated USING(false);

CREATE FUNCTION public.pamda_validate_customer_changes(changes jsonb, is_branch boolean)
RETURNS void LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE key text; value jsonb; allowed text[]; nullable text[];
BEGIN
  allowed := CASE WHEN is_branch THEN ARRAY['name','trade_name','address','number','complement',
    'neighborhood','city','state','zip_code','phone','contact_name','notes','active','address_needs_review']
    ELSE ARRAY['name','company_name','cpf','cnpj','phone','whatsapp_phone','email','contact_name','notes','active'] END;
  nullable := CASE WHEN is_branch THEN ARRAY['trade_name','number','complement','notes']
    ELSE ARRAY['company_name','cpf','cnpj','whatsapp_phone','email','notes'] END;
  IF changes IS NULL OR jsonb_typeof(changes) <> 'object' THEN RAISE EXCEPTION 'Alteracoes invalidas.'; END IF;
  FOR key,value IN SELECT * FROM jsonb_each(changes) LOOP
    IF NOT key=ANY(allowed) THEN RAISE EXCEPTION 'Campo protegido ou nao autorizado: %',key; END IF;
    IF key IN ('active','address_needs_review') THEN
      IF jsonb_typeof(value)<>'boolean' THEN RAISE EXCEPTION 'Situacao invalida.'; END IF;
    ELSIF value='null'::jsonb AND key=ANY(nullable) THEN CONTINUE;
    ELSE
      IF jsonb_typeof(value)<>'string' OR length(value#>>'{}')>10000 THEN RAISE EXCEPTION 'Campo cadastral invalido.'; END IF;
      IF key='name' AND btrim(value#>>'{}')='' THEN RAISE EXCEPTION 'Nome obrigatorio.'; END IF;
      IF key='email' AND (value#>>'{}')<>'' AND (value#>>'{}') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
        THEN RAISE EXCEPTION 'Email invalido.'; END IF;
      IF key IN ('cpf','cnpj') AND (value#>>'{}')<>'' AND (
        (value#>>'{}') !~ '^[0-9. /-]+$' OR
        length(regexp_replace(value#>>'{}','[^0-9]','','g')) <> CASE WHEN key='cpf' THEN 11 ELSE 14 END
      ) THEN RAISE EXCEPTION 'Documento invalido.'; END IF;
    END IF;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.pamda_validate_customer_changes(jsonb,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pamda_validate_customer_changes(jsonb,boolean) TO authenticated;

-- Protege inclusive chamadas diretas a API de UPDATE, alem do formulario.
CREATE FUNCTION public.pamda_guard_customer_edit() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE allowed text[]; changes jsonb; is_branch boolean := TG_TABLE_NAME='customer_branches';
BEGIN
  IF NOT public.pamda_can_edit_customers() THEN RAISE EXCEPTION 'Sem permissao de edicao.' USING ERRCODE='42501'; END IF;
  allowed := CASE WHEN is_branch THEN ARRAY['name','trade_name','address','number','complement',
    'neighborhood','city','state','zip_code','phone','contact_name','notes','active','address_needs_review','updated_at']
    ELSE ARRAY['name','company_name','cpf','cnpj','phone','whatsapp_phone','email','contact_name','notes','active','updated_at'] END;
  IF (to_jsonb(NEW)-allowed) IS DISTINCT FROM (to_jsonb(OLD)-allowed) THEN
    RAISE EXCEPTION 'UUID, codigo, vinculos, origem e regras comerciais sao protegidos.' USING ERRCODE='42501';
  END IF;
  SELECT coalesce(jsonb_object_agg(n.key,n.value),'{}'::jsonb) INTO changes
    FROM jsonb_each(to_jsonb(NEW)-'updated_at') n WHERE n.value IS DISTINCT FROM to_jsonb(OLD)->n.key;
  PERFORM public.pamda_validate_customer_changes(changes,is_branch);
  IF is_branch THEN
    IF (to_jsonb(OLD)->>'address_needs_review')::boolean AND NOT (to_jsonb(NEW)->>'address_needs_review')::boolean THEN
      IF current_setting('pamda.reviewed_branch_id',true) IS DISTINCT FROM NEW.id::text THEN
        RAISE EXCEPTION 'Confirme explicitamente a revisao do endereco no formulario.';
      END IF;
      IF btrim(to_jsonb(NEW)->>'address')='' OR btrim(to_jsonb(NEW)->>'city')=''
        OR btrim(to_jsonb(NEW)->>'state')='' OR btrim(to_jsonb(NEW)->>'zip_code')='' THEN
        RAISE EXCEPTION 'Endereco, cidade, estado e CEP obrigatorios para confirmar revisao.';
      END IF;
    END IF;
  END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.pamda_guard_customer_edit() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER pamda_guard_customer_edit BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.pamda_guard_customer_edit();
CREATE TRIGGER pamda_guard_branch_edit BEFORE UPDATE ON public.customer_branches
  FOR EACH ROW EXECUTE FUNCTION public.pamda_guard_customer_edit();

CREATE TABLE public.customer_change_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  entity text NOT NULL CHECK(entity IN ('customers','customer_branches')),
  record_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  changes jsonb NOT NULL
);
CREATE INDEX idx_customer_change_audit_customer ON public.customer_change_audit(customer_id,changed_at);
ALTER TABLE public.customer_change_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_change_audit FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.customer_change_audit TO authenticated;
CREATE POLICY pamda_customer_audit_read ON public.customer_change_audit FOR SELECT TO authenticated
  USING (public.pamda_can_edit_customers());

CREATE FUNCTION public.pamda_audit_customer_edit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE delta jsonb; parent_id uuid;
BEGIN
  SELECT coalesce(jsonb_object_agg(n.key,jsonb_build_object('before',to_jsonb(OLD)->n.key,'after',n.value)),'{}'::jsonb)
    INTO delta FROM jsonb_each(to_jsonb(NEW)-'updated_at') n WHERE n.value IS DISTINCT FROM to_jsonb(OLD)->n.key;
  IF delta<>'{}'::jsonb THEN
    parent_id := CASE WHEN TG_TABLE_NAME='customers' THEN NEW.id ELSE (to_jsonb(NEW)->>'customer_id')::uuid END;
    INSERT INTO public.customer_change_audit(customer_id,entity,record_id,actor_id,changes)
      VALUES(parent_id,TG_TABLE_NAME,NEW.id,auth.uid(),delta);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.pamda_audit_customer_edit() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER pamda_audit_customer_edit AFTER UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.pamda_audit_customer_edit();
CREATE TRIGGER pamda_audit_branch_edit AFTER UPDATE ON public.customer_branches
  FOR EACH ROW EXECUTE FUNCTION public.pamda_audit_customer_edit();

-- SECURITY INVOKER: SELECT/UPDATE e todas as RLS continuam valendo para o JWT atual.
-- Toda a ficha e suas unidades sao salvas em uma unica transacao, com versoes otimistas.
CREATE FUNCTION public.pamda_update_customer(
  p_customer_id uuid, p_expected_updated_at timestamptz, p_changes jsonb, p_branches jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE c public.customers; b public.customer_branches; patch jsonb; entry jsonb; branch_id uuid;
  seen uuid[] := ARRAY[]::uuid[]; branch_rows jsonb;
BEGIN
  IF NOT public.pamda_can_edit_customers() THEN RAISE EXCEPTION 'Sem permissao de edicao.' USING ERRCODE='42501'; END IF;
  PERFORM public.pamda_validate_customer_changes(p_changes,false);
  IF p_branches IS NULL OR jsonb_typeof(p_branches)<>'array' THEN RAISE EXCEPTION 'Unidades invalidas.'; END IF;
  SELECT * INTO c FROM public.customers WHERE id=p_customer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cliente indisponivel para esta conta.' USING ERRCODE='42501'; END IF;
  IF p_expected_updated_at IS DISTINCT FROM c.updated_at THEN RAISE EXCEPTION 'Cadastro alterado. Atualize a lista.' USING ERRCODE='40001'; END IF;
  IF p_changes<>'{}'::jsonb THEN
    c := jsonb_populate_record(c,p_changes);
    UPDATE public.customers SET name=c.name,company_name=c.company_name,cpf=c.cpf,cnpj=c.cnpj,
      phone=c.phone,whatsapp_phone=c.whatsapp_phone,email=c.email,contact_name=c.contact_name,notes=c.notes,active=c.active
      WHERE id=p_customer_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Edicao bloqueada.' USING ERRCODE='42501'; END IF;
  END IF;
  FOR entry IN SELECT * FROM jsonb_array_elements(p_branches) LOOP
    IF jsonb_typeof(entry)<>'object' OR entry->>'id' IS NULL OR entry->>'expected_updated_at' IS NULL
      OR EXISTS(SELECT 1 FROM jsonb_object_keys(entry) k WHERE k NOT IN ('id','expected_updated_at','changes','confirm_address_reviewed'))
      THEN RAISE EXCEPTION 'Unidade ou versao invalida.'; END IF;
    branch_id := (entry->>'id')::uuid;
    IF branch_id=ANY(seen) THEN RAISE EXCEPTION 'Unidade repetida.'; END IF;
    seen := array_append(seen,branch_id);
    patch := entry->'changes';
    PERFORM public.pamda_validate_customer_changes(patch,true);
    SELECT * INTO b FROM public.customer_branches WHERE id=branch_id AND customer_id=p_customer_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Unidade indisponivel ou de outro cliente.' USING ERRCODE='42501'; END IF;
    IF (entry->>'expected_updated_at')::timestamptz IS DISTINCT FROM b.updated_at THEN
      RAISE EXCEPTION 'Unidade alterada. Atualize a lista.' USING ERRCODE='40001';
    END IF;
    PERFORM set_config('pamda.reviewed_branch_id','',true);
    IF patch->'address_needs_review'='false'::jsonb AND b.address_needs_review THEN
      IF entry->'confirm_address_reviewed' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'Confirme explicitamente a revisao do endereco.'; END IF;
      PERFORM set_config('pamda.reviewed_branch_id',branch_id::text,true);
    END IF;
    IF patch<>'{}'::jsonb THEN
      b := jsonb_populate_record(b,patch);
      UPDATE public.customer_branches SET name=b.name,trade_name=b.trade_name,address=b.address,number=b.number,
        complement=b.complement,neighborhood=b.neighborhood,city=b.city,state=b.state,zip_code=b.zip_code,
        phone=b.phone,contact_name=b.contact_name,notes=b.notes,active=b.active,address_needs_review=b.address_needs_review
        WHERE id=branch_id AND customer_id=p_customer_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Edicao da unidade bloqueada.' USING ERRCODE='42501'; END IF;
    END IF;
    PERFORM set_config('pamda.reviewed_branch_id','',true);
  END LOOP;
  SELECT * INTO c FROM public.customers WHERE id=p_customer_id;
  SELECT coalesce(jsonb_agg(to_jsonb(unit) ORDER BY unit.id),'[]'::jsonb) INTO branch_rows
    FROM public.customer_branches unit WHERE unit.customer_id=p_customer_id;
  RETURN jsonb_build_object('customer',to_jsonb(c),'branches',branch_rows);
END;
$$;
REVOKE ALL ON FUNCTION public.pamda_update_customer(uuid,timestamptz,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pamda_update_customer(uuid,timestamptz,jsonb,jsonb) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
