-- PROPOSTA PARA REVISAO FUTURA. NAO EXECUTAR NESTA ETAPA.
-- Somente apos aprovacao e confirmacao do schema atual de erp-pamda.
-- Nao identifica/agrupa matrizes automaticamente, nao altera UUIDs/codigos/enderecos.
BEGIN;
ALTER TABLE public.customer_branches
  ADD COLUMN is_primary boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.customer_branches.is_primary IS
  'Unidade principal designada explicitamente por administrador apos conferencia humana.';
CREATE UNIQUE INDEX idx_pamda_one_primary_branch_per_customer
  ON public.customer_branches (customer_id) WHERE is_primary;
ALTER TABLE public.customer_branches ADD CONSTRAINT pamda_primary_branch_active
  CHECK (NOT is_primary OR active);
COMMIT;

-- Nao inclui UPDATE de registros existentes nem mudancas em GRANT/RLS/RPC.
-- Todas as unidades iniciam sem designacao de matriz; a escolha exige conferencia.
-- Futuro gerenciamento deve usar RPC administrativa auditada a ser revisada,
-- sem liberar UPDATE direto a vendedores e sem alterar as politicas atuais.
-- Habilitar VITE_CUSTOMER_BRANCHES_PRIMARY_ENABLED=true somente DEPOIS da instalacao.
