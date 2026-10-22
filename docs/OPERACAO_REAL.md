# Operação real do ERP — 22/10/2026

Projeto Supabase: `onorqcdauhxumbznosxf` (erp-pamda).
Migrations aplicadas: `20261022230147_erp_real_operations_and_user_access`, `20261022230835_erp_real_operations_indexes` `20261022231542_erp_real_network_reconciliation_and_closings`, `20261022231849_erp_individual_customer_read_permissions` e `20261022232024_erp_commercial_audit_in_operations`.
As fontes em `supabase/review/12_*.sql` a `16_*.sql` compõem a migration importada do banco remoto. Não executar ambas as versões.

## Fluxos entregues

- Estoque: consulta de saldos, conferência por contagem física, histórico dos últimos 500 movimentos e custos autorizados.
- Compras e entradas: vários itens, fornecedor opcional, custo médio, data e referência.
- Fornecedores: cadastro auxiliar de nome, contato e observações.
- Vendas: finalização real atômica, pagamentos divididos, baixa dos componentes de kits, custo congelado, contas a receber, produção, entrega e recibo.
- Recebimentos: parciais ou integrais, limite pelo saldo, referência obrigatória e proteção contra repetição da mesma solicitação.
- Fechamentos: agrupamento das vendas em aberto de um cliente no período, sem duplicar pedidos em dois fechamentos; saldo acompanha os recebimentos registrados em Contas a Receber.
- Produção: fila, bloqueio por pagamento, início e conclusão.
- Entregas: entregador, situação e custo real, expedição condicionada à produção concluída.
- Despesas: categoria, data, valor, situação e registro de pagamento.
- Relatórios: vendas por período, agrupamento por cliente e CSV.
- Lucratividade: custos da venda, entrega real e despesas do período. Custo desconhecido permanece pendente. Taxas e tributos devem ser lançados como despesas para compor o resultado.
- Usuários: criar conta Auth por função de servidor, editar perfil, ativar/inativar, redefinir senha e marcar opções do menu e ações permitidas.
- Auditoria: operações, acessos, produtos e eventos de vendas.
- Configurações: empresa, CNPJ, telefone, chave Pix e bloqueio de novas produções até o pagamento integral.

## Regras de acesso

Administrador tem acesso integral. Os demais perfis combinam permissões de menu (`module.*`) com permissões de consultar e executar ações. Exemplo: para estoque, habilitar “Menu: Estoque e movimentos” e “Consultar estoque”; para ajustes, habilitar também “Gerenciar estoque”. O banco verifica as permissões das ações em toda requisição. As permissões são relidas ao validar a sessão.

Gerenciamento de identidades Auth fica restrito a administradores, inclusive quando um perfil possui `users.manage`. Não é possível remover o próprio acesso administrativo. Credenciais administrativas nunca fazem parte do navegador.

## Dados e homologação

Registros antigos de teste não são convertidos em vendas reais. As funções de escrita de teste foram retiradas do acesso autenticado. Os relatórios operacionais usam apenas vendas reais. Nenhum dado fictício foi inserido de forma permanente para validar a entrega.

`tests/operations-homologation.sql` executa dentro de `BEGIN/ROLLBACK`: ajustes, entradas, custo médio, finalização, idempotência, recebimento parcial, limite de saldo, produção, entrega, fechamento, recibo, kits, falta de estoque, permissões individuais, negação ao perfil de produção e ao anônimo. Foi executado antes e depois da aplicação no projeto real.

Os testes de navegador usam interceptação isolada. Cobrem navegação dos módulos, ajuste, preservação de catálogo/pendências, divisão dos pagamentos, recibo real e cadastro/permissões. Não representam recebimento bancário nem criação permanente de funcionário na operação.

## Inicialização da operação

1. Em Configurações, preencher os dados reais da empresa e a chave Pix. Nenhuma chave ou documento foi inventado.
2. Conferir fisicamente o estoque em Estoque e Movimentos. O banco bloqueia finalização de itens sem saldo conferido ou insuficiente.
3. Conferir custos dos produtos. Ausência de custo impede apresentar lucro como apurado.
4. Cadastrar os funcionários e revisar menu e ações para cada pessoa.

O recebimento bancário é registrado manualmente mediante referência/comprovante. Esta versão não cria cobrança em adquirente nem confirma Pix automaticamente. Entradas não lançam automaticamente uma despesa; registrar despesas separadamente quando aplicável, evitando duplicar custo de mercadoria no resultado.

Cancelamento de pedido pendente continua preservado. Venda confirmada exige processo de estorno, que permanece bloqueado em vez de alterar estoque ou recebimentos indevidamente. Redes comerciais permitem fechamento individual por loja ou consolidado, com filtros de loja, unidade e período, e consulta dos valores recebidos e saldos reais. As antigas colunas de teste foram retiradas da ficha.

Os avisos de segurança do Supabase sobre funções SECURITY DEFINER autenticadas refletem o padrão de RPCs com autorização interna, `search_path` vazio e execução anônima revogada. As tabelas operacionais têm RLS e não permitem escrita direta pelo navegador. A proteção contra senhas vazadas do projeto permanece desativada no serviço Auth; não foi alterada nesta entrega.

Validação final: 178 testes automatizados, 19 testes de interface dos módulos/vendas e um teste de interface da conciliação e fechamento de redes. Compilação e verificação TypeScript aprovadas. A consulta individual de clientes também foi exercitada sob o papel `authenticated`, com negação após inativação.
