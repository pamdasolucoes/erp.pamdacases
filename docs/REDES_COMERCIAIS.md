# Redes comerciais e cobrança flexível

Implementação da seção Rede de lojas em Clientes e Unidades. Não faz fusões, não modifica UUIDs, códigos históricos, pedidos ou recibos. Nenhum cadastro é associado pelo nome. A matriz da rede é um cliente existente escolhido pelo administrador; não confundir com a matriz entre filiais de um cliente.

## Contrato instalado

As migrações pamda_commercial_networks_and_flexible_billing_policies e pamda_network_defaults_and_per_unit_reporting já estão aplicadas. **Não reaplicar.** Os snapshots JSON em docs/contracts foram extraídos por consultas somente de leitura em 20/10/2026. Documentam assinaturas, corpos das seis funções, colunas, constraints e políticas RLS. Não são migrações executáveis.

- erp_customer_networks: definição, matriz e padrões da rede.
- erp_customer_network_members: vínculo exclusivo por customer_id, sequência e códigos original/derivado.
- erp_customer_billing_policies: preferência do cliente.
- erp_branch_billing_policies: preferência da unidade; campos nulos herdam.

Criação e vínculos usam pamda_admin_criar_rede e pamda_admin_vincular_cliente_rede. O servidor gera o código da matriz igual ao código da rede; demais códigos recebem sufixo -1, -2 etc. Não calcular nem gravar códigos derivados no navegador.

Preferências usam pamda_admin_configurar_cobranca_rede/cliente/filial, com os parâmetros p_*_id, p_ciclo, p_modo, p_dias e p_observacoes. Ciclos: diario, semanal, mensal, flexivel. Modos: por_unidade, centralizado, flexivel. Prazo: inteiro de 0 a 365 ou NULL. Prioridade por campo: unidade → cliente → rede. NULL de prazo também herda; o contrato atual não representa uma remoção explícita do prazo herdado.

Os exemplos Cristal Cell, Up Like, MIXX Acessórios e PC Cel apenas preenchem o formulário após escolha explícita. A gravação exige confirmação do administrador para a rede selecionada. Para PC Cel, o modo flexível é uma proposta editável; a regra fornecida só define frequência semanal e variações de prazo.

## Acesso e confirmação

O serviço valida a sessão e customers.manage antes das gravações. Rede, matriz e vínculos exigem também pamda_is_admin; o backend mantém a decisão final. Leituras seguem RLS (sales.read ou customers.manage). Nenhum INSERT/UPDATE direto é usado no cliente. Escritas não são repetidas automaticamente e são relidas para confirmação. O lote de vínculos usa uma RPC por cliente; falhas podem deixar vínculos anteriores concluídos. Atualizar a lista antes de repetir.

O relatório pamda_relatorio_rede_clientes recebe p_rede_id, p_inicio e p_fim. Datas inclusivas em America/Sao_Paulo, até cinco anos. Filtra cada unidade por customer_id E branch_id. Filtros de loja e unidade são aplicados às linhas da rede retornada. Quantidades reais/teste são separadas. Valores de compras exigem finance.read no servidor e no cliente. A UI elimina dados anteriores ao trocar rede ou período e descarta respostas antigas.

## Conciliação ainda pendente

paid_real e paid_test são NULL; payments_integrated é false. A UI sempre mostra **Conciliação pendente** para pagamentos e saldo. Não calcula saldo a partir de compras nem converte NULL em zero. Os modos individual e consolidado são preparação visual; emissão, fechamento e recebimentos estão desabilitados.

networkSettlementDraft.ts é um contrato puro, sem persistência. Valores em centavos, pagador explícito, ambiente real/teste, origem por pedido, cliente, filial e documento. Valida a soma das alocações contra o recebimento confirmado e admite valor não alocado. Não registra pagamentos.

O backend futuro deverá validar atomicamente recebimento, alocações, saldo por pedido, permissões e idempotência sob concorrência; preservar pagamentos parciais; separar reais/testes; emitir documento comercial consolidado separado dos originais. Agrupar itens somente quando produto, personalização, preço, descontos e demais atributos monetários forem equivalentes. Nenhuma dessas operações financeiras é anunciada como funcional nesta entrega.

## Validação

Testes locais exercitam as funções SQL capturadas em PostgreSQL em memória, sem conectar a produção: criação, códigos, duplicidade, preservação de cadastros/histórico, permissões, preferência e relatório. Testes do serviço verificam filtros, datas, mascaramento financeiro e contrato de alocações.

Referência da API utilizada: [Supabase JavaScript RPC](https://supabase.com/docs/reference/javascript/rpc).
