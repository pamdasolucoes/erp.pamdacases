# Retorno de clique e navegação — 16/11/2026

## Escopo da revisão

Revisão do carregamento das 22 entradas do menu, dos catálogos de clientes/produtos, do dashboard, da abertura e recuperação de vendas e da camada compartilhada de operação (estoque, produção, compras, despesas, recebíveis, fechamentos, entregas, relatórios, lucratividade, configurações e auditoria). A revisão do código é transversal; os testes de navegador exercitam os fluxos indicados abaixo. Não é uma auditoria de tempo de cada consulta da base em produção.

## Alterações

- Retorno de clique de 160 ms em botões, links, ícones dentro de botões e opções interativas, por delegação no documento. Não atrasa nem intercepta a ação. Usa escala independente para preservar as transformações do layout e opacidade para alcançar links inline. Controles desabilitados/inertes não animam; a preferência de movimento reduzido é respeitada.
- Pré-carregamento do código das telas ao passar pelo menu ou focar pelo teclado. O mesmo carregamento é compartilhado com React.lazy; falhas de pré-carregamento permitem nova tentativa. Nenhum catálogo ou operação comercial é buscado pelo hover.
- Pendências: lista e vínculos de fechamento são consultados em paralelo, após validar a identidade. Detalhes: itens, eventos e vínculos são consultados em paralelo, após validar a venda principal. Paginação, contagens e validações permanecem obrigatórias.
- As três permissões da lista compartilham uma verificação de identidade por lote, mantendo as decisões no servidor e sem cache de autorização.
- Ao trocar de pedido, o sincronizador consome uma única vez os detalhes que o chamador acabou de consultar, conferindo ID e chave do rascunho. Isso evita uma segunda leitura completa. Recuperação, revalidação e tentativas posteriores continuam lendo o servidor; a proteção de alterações não salvas permanece.
- Os vínculos da lista usam Map para evitar varrer todos os fechamentos novamente para cada venda.
- Indicação de abertura no pedido e de preparação de tela durante as etapas assíncronas. Cliques repetidos na navegação aguardando salvamento não iniciam saídas concorrentes.
- Por solicitação posterior, foco/visibilidade/retorno à rede não recarregam os dados das pendências, da venda em edição, do dashboard ou dos catálogos. Nas pendências, clicar novamente no menu, no botão de atualização ou recarregar o navegador consulta os dados. Operações concluídas também atualizam seus resultados. A validação de acesso e a renovação dos tokens continuam ativas, sem invalidar catálogos nem desabilitar campos quando a identidade/permissões não mudaram.

## Achados preservados

Os catálogos já deduplicam leituras na sessão, paginam com concorrência limitada e renderizam listas progressivamente. As telas operacionais já compartilham uma consulta por módulo/período; as respostas atrasadas são descartadas. Não foi introduzido cache entre usuários. Logout, alteração de permissões e falhas de acesso continuam limpando/bloqueando dados; uma atualização explícita com negação de RLS descarta o catálogo. Validação de sessão/permissões e salvamento antes de sair não foram removidos.

Ainda há consultas que percorrem a lista completa e os vínculos de fechamento acessíveis. Bases muito maiores podem exigir filtros/paginação de servidor, com revisão própria dos totais e da pesquisa. Isso não foi substituído por limites silenciosos. Latência real da conexão e do banco não foi medida nesta revisão.

## Verificação

Os testes de navegador verificam retorno visual em controles novos e ícones, teclado, movimento reduzido, pré-carregamento sem consultas de catálogo e abertura de outro pedido com uma única leitura de detalhes e sem gravações adicionais. As regressões cobrem edição serial, recuperação, troca de abas, sessão, permissões, mesclagem/frete, totais, recibo e fechamento direto. Testes unitários verificam também paralelismo de leituras, consumo único dos detalhes e revalidação posterior de cancelamento.

Duas expectativas antigas de pendências foram alinhadas à interface atual: personalização possui modelo/cor, e uma tentativa de frete negada deve preservar o frete anteriormente salvo, inclusive quando esse valor é zero confirmado. Nos testes de catálogo, o logout usa o nome atual “Sair”, e o registro encontrado na pesquisa é selecionado explicitamente antes de conferir sua ficha.

As medições `interaction-before.json` e `interaction-after.json` usam Chrome headless, build de produção, dados sintéticos e 20 ms por consulta de catálogo interceptada. Elas registram quatro ciclos por tela, consultas, custo de script/layout, nós e tamanho de JavaScript. A fase `before` é o commit pai limpo; a fase `after` é a árvore de trabalho desta alteração, baseada no mesmo commit. Variações pequenas de tempo em uma única execução não representam ganho garantido na conexão real.

## Ajustes de fechamento incluídos

A migração `20261117001333_merged_order_adjustments_and_notes.sql` libera frete e desconto em agrupamentos ainda pendentes, respeitando as permissões existentes de cada ajuste. Itens, vínculos de origem, cliente, filial e observações continuam protegidos. A gravação registra os valores anteriores no evento. Fechamentos confirmados permanecem bloqueados.

Os relatórios distribuem apenas a diferença dos ajustes entre os originais, com rateio cumulativo em centavos. Não há atualização dos valores gravados nas notas originais, nem duplicação do agrupamento nos relatórios. Reduzir desconto distribui a redução conforme o desconto original; aumentar usa o saldo dos subtotais, evitando desconto maior que o subtotal de um original. A migração não reescreve vendas/fechamentos existentes.

Nas novas mesclagens, as observações mantêm os números e as observações originais, sem acrescentar o nome da unidade. A filial continua no snapshot e na consulta do pedido original, inclusive após finalizar. O texto operacional abaixo da finalização foi removido.

Verificação SQL local e no projeto `erp-pamda`: ajuste de frete/desconto, preservação integral dos originais e dos IDs dos itens copiados, notas sem unidade acrescentada, rateio de centavos, desconto integral, rejeição de mudança de filial/itens/valores inválidos, finalização e consulta posterior da filial. Os dados sintéticos, produtos, pagamentos e contadores são revertidos pela subtransação de homologação. Testes locais adicionais negam individualmente as permissões de frete e desconto. Migração aplicada pelo conector; o nome local usa a versão registrada no histórico remoto.

Verificação final: 220 testes unitários passaram; os testes de navegador novos e as regressões relevantes passaram após alinhar os testes antigos à interface atual. O build de produção e a medição de navegação passaram. A primeira abertura de Nova Venda foi de 670,9 para 566,9 ms na simulação; os catálogos continuam sem consultas extras nos ciclos seguintes. O JavaScript total passou de 806.277 para 808.693 bytes (incremento de 2.416 bytes, sem novas dependências).
