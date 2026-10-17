-- Fixture em memoria: DDL das tabelas da migration 03 fornecida pelo usuario.
-- Nao e migration de producao. O teste nao conecta ao Supabase.
CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_code text NOT NULL UNIQUE CHECK (btrim(customer_code) <> ''),
  name text NOT NULL CHECK (btrim(name) <> ''),
  company_name text, cnpj text, cpf text, cpf_cnpj_original text,
  state_registration text, legacy_person_type text,
  phone text NOT NULL DEFAULT '', mobile_phone text, whatsapp_phone text,
  email text, contact_name text NOT NULL DEFAULT '', reference_name text, reference_phone text,
  legacy_registered_on date, legacy_last_purchase_on date, legacy_registered_raw text, legacy_last_purchase_raw text,
  notes text, active boolean NOT NULL DEFAULT true, is_chain boolean NOT NULL DEFAULT false,
  customer_kind text NOT NULL DEFAULT 'a_classificar', billing_mode text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.customer_branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  name text NOT NULL DEFAULT 'Unidade do cadastro original', trade_name text,
  address text NOT NULL DEFAULT '', number text, complement text,
  neighborhood text NOT NULL DEFAULT '', city text NOT NULL DEFAULT '', state text NOT NULL DEFAULT '', zip_code text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '', contact_name text NOT NULL DEFAULT '', notes text,
  active boolean NOT NULL DEFAULT true, override_policy jsonb, address_needs_review boolean NOT NULL DEFAULT false,
  import_source_customer_code text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION public.pamda_protect_customer_code()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF NEW.customer_code IS DISTINCT FROM OLD.customer_code THEN
    RAISE EXCEPTION 'Codigo comercial imutavel. Cliente: %', OLD.customer_code;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_pamda_protect_customer_code BEFORE UPDATE ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.pamda_protect_customer_code();
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_branches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customers, public.customer_branches FROM PUBLIC, anon, authenticated;

CREATE TABLE public.pamda_clientes_importacao (legacy_code text PRIMARY KEY, nome text);
INSERT INTO public.pamda_clientes_importacao SELECT lpad(i::text, 6, '0'), 'Cliente teste ' || i FROM generate_series(1,384) i;
INSERT INTO public.customers (customer_code, name) SELECT legacy_code, nome FROM public.pamda_clientes_importacao;
INSERT INTO public.customer_branches (customer_id, address_needs_review, import_source_customer_code)
SELECT id, customer_code::integer <= 111, customer_code FROM public.customers;
