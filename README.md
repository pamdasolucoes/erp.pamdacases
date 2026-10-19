# PAMDA ERP - Sistema B2B Pamda Cases

Estado atual: [sincronização ERP + Supabase, integrações entregues e pendências de contrato](./docs/SINCRONIZACAO_CORE.md). O Supabase existente é a única fonte oficial. Os módulos sem backend homologado ficam indisponíveis; dados locais demonstrativos não são utilizados pelo aplicativo.

Vendas pendentes oficiais: [início automático, salvamento serial, retomada e cancelamento autorizado](./docs/VENDAS_PENDENTES.md). A confirmação e as movimentações de estoque/financeiro continuam bloqueadas nesta etapa.

Sessão, unidade automática e recuperação temporária da Nova Venda: [comportamento e verificação no localhost](./docs/SESSAO_E_RASCUNHO.md).

Buscas integradas na Nova Venda e prévia de recibo A4/80 mm: veja [configuração, comportamento e testes](./docs/BUSCAS_E_PREVIA_RECIBO.md). A confirmação oficial de vendas permanece bloqueada.

**Etapa atual: sincronização com o Supabase PAMDA CORE.**
O login usa e-mail e senha do Supabase Auth; o perfil ativo é consultado em `public.erp_user_profiles` pelo `user_id`.
Clientes e unidades usam as tabelas oficiais existentes, com edição cadastral protegida por RPC. O dashboard consulta o resumo oficial; o contexto comercial e os fretes usam as funções oficiais informadas pelo administrador.
Criação de cliente com matriz, criação/edição de filiais, definição de matriz, catálogos e configurações de pagamento usam as RPCs oficiais confirmadas. Os módulos sem integração homologada não efetuam consultas ou gravações demonstrativas.

Consulte [SINCRONIZACAO_CORE.md](./docs/SINCRONIZACAO_CORE.md) para requisitos atuais de RLS, autenticação, contratos e validação. Os documentos das etapas anteriores são históricos. O aplicativo e o build não executam SQL. **Não aplicar a migration geral antiga nem reaplicar os scripts de `supabase/review` no banco existente.**

ERP B2B sob medida para a **PAMDA CASES**, projetado para substituir o legado REIN e permitir a gestão integral de clientes, redes com filiais, políticas comerciais, produtos físicos, serviços de estamparia DTF UV, kits personalizados com cálculo de custo composto, clonagem inteligente de produtos/kits, emissão de recibos com numeração sequencial (a partir de 10000) e Pix dinâmico, esteira de produção e controle de lucratividade gerencial com snapshot histórico de custos.

---

## Escopo histórico do projeto

A lista abaixo descreve o desenho original, incluindo recursos ainda indisponíveis. Não é uma declaração de funcionalidades homologadas. Para uso atual, prevalece a documentação de sincronização acima. O login atual usa e-mail/senha do Supabase Auth; administração de funcionários, confirmações, pagamentos e movimentos reais continuam indisponíveis até a integração correspondente.

1. **Autenticação Direta e Segura por Níveis (RBAC)**
   - Login por **Usuário** e **Senha** (sem exigir e-mail do operador).
   - Perfis:
     - **ADMIN / GERENCIAL**: Acesso irrestrito a custos, lucratividade, usuários, configurações e logs.
     - **VENDA / ATENDIMENTO**: Vendas, clientes, emissão de recibos, pagamentos e catálogo sem acesso a margens totais e usuários.
     - **PRODUÇÃO**: Fila de produção, status dos pedidos liberados e modelos, sem acesso a dados financeiros sensíveis.
   - Proteção de rotas e componentes: telas gerenciais são totalmente inacessíveis para operadores sem permissão.

2. **Clientes, Redes e Filiais**
   - Hierarquia Matriz (Rede) e Filiais (endereço independente, contato, telefone).
   - Snapshot do endereço da filial exata na venda e no recibo.
   - Suporte a clientes independentes sem filiais.
   - Faturamento consolidado ou individual por filial.

3. **Políticas de Pagamento & Condições Comerciais**
   - Pré-pago / Pagamento antecipado, Pagamento na entrega, Pix manual, Fechamento semanal e mensal.
   - Bloqueio inteligente: **"Produzir somente após pagamento"** bloqueia avanço para produção até quitação financeira.
   - Herança de política: Filial > Rede > Padrão Pamda.
   - Snapshot imutável da política comercial na venda.

4. **Produtos, Serviços e Kits Personalizados**
   - Produtos Físicos (ex: Capa TPU iPhone 15 - R$ 2,50 custo / R$ 10,00 venda).
   - Serviços (ex: Impressão DTF UV em capa - R$ 1,80 custo / R$ 20,00 venda).
   - Kits Compostos (ex: Capa personalizada = 1 Capa TPU + 1 Impressão DTF UV).
   - Custo direto calculado vs Custo gerencial manual (ex: R$ 4,30 direto vs R$ 5,00 gerencial).
   - Histórico de custos imutável para não corromper relatórios retroativos.

5. **Clonagem Inteligente (Super Clone)**
   - Clonar produto individual.
   - Clonar kit completo.
   - **Duplicar Produto + Kit (Super Clone)**: ex: converte linha iPhone 15 para iPhone 16 criando o produto físico e o kit composto automaticamente, substituindo a capa física e mantendo o serviço de DTF UV!

