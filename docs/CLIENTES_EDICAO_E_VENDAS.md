# Clientes: edição, histórico e preparação de venda

Esta entrega preserva a autenticação local atual (`Supabase Auth` + `erp_user_profiles`), a identidade visual e os módulos de demonstração existentes. A referência cadastral continua sendo a migration oficial **03_PAMDA_CRIAR_CADASTRO_OFICIAL_384_CLIENTES.sql** fornecida pela Pamda. Não executar novamente a importação nem a migration geral antiga.

## Comportamento implementado

- Clientes e Nova Venda usam `CustomersService` / `useCustomers` e a mesma `searchCustomers`: código TEXT, nome, razão social e CPF/CNPJ, com ou sem máscara. A leitura percorre todas as páginas, inclusive quando o limite do servidor é menor que 100; nunca completa uma falha com dados locais.
- As associações usam exclusivamente `customers.id` e `customer_branches.customer_id`. Não há agrupamento por nome/documento. Códigos com zeros, letras e espaços são preservados exatamente.
- A ficha oferece **EDITAR**, **CONSULTAR VENDAS** e **+ NOVA VENDA**. A navegação conserva UUID e código do cliente, com retorno à ficha selecionada. A revalidação do mesmo usuário não força a aba inicial.
- Edição envia apenas campos alterados, com versões `updated_at`. Campos opcionais podem ser limpos; valores legados não editados continuam intactos. Nome é obrigatório; novos documentos e e-mail têm validação de formato (CPF/CNPJ por comprimento e caracteres, sem consulta de validade fiscal).
- Código comercial e UUIDs são somente leitura. Não há criação/exclusão de clientes/unidades nem edição de prazos, limites, `billing_mode`, classificação, política de unidade, vínculos ou origem.
- Corrigir endereço não retira sua sinalização automaticamente. Para marcar revisado, a pessoa deve confirmar a conferência e preencher endereço, cidade, estado e CEP. A confirmação também é verificada no servidor.
- O sucesso só é exibido após receber os dados canônicos do banco. Conflitos de versão exigem atualizar e revisar a edição. Em falha de rede, o resultado pode ser desconhecido: atualizar antes de repetir evita sobrescritas.
- Nova Venda recebe o cliente pelo UUID/código, consulta as unidades reais e exige seleção da unidade correta. O carrinho começa vazio. Produtos disponíveis continuam sendo de demonstração; adicionar/remover itens e calcular total não grava venda. A confirmação está desabilitada e o envio do formulário também é bloqueado. Não são emitidos recibos nem movimentados estoque ou financeiro.
- A condição continua **“Condição de pagamento não configurada”**. Não há preenchimento de política ou limite de crédito.

## Supabase: revisão necessária antes de habilitar edição

A migration nova está em [`supabase/review/06_PAMDA_EDITAR_CLIENTES.sql`](../supabase/review/06_PAMDA_EDITAR_CLIENTES.sql). **Ela não foi executada no projeto real.** A instrução anterior da Pamda exige revisão antes de execução de migrations. O frontend apresenta erro claro enquanto a RPC não estiver instalada.

Procedimento para o responsável autorizado pelo projeto existente **erp-pamda**:

