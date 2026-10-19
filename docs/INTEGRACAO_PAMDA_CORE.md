# PAMDA CORE: autenticação e consulta de clientes

O frontend usa o projeto Supabase existente. A URL e a chave pública ficam em `.env.local`; não use chaves de servidor em variáveis `VITE_`. Nenhuma tabela, usuário ou cadastro comercial é criado ou alterado pelo aplicativo.

## Autenticação

- O login chama `supabase.auth.signInWithPassword` com e-mail e senha.
- Após autenticar, o ERP consulta `public.erp_user_profiles` por `user_id = auth.uid()` e valida `username`, `role`, `active` e `can_view_financial_metrics`. A metadata do Auth não concede permissões.
- O perfil precisa estar ativo e usar um papel reconhecido (`admin_gerencial`, `venda_atendimento` ou `producao`). A permissão de métricas vem de `can_view_financial_metrics`; o acesso a clientes é autorizado pela RLS.
- O cliente Supabase mantém e renova a sessão. A atualização da página valida novamente a identidade e o perfil; **Sair** encerra a sessão local.
- Não há usuário padrão, login automático ou autenticação própria em `localStorage`.

Para carregar o próprio perfil, a RLS de `erp_user_profiles` deve permitir `SELECT` somente na linha correspondente ao usuário autenticado (`user_id = auth.uid()`). Um erro `42501` na tela de login indica que essa política ou o `GRANT SELECT` está ausente. Não torne a tabela pública nem remova o RLS.

## Clientes e unidades

`CustomersService` consulta somente `customers` e `customer_branches`, usando o JWT do Supabase Auth, colunas explícitas e paginação ordenada por UUID. A busca local considera o `customer_code` original (texto sem conversão, trim ou renumeração), nome e razão social. O cadastro não tem operações de escrita e não usa lista demonstrativa como fallback.

O resultado oficial esperado informado é de 384 clientes e 384 unidades. A interface exibe as contagens realmente retornadas, permite pesquisar pelo código comercial e mostra erro em vez de uma lista parcial quando a consulta ou paginação falha.

O acesso às duas tabelas exige:

1. `GRANT SELECT` para `authenticated`, sem grants de escrita nem leitura para `anon`.
2. RLS habilitada e políticas de `SELECT` que autorizem um perfil ativo `admin_gerencial` em `erp_user_profiles` (`user_id = auth.uid()`).
3. Políticas restritivas existentes alinhadas à mesma fonte de identidade. A proposta local em `supabase/review/05_PAMDA_CLIENTES_SOMENTE_LEITURA.sql` usa `pamda_can_read_customers()` baseado em `erp_employees`; essa condição pode negar o acesso de uma conta que exista somente em `erp_user_profiles`. Adicionar uma política permissiva não supera uma política restritiva que retorne falso. Inspecione `pg_policies` e adapte a condição mantendo o RLS; não o desative.

O frontend identifica erros `42501` e informa a tabela e a condição de perfil esperada. Como políticas RLS também podem filtrar linhas sem erro, se aparecerem zero clientes quando se esperam 384, confira grants e políticas de ambas as tabelas no projeto.

## Executar e testar localmente

Com `.env.local` configurado com a Project URL real e uma chave pública:

```powershell
npm ci
npm run dev
```

Abra `http://localhost:3000`, entre com o e-mail e a senha de uma identidade existente no Supabase Auth que tenha perfil ativo, e confirme Clientes e Unidades, a busca por código, atualização da página e **Sair**.

Validação local:

```powershell
npm test
npm run lint
npm run build
```

Os testes usam mocks e fixtures locais; não autenticam no projeto remoto nem modificam seus dados. A confirmação final das políticas e dos 384 registros depende do acesso ao projeto Supabase.

## Vendas, pagamentos e créditos de homologação

O fluxo de finalização é exclusivo de homologação e não substitui a confirmação oficial. A interface só oferece **Finalizar venda - TESTE** a um administrador ativo, com catálogo de pagamentos carregado e rascunho salvo. A RPC `pamda_finalizar_venda_teste` é a autoridade para verificar autorização, número, itens, frete confirmado, soma dos pagamentos, crédito disponível e idempotência. O frontend relê venda, pagamentos e recibo antes de apresentar sucesso.

- O número apresentado vem de `erp_sales.order_number`; o navegador não gera números.
- Crédito é consultado por `pamda_saldo_credito_teste` e concedido apenas por `pamda_conceder_credito_teste`, com motivo, confirmação e chave UUID. O navegador não escreve em `erp_customer_credit_test_ledger`.
- Pagamentos combinados são enviados somente a `pamda_finalizar_venda_teste`. Pagamentos do canal `site` não podem ser enviados como `paid`; o browser não confirma recebimento de site. Confirmação manual ERP usa `pamda_confirmar_pagamento_teste` e exige justificativa.
- O histórico consulta `erp_sale_test_payments` e `erp_sale_test_receipts`; o recibo de homologação deve corresponder ao número da venda e é identificado como **DOCUMENTO DE TESTE - SEM VALOR FISCAL**. Não é gravado em `erp_sale_receipts`.
- O resumo separa `test_confirmed_sales` e `test_receipts` das métricas oficiais. Os valores de teste não entram no faturamento. O fluxo não chama operações de estoque, cobrança ou financeiro real.
- A sugestão de frete usa `pamda_sugerir_frete_endereco` apenas como informação. O frete efetivo continua vindo de `pamda_contexto_comercial_cliente`. Aplicar uma sugestão é explícito; salvar um ajuste requer permissão e motivo, e nenhum valor manual é recalculado silenciosamente.

O projeto remoto precisa manter autorização no servidor para as RPCs, com execução das RPCs de crédito/finalização/confirmação restrita ao papel administrativo ativo. Para consultas de pagamentos e recibos, conceda somente `SELECT` a `authenticated` e mantenha RLS limitada a identidades autorizadas conforme a política do projeto. Não exponha o ledger de crédito ao browser; sua leitura/mutação deve continuar mediada pelas RPCs. Uma resposta `42501` ou `PGRST...` deve ser resolvida corrigindo grants, políticas ou assinatura do contrato, sem desativar RLS ou criar tabelas/funções pelo frontend.

O frontend espera em `erp_sale_test_payments` as colunas `id`, `sale_id`, `method_code`, `amount`, `status`, `channel`, `scheduled_for` e `reference`. O formato interno de `receipt_snapshot` não foi especificado neste contrato; o recibo visual usa os snapshots persistidos da venda/itens e valida o número, a venda e a data do registro de recibo. Confirmar com a equipe do PAMDA CORE se o snapshot deve ser a fonte visual canônica antes de homologar divergências históricas.

Os testes locais usam apenas Supabase sintético interceptado e não comprovam as políticas, o esquema ou as regras SQL do projeto remoto. Não foram executadas migrations nem escritas comerciais reais. A validação definitiva dos caminhos RLS/RPC e das regras de frete requer ambiente isolado do PAMDA CORE.
