# PAMDA ERP - Sistema B2B Pamda Cases

ERP B2B sob medida para a **PAMDA CASES**, projetado para substituir o legado REIN e permitir a gestão integral de clientes, redes com filiais, políticas comerciais, produtos físicos, serviços de estamparia DTF UV, kits personalizados com cálculo de custo composto, clonagem inteligente de produtos/kits, emissão de recibos com numeração sequencial (a partir de 10000) e Pix dinâmico, esteira de produção e controle de lucratividade gerencial com snapshot histórico de custos.

---

## 🚀 Funcionalidades Principais

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
- Node.js 18+ ou 20+
- npm ou bun

### Passos
```bash
# 1. Clone o repositório
git clone <url-do-repositorio>
cd pamda-erp

# 2. Instale as dependências
npm install

# 3. Configure as variáveis de ambiente
cp .env.example .env

# 4. Inicie o servidor de desenvolvimento
npm run dev
```

Abra seu navegador em `http://localhost:3000`.

---

## 🗄️ Configuração do Supabase (PostgreSQL)

O sistema possui uma camada reativa integrada que já funciona imediatamente para testes e homologação rápida com dados pré-populados da Pamda Cases.

Para conectar diretamente ao seu projeto Supabase de produção:

1. Acesse o painel do **Supabase** ([supabase.com](https://supabase.com)).
2. Crie um novo projeto (ex: `pamda-erp`).
3. Vá em **SQL Editor** e execute todo o conteúdo do arquivo:
   `supabase/migrations/20261006000000_init_pamda_erp.sql`.
4. Em **Project Settings -> API**, copie:
   - `Project URL` -> Coloque em `VITE_SUPABASE_URL` no `.env`.
   - `anon public key` -> Coloque em `VITE_SUPABASE_ANON_KEY` no `.env`.
5. Reinicie a aplicação (`npm run dev`).

---

## 👥 Credenciais Padrão para Testes

| Perfil | Usuário | Senha | Nível de Acesso |
|---|---|---|---|
| **Admin / Gerencial** | `admin` | `admin123` | Acesso total, custos, margens, lucratividade, usuários e logs |
| **Venda / Atendimento**| `vendedor` | `venda123` | Vendas, clientes, recibos, sem ver lucro/custos |
| **Produção** | `producao` | `prod123` | Fila de produção e status, sem dados financeiros |
