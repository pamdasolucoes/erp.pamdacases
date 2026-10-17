-- Consulta administrativa somente leitura. Conferir projeto erp-pamda.
-- Nao cria tabelas, nao importa dados, nao modifica politicas/grants.
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name IN ('customers','customer_branches')
ORDER BY table_name, ordinal_position;

SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies WHERE schemaname='public'
AND tablename IN ('customers','customer_branches','erp_employees','erp_login_attempts');

SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants
WHERE table_schema='public'
AND table_name IN ('customers','customer_branches','erp_employees','erp_login_attempts')
ORDER BY table_name, grantee, privilege_type;

SELECT
  (SELECT count(*) FROM public.customers) AS clientes,
  (SELECT count(DISTINCT customer_code) FROM public.customers) AS codigos_unicos,
  (SELECT count(*) FROM public.customer_branches) AS unidades,
  (SELECT count(*) FROM public.customer_branches WHERE address_needs_review) AS enderecos_para_revisar,
  (SELECT count(*) FROM public.pamda_clientes_importacao) AS originais_preservados;

-- Registrar os hashes antes/depois das migrations de autenticacao/leitura.
SELECT 'customers' AS tabela, md5(coalesce(string_agg(to_jsonb(c)::text, E'\n' ORDER BY c.id),'')) AS snapshot
FROM public.customers c
UNION ALL
SELECT 'customer_branches', md5(coalesce(string_agg(to_jsonb(b)::text, E'\n' ORDER BY b.id),''))
FROM public.customer_branches b
UNION ALL
SELECT 'pamda_clientes_importacao', md5(coalesce(string_agg(to_jsonb(i)::text, E'\n' ORDER BY i.legacy_code),''))
FROM public.pamda_clientes_importacao i;

SELECT count(*) AS divergencias FROM public.pamda_clientes_importacao i
LEFT JOIN public.customers c ON c.customer_code=i.legacy_code
LEFT JOIN public.customer_branches b ON b.import_source_customer_code=i.legacy_code
WHERE c.id IS NULL OR b.id IS NULL OR b.customer_id IS DISTINCT FROM c.id;
