-- SOMENTE LEITURA. Executar no SQL Editor do projeto existente erp-pamda.
-- Retorna metadados/contratos, nunca clientes, senhas, tokens ou chaves.
-- Nao aplica migrations nem modifica registros.
SELECT jsonb_build_object(
  'functions', (SELECT jsonb_agg(jsonb_build_object(
    'name', p.proname,
    'arguments', pg_get_function_arguments(p.oid),
    'result', pg_get_function_result(p.oid),
    'definition', pg_get_functiondef(p.oid),
    'grants', p.proacl
  ) ORDER BY p.proname)
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f'
    AND (p.proname IN (
      'pamda_has_permission', 'pamda_resumo_erp', 'pamda_contexto_comercial_cliente',
      'pamda_update_customer', 'pamda_salvar_frete_padrao', 'pamda_salvar_frete_filial',
      'pamda_admin_cadastrar_cliente_com_matriz', 'pamda_admin_cadastrar_filial',
      'pamda_admin_atualizar_filial', 'pamda_admin_definir_matriz',
      'pamda_iniciar_venda', 'pamda_salvar_rascunho_venda',
      'pamda_descartar_venda_vazia', 'pamda_cancelar_venda',
      'pamda_cadastrar_item_basico', 'pamda_cadastrar_kit'
    ) OR p.proname LIKE 'pamda_admin_%')),
  'columns', (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.table_name, c.ordinal_position)
    FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name IN (
      'customers', 'customer_branches', 'erp_sales', 'erp_pending_sales',
      'erp_sale_items', 'erp_sale_events', 'erp_payment_methods', 'erp_payment_terms',
      'erp_user_profiles', 'products', 'kit_components'
    )),
  'constraints', (SELECT jsonb_agg(jsonb_build_object(
    'table', c.conrelid::regclass::text, 'name', c.conname,
    'definition', pg_get_constraintdef(c.oid)
  ) ORDER BY c.conrelid::regclass::text, c.conname)
    FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE n.nspname = 'public' AND c.conrelid IN (
      SELECT cl.oid FROM pg_class cl JOIN pg_namespace ns ON ns.oid = cl.relnamespace
      WHERE ns.nspname = 'public' AND cl.relname IN (
        'customers', 'customer_branches', 'erp_user_profiles', 'erp_sales',
        'erp_payment_methods', 'erp_payment_terms'
      )
    )),
  'policies', (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.tablename, p.policyname)
    FROM pg_policies p WHERE p.schemaname = 'public'),
  'pending_view', (SELECT jsonb_build_object(
    'definition', pg_get_viewdef(c.oid, true), 'options', c.reloptions
  ) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'erp_pending_sales' AND c.relkind = 'v'),
  'migration_ledger_exists', to_regclass('supabase_migrations.schema_migrations') IS NOT NULL
) AS schema_contract;

-- Opcional: executar esta consulta somente se migration_ledger_exists = true.
-- SELECT to_jsonb(m) - 'statements' AS applied_migration
-- FROM supabase_migrations.schema_migrations m ORDER BY version;
