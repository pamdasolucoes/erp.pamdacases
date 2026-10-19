# Contrato vigente do PAMDA CORE

Fonte: confirmação do administrador em 19/10/2026 após consulta somente leitura no projeto **erp-pamda**, `onorqcdauhxumbznosxf`. A inspeção 10 não precisa ser executada para integrar os contratos já fornecidos. Nenhum SQL foi executado nesta entrega.

**18 migrations registradas**; três mais recentes confirmadas:

| Versão | Nome |
| --- | --- |
| 20261019154725 | pamda_erp_pending_view_add_first_product_at |
| 20261019154834 | pamda_erp_customer_atomic_edit_rpc |
| 20261019155051 | pamda_erp_official_commercial_context_and_summary |

Não reaplicar. `../migrations/20261006000000_init_pamda_erp.sql` é histórico e não representa o baseline atual. Build/aplicativo não executam migrations. Não usar reset/db push para sincronizar o banco existente.

## RPCs complementares confirmadas

Executáveis por authenticated, recusam anon e verificam autorização internamente. Argumentos conforme administrador:

```text
pamda_update_customer(p_customer_id uuid, p_expected_updated_at timestamptz,
  p_changes jsonb, p_branches jsonb) -> jsonb {customer, branches}
pamda_admin_cadastrar_cliente_com_matriz(p_codigo text, p_nome text,
  p_endereco text, p_numero text, p_bairro text, p_cidade text,
  p_estado text, p_cep text, p_telefone text) -> TABLE(cliente_id uuid, matriz_id uuid)
pamda_admin_cadastrar_filial(p_cliente_id uuid, p_nome text, p_endereco text,
  p_numero text, p_bairro text, p_cidade text, p_estado text,
  p_cep text, p_telefone text) -> uuid
pamda_admin_atualizar_filial(p_filial_id uuid, p_nome text, p_endereco text,
  p_numero text, p_bairro text, p_cidade text, p_estado text,
  p_cep text, p_telefone text) -> void
pamda_admin_definir_matriz(p_branch_id uuid) -> void
pamda_salvar_frete_padrao(p_customer_id uuid, p_amount numeric, p_reason text) -> void
pamda_salvar_frete_filial(p_branch_id uuid, p_amount numeric, p_reason text) -> void
pamda_contexto_comercial_cliente(p_customer_id uuid, p_branch_id uuid) -> jsonb
pamda_admin_configurar_pagamento_cliente(p_customer_id uuid, p_method_id uuid,
  p_term_id uuid, p_credit_limit numeric, p_notes text) -> void
pamda_admin_configurar_pagamento_filial(p_branch_id uuid, p_method_id uuid,
  p_term_id uuid, p_notes text) -> void
pamda_admin_salvar_forma_pagamento(p_code text, p_name text, p_active boolean) -> uuid
pamda_admin_salvar_prazo_pagamento(p_code text, p_name text, p_due_days integer,
  p_installments integer, p_notes text, p_active boolean) -> uuid
pamda_resumo_erp() -> jsonb
pamda_has_permission(p_permission text) -> boolean
```

Colunas complementares: `customers.default_shipping_fee numeric`, `customer_branches.is_primary boolean`, `customer_branches.shipping_fee_override numeric`. A view de pendências inclui `first_product_at`. Preservar códigos comerciais e UUIDs.

Catálogos:

```text
erp_payment_methods: id, code, name, active, created_at
erp_payment_terms: id, code, name, due_days, installments, notes, active, created_at
erp_customer_payment_settings: customer_id, default_method_id, default_term_id,
  credit_limit, notes, updated_by, updated_at
erp_branch_payment_settings: branch_id, default_method_id, default_term_id,
  notes, updated_by, updated_at
```

Permissões confirmadas nesta etapa: customers.manage, customers.shipping.manage, sales.draft, sales.read, finance.read. As permissões de vendas informadas anteriormente continuam preservadas; nenhuma é concedida automaticamente.

Referência: [sincronização CORE](../../docs/SINCRONIZACAO_CORE.md). Este arquivo versiona o contrato informado, não o corpo literal do banco. Dump e histórico completo aguardam exportação administrativa autorizada/revisão. Não inventar os 15 registros restantes nem gerar migrations para simular um baseline.
