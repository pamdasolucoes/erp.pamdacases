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
