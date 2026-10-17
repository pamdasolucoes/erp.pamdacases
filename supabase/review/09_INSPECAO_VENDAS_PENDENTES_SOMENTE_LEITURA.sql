-- SOMENTE LEITURA. Execute no SQL Editor do projeto existente erp-pamda.
-- Nao chama RPC de escrita, nao altera dados/schema/RLS e nao cria vendas.

-- 1. Parametros, retornos e implementacao efetivamente instalados.
SELECT n.nspname AS schema_name,p.proname AS function_name,
       pg_get_function_arguments(p.oid) AS arguments,
       pg_get_function_result(p.oid) AS result_type,
       p.prosecdef AS security_definer,
       pg_get_functiondef(p.oid) AS definition
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN (
  'pamda_iniciar_venda','pamda_salvar_rascunho_venda','pamda_cancelar_venda'
)
ORDER BY p.proname,p.oid;

-- 2. Colunas de vendas, itens, historico e estruturas de permissoes existentes.
SELECT table_schema,table_name,column_name,data_type,udt_name,is_nullable,column_default
FROM information_schema.columns
WHERE table_schema NOT IN ('pg_catalog','information_schema','auth','storage')
  AND (table_name IN ('erp_pending_sales','erp_sale_items','erp_sales','sales','sale_items','erp_user_profiles')
    OR table_name ILIKE '%permission%' OR table_name ILIKE '%permiss%'
    OR table_name ILIKE '%sale%event%' OR table_name ILIKE '%sale%histor%' OR table_name ILIKE '%sale%audit%')
ORDER BY table_schema,table_name,ordinal_position;

-- 3. Definicao e opcoes das views (incluindo security_invoker).
SELECT n.nspname AS schema_name,c.relname,c.relkind,c.reloptions,
       pg_get_viewdef(c.oid,true) AS view_definition
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('erp_pending_sales','erp_sale_items')
  AND c.relkind IN ('v','m');

-- 4. Politicas existentes: apenas inspecao, nenhuma alteracao.
SELECT schemaname,tablename,policyname,roles,cmd,qual,with_check
FROM pg_policies
WHERE schemaname NOT IN ('auth','storage')
  AND (tablename ILIKE '%sale%' OR tablename ILIKE '%permission%' OR tablename ILIKE '%permiss%')
ORDER BY schemaname,tablename,policyname;

-- 5. Contratos de consulta/concessao de permissoes e leitura de historico.
SELECT n.nspname AS schema_name,p.proname,
       pg_get_function_arguments(p.oid) AS arguments,
       pg_get_function_result(p.oid) AS result_type,
       pg_get_functiondef(p.oid) AS definition
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname NOT IN ('pg_catalog','information_schema','auth','storage')
  AND p.prokind='f'
  AND (p.proname ILIKE '%permission%' OR p.proname ILIKE '%permiss%'
    OR p.proname ILIKE '%sale%histor%' OR p.proname ILIKE '%venda%histor%')
ORDER BY n.nspname,p.proname;

-- Envie os resultados, sem senhas, tokens ou chaves privadas eventualmente presentes.
-- Nao e necessario enviar registros comerciais para confirmar o contrato.
