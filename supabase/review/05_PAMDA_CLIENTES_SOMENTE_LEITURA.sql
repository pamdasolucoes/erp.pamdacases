-- PARA REVISAO. Executar somente depois de configurar e testar autenticacao.
-- Referencia de cadastro: 03_PAMDA_CRIAR_CADASTRO_OFICIAL_384_CLIENTES.sql.
-- Antes de aplicar: inspecionar politicas/grants atuais e o impacto no Messenger.
-- Nenhum INSERT/UPDATE/DELETE, alteracao de codigo, UUID ou reimportacao.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.customers') IS NULL OR to_regclass('public.customer_branches') IS NULL
     OR to_regclass('public.erp_employees') IS NULL THEN
    RAISE EXCEPTION 'Cadastros oficiais e autenticacao devem existir primeiro.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'customers'
                   AND column_name = 'customer_code' AND data_type = 'text') THEN
    RAISE EXCEPTION 'Schema oficial TEXT customer_code nao confirmado.';
  END IF;
END;
$$;

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_branches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customers, public.customer_branches FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.customers, public.customer_branches TO authenticated;

CREATE POLICY pamda_erp_customers_read ON public.customers
  FOR SELECT TO authenticated USING ((SELECT public.pamda_can_read_customers()));
CREATE POLICY pamda_erp_customers_guard ON public.customers AS RESTRICTIVE
  FOR SELECT TO authenticated USING ((SELECT public.pamda_can_read_customers()));
CREATE POLICY pamda_erp_branches_read ON public.customer_branches
  FOR SELECT TO authenticated USING ((SELECT public.pamda_can_read_customers()));
CREATE POLICY pamda_erp_branches_guard ON public.customer_branches AS RESTRICTIVE
  FOR SELECT TO authenticated USING ((SELECT public.pamda_can_read_customers()));

-- A politica restritiva impede que uma eventual politica permissiva antiga
-- permita acesso de funcionario inativo/sem permissao. anon nao recebe grants.
-- Escritas continuam revogadas para authenticated, inclusive administradores.
COMMIT;