6. **Vendas e Recibos Profissionais**
   - Numeração sequencial começando em 10000 (ex: 10000, 10001, 10025...).
   - Data/hora imutável da venda registrada no momento da criação.
   - Recibo limpo para impressão (oculta cabeçalhos/rodapés do navegador).
   - **Regra do Pix no Recibo**: Se o pedido já foi pago, exibe selo "PAGAMENTO CONFIRMADO". Se houver saldo pendente, exibe QR Code escaneável e Chave Pix destacada (`capaspix@gmail.com`).

7. **Esteira de Produção**
   - Status: Aguardando liberação -> Em produção -> Conferência -> Pronto -> Entregue.
   - Bloqueia automaticamente pedidos não pagos com clientes configurados como "Produzir somente após pagamento".

8. **Financeiro e Lucratividade Gerencial**
   - Contas a Receber com filtros, dias de atraso e baixa parcial.
   - Fechamentos semanais e mensais agrupando vendas de filiais/redes.
   - Frete cobrado do cliente vs Custo real da entrega (motoboy/transportadora).
   - **Relatório de Lucratividade**: Custo histórico dos produtos + serviços + custo gerencial + custo de entrega + taxas => Margem % e Lucro Líquido com drill-down direto na venda.

---

## 🛠️ Como Executar Localmente no VS Code

### Pré-requisitos
- Node.js 24.x
- npm

### Passos
```bash
# 1. Clone o repositório
git clone <url-do-repositorio>
cd pamda-erp

# 2. Instale as dependências
npm ci

# 3. Configure as variáveis de ambiente
cp .env.example .env.local

# 4. Inicie o servidor de desenvolvimento
npm run dev
```

Abra seu navegador em `http://localhost:3000`.

## Implantação na Vercel

Consulte [DEPLOY_VERCEL.md](./DEPLOY_VERCEL.md) para importar o repositório, configurar o build e entender a persistência de dados da versão atual.

---

## 🗄️ Configuração do Supabase (PostgreSQL)

Use exclusivamente o projeto existente **erp-pamda**. Não reexecute a migration 03 de importação e não execute `supabase/migrations/20261006000000_init_pamda_erp.sql`: ela não representa o schema oficial dos 384 clientes.

Configure `VITE_SUPABASE_URL` e a chave pública `VITE_SUPABASE_PUBLISHABLE_KEY` ou `VITE_SUPABASE_ANON_KEY` em `.env.local`. A URL deve ser a **Project URL real**, não o nome do projeto convertido em hostname. O frontend autentica diretamente no Supabase Auth e consulta o perfil pela coluna `user_id`; não usa usuário/senha de demonstração nem uma sessão própria em `localStorage`.

Para executar e testar localmente:

```bash
npm ci
npm run dev
```

Abra `http://localhost:3000` e entre com o e-mail e a senha de uma conta existente no Supabase Auth. A sessão do Supabase é restaurada após atualizar a página; use **Sair** para encerrá-la. A conta precisa ter um perfil ativo em `erp_user_profiles`.

O perfil deve ter uma política RLS de `SELECT` que permita ao usuário autenticado ler somente a própria linha (`user_id = auth.uid()`). A leitura de `customers` e `customer_branches` exige `GRANT SELECT` para `authenticated` e políticas RLS de `SELECT` que autorizem o administrador ativo sem conceder escrita ou acesso anônimo. A implementação local anterior de SQL 05 usa `erp_employees`; essa condição não autoriza automaticamente um perfil que exista somente em `erp_user_profiles`. Inspecione/substitua as políticas de autorização restritivas compatíveis com o esquema real — não desative RLS. Se a consulta for bloqueada, a tela identifica a tabela e informa o predicado esperado.

---

## Validação local

Produtos, Serviços & Kits e Nova Venda consultam o catálogo oficial do Supabase, incluindo componentes por UUID e valores nulos. Cadastro/edição/clonagem de produtos continuam bloqueados. Frete e condições padrão vêm do contexto comercial oficial; frete negociado não modifica o cadastro. Nenhuma migration foi criada/aplicada nesta atualização. Para o estado atual prevalece [sincronização CORE](./docs/SINCRONIZACAO_CORE.md).

A Nova Venda também permite negociar preços, restaurar o valor original e calcular margens dos itens sem alterar o catálogo. Consulte [negociação e snapshots](./docs/NEGOCIACAO_PRECOS.md). A migration 07 anterior serve somente à demonstração e não autoriza itens do catálogo oficial; vendas oficiais continuam bloqueadas.

A atualização de clientes integra a busca da Nova Venda, a edição cadastral e o histórico oficial de pendências. A RPC de edição já foi confirmada como instalada; não reaplicar a proposta histórica **06**. Confirmação da venda permanece bloqueada. Documentos de etapas anteriores são históricos; os contratos atuais estão em [sincronização CORE](./docs/SINCRONIZACAO_CORE.md).

```bash
npm test
npm run test:ui
npm run lint
npm run build
```

Os testes de SQL usam PostgreSQL em memória com dados sintéticos. Não criam projetos Supabase, não fazem login no projeto real e não alteram dados comerciais. Não existem senhas padrão, usuários fictícios de produção ou login automático de administrador.