1. Conferir o schema oficial, as políticas/grants atuais, triggers existentes e o perfil ativo em `erp_user_profiles` (`user_id`, `role`, `active`). A associação de perfis deve ser protegida: funcionários não podem promover o próprio `role` nem ativar a própria conta. Não aplicar 04/05 antigas: usam outro modelo (`erp_employees`).
2. Revisar o SQL 06 completo. O escopo de edição segue o perfil já usado pelo app: **somente administrador ativo `admin_gerencial`**. A helper consulta o perfil no banco; metadados do navegador não concedem permissão. Leitura permanece condicionada às políticas SELECT atuais. Não foi acrescentada leitura anônima.
3. Confirmar que `authenticated` já possui SELECT e políticas apropriadas em ambas as tabelas. A RPC é `SECURITY INVOKER`; RLS e SELECT/UPDATE valem para a sessão real. Políticas restritivas antigas incompatíveis podem continuar bloqueando: revisar especificamente, sem desabilitar RLS nem criar política pública.
4. Após aprovação, executar **apenas o SQL 06** no SQL Editor do projeto existente, como migration incremental. O arquivo contém transação e recarga do cache PostgREST. Não executar a pasta inteira, `db reset`, a migration 03 ou a migration geral do ERP.
5. A migration limita UPDATE às colunas cadastrais, adiciona políticas permissivas/restritivas de administrador, bloqueia INSERT/DELETE para os papéis de frontend e instala guardas de campos protegidos. Grants anteriores mais amplos e políticas devem ser revisados também. Outros consumidores futuros, como Messenger, precisam de autorização específica antes de receber escrita.
6. Instala `pamda_update_customer` para salvar cliente e unidades atomicamente. A RPC bloqueia unidade de outro cliente, campos desconhecidos, versões antigas e revisão sem confirmação. Triggers mantêm os identificadores/origem/regras comerciais e geram `updated_at` no servidor. Se qualquer unidade ou auditoria falhar, a transação inteira é desfeita.
7. A única tabela nova é `customer_change_audit`, com entidade, UUID, cliente, autor autenticado, data e campos antes/depois. Ela contém dados pessoais: SELECT somente para administradores ativos, sem INSERT/UPDATE/DELETE de frontend. O trigger de auditoria usa `SECURITY DEFINER` com `search_path` fixo; a RPC de edição usa `SECURITY INVOKER`. Não há tabela nova de clientes.
8. Validar com um administrador e uma conta sem permissão. Conferir que o cadastro e o código original retornam após recarga, usando uma correção real previamente conferida pela Pamda. Não alterar clientes arbitrários para teste. Validar também os 384 clientes/unidades e a tabela original preservada; a quantidade de endereços pendentes só deve diminuir conforme conferências explícitas.

Configuração do frontend permanece `.env.local` com `VITE_SUPABASE_URL` e chave pública publishable/anon. Não inserir credenciais privadas, senha do banco ou `service_role`. Reiniciar Vite quando alterar variáveis; para Vercel, configurar as mesmas variáveis públicas e gerar novo build.

## Histórico oficial e próxima integração de vendas

Na consulta de metadados feita sem sessão comercial, `sales` retornou `PGRST205`; não foi possível confirmar uma tabela operacional com uma sessão autenticada de produção. O frontend repete a verificação autenticada, sem ler linhas no teste de existência. Erros de permissão/rede são mostrados como erro, sem disfarçá-los como ausência de histórico.

Uma tabela com nome `sales`, por si só, não comprova integração operacional. O adaptador só exibe histórico após uma RPC oficial versionada ser implantada e validada. Sem tabela ou RPC, mostra exatamente:

> Histórico de vendas ainda não integrado ao PAMDA CORE.

O contrato preparado é `pamda_customer_sales_history(p_customer_id uuid, p_offset integer, p_limit integer)`, somente leitura. **Esta entrega não cria essa RPC nem tabelas de vendas.** Sua implementação depende do schema oficial futuro e das políticas comerciais de acesso. Deve aplicar RLS da sessão, validar permissão ao cliente, filtrar pelo UUID, ordenar estavelmente (data + UUID), paginar e retornar contagem de todas as vendas permitidas, inclusive zero:

```json
{
  "contract_version": 1,
  "customer_id": "UUID solicitado",
  "total": 1,
  "rows": [{
    "id": "UUID da venda",
    "customer_id": "UUID solicitado",
    "receipt_number": "código do recibo",
    "sold_at": "2026-10-15T12:00:00Z",
    "branch_name": null,
    "total_amount": 100,
    "payment_status": "status oficial",
    "production_status": "status oficial",
    "delivery_status": "status oficial",
    "items": [{ "product_name": "nome registrado na venda", "quantity": 1, "unit_price": 100 }]
  }]
}
```

