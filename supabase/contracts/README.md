# Estado do versionamento do PAMDA CORE

Projeto existente: **erp-pamda**. Não criar outro banco, recriar tabelas ou reimportar dados.

O arquivo `../migrations/20261006000000_init_pamda_erp.sql` é um artefato histórico do ERP inicial e **não é o baseline oficial**. Não deve ser aplicado no projeto existente. O aplicativo e o build não executam migrations.

Em 19/10/2026, o administrador confirmou as migrations aplicadas:

- `pamda_erp_pending_view_add_first_product_at`
- `pamda_erp_customer_atomic_edit_rpc`
- `pamda_erp_official_commercial_context_and_summary`

O código usa os contratos expressamente informados pelo administrador, documentados em `../../docs/SINCRONIZACAO_CORE.md`. Não foram criados arquivos de migration com esses nomes para simular uma sincronização que ainda não foi inspecionada.

Para preparar o versionamento efetivo:

1. Executar `../review/10_INSPECAO_SINCRONIZACAO_SOMENTE_LEITURA.sql` no SQL Editor autorizado. Ela lê metadados e definições; não altera schema/dados.
2. Salvar o resultado `schema_contract` e o histórico de `supabase_migrations.schema_migrations` (consulta opcional ao final do arquivo). Não incluir senhas, tokens ou credenciais no repositório.
3. Conferir definições/ACL/RLS de views e funções, FKs, índices e constraints; reconciliar as versões reais. A view de pendências deve manter `security_invoker` conforme o contrato informado.
4. Obter o dump do schema autorizado e registrar o baseline revisado sem executar os SQLs contra produção nem inventar registros de migration.
5. Somente depois configurar um fluxo de futuras migrations incrementais, com revisão e ambiente isolado. Não utilizar reset ou replay do histórico para sincronizar o banco existente.

Pendência atual: não há conexão administrativa disponível neste ambiente. Esse diretório registra a divergência de forma explícita; ainda não contém um dump homologado.