A tela valida versão, UUID, tipos e duplicatas, pagina por quantidade efetiva e prepara lista/detalhes de recibo, data, unidade, produtos, quantidades, total, pagamento, produção e entrega. O modal é de leitura; não usa o gerador de recibos/PIX de demonstração. A listagem global de vendas já existente continua explicitamente de demonstração e não alimenta o histórico do cliente oficial.

Para habilitar confirmação oficial em uma próxima entrega será necessário integrar e validar vendas, sequência de recibos, catálogo, composição de produtos, estoque e financeiro, com transações, idempotência e permissões próprias. A edição de cadastro não habilita esse fluxo.

## Arquivos desta atualização

- Telas/navegação: `src/App.tsx`, `src/views/customers/CustomersView.tsx`, `CustomerEditModal.tsx`, `customerForm.ts`, `src/views/sales/NewSaleView.tsx`, `SalesListView.tsx`, `CustomerSalesHistoryView.tsx`.
- Serviço central/modelos: `src/hooks/useCustomers.ts`, `src/services/customers.ts`, `customerEdits.ts`, `customerMapping.ts`, `customerSalesHistory.ts`, `customerSalesHistoryService.ts`, `src/types/pamdaCore.ts`.
- Banco/revisão: SQL 06 acima. Não foi executada nenhuma alteração remota de dados ou schema nesta atualização.
- Testes: `tests/customer-edit-rls.test.ts`, `customer-edits.test.ts`, `customer-history.test.ts`, `tests/fixtures/customerRows.ts`, `tests/browser/customers.spec.ts`, `playwright.config.ts`, dependência `@playwright/test`, script `test:ui`, lockfile e exclusão dos artefatos em `.gitignore`.
- `db.ts` e `erp.ts` foram revisados: continuam isolando os modelos e operações locais de demonstração. Clientes oficiais não são convertidos para o modelo comercial fictício. Demais mudanças locais existentes foram preservadas.

## Validação reproduzível

```sh
npm ci
npm test
npm run test:ui
npm run lint
npm run build
```

`npm test` inclui PostgreSQL em RAM (`PGlite`), schema oficial sintético de 384 clientes/unidades e testes de SQL/RLS com permissões reais do PostgreSQL. Verifica persistência em nova leitura, atualização de endereço, revisão explícita, rollback, versões concorrentes, opcionais vazios, código/UUIDs imutáveis, auditoria, anonimato e perfis sem permissão. A migration é aplicada apenas nessa instância em memória.

`test:ui` usa Chrome instalado (`channel: chrome`) em perfil isolado e servidor Vite exclusivo na porta 4317. Pode-se instalar Chrome no ambiente de CI ou adaptar o canal ao navegador disponível. URL/chave do Supabase são sintéticas; todas as chamadas externas são interceptadas/bloqueadas. Testa busca, paginação com limite 37, seleção/contexto, histórico pendente, carrinho vazio, produtos manuais, bloqueio de submit, edição/recarga, erro de rede/permissão e botões em 390px. O mock não substitui a homologação com RLS no projeto real após aprovação do SQL 06.

Resultado nesta entrega: **68 testes de serviços/SQL e 4 testes de navegador passaram**; `npm run lint`, `npm run build` e `git diff --check` concluídos sem erros. O build emite aviso de bundle acima de 500 kB, sem impedir a geração. A captura de 390px também foi inspecionada: os três botões permanecem dentro da tela e o código é somente leitura. Persistência e permissões foram verificadas em PostgreSQL em memória e API sintética; a homologação no Supabase real depende da revisão/aplicação do SQL 06.

Referências técnicas: [RLS no Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security), [mock de rede no Playwright](https://playwright.dev/docs/mock).
