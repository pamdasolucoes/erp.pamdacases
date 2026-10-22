# Vendas pendentes e cancelamento autorizado

Integração baseada no contrato confirmado pelo administrador do `erp-pamda`. Não requer migrations nem alterações de tabelas, RPCs, GRANT ou RLS. Não foi executado SQL no projeto real nesta entrega.

## Início e salvamento

Abrir Nova Venda sem cliente/unidade não chama uma RPC de criação. Selecionar cliente e unidade oficiais ativos inicia imediatamente a pendência por `pamda_iniciar_venda(p_cliente_id, p_filial_id, p_draft_key)`, inclusive sem produtos. O servidor reserva o número provisório (a partir de 10000); o frontend apenas consulta e exibe `erp_sales.order_number`, sem calcular números. A chave é gerada e guardada antes de enviar a solicitação; falhar ou repetir não gera uma nova chave. Cliente/unidade da tentativa original ficam preservados enquanto se aguarda a resposta. Mudanças posteriores atualizam o mesmo UUID pela RPC de salvamento.

O UUID retornado é validado e persistido antes do primeiro salvamento. O primeiro produto é enviado imediatamente pela fila serializada e a interface só considera a inclusão concluída após confirmar a RPC e consultar `first_product_at`. A partir desse instante o número é definitivo e não pode ser reutilizado, ainda que o carrinho volte a ficar vazio. `pamda_salvar_rascunho_venda` recebe sempre `p_venda_id` para uma venda já iniciada; o aplicativo nunca usa essa função com UUID nulo para criar outra venda. Parâmetros enviados:

- `p_cliente_id`, `p_filial_id`, `p_itens`;
- `p_frete`, `p_desconto`, `p_motivo`, `p_observacoes`;
- `p_venda_id`, `p_forma_id`, `p_prazo_id`.

Itens levam `product_id`, `quantity`, `unit_price` e `customization`. A personalização mantém modelo, cor e faces (`walletFaces`), além de propriedades JSON já salvas. O motivo individual de preço, quando informado, fica em `customization.priceChangeReason`. Nenhum parâmetro SQL adicional foi criado. O desconto absoluto é enviado uma única vez; o preço unitário já inclui a negociação.

Carrinho vazio e frete ainda não informado são enviados como `[]` e `NULL`. Zero de frete explícito continua sendo zero. Desconto positivo exige motivo. Valores inválidos não sobrescrevem a última versão válida do servidor: a tela informa o erro e conserva a edição local até corrigi-la. O limite oficial é de 200 itens.

O salvamento usa uma fila por preparação, independente da montagem da tela. Solicitações são serializadas; mudanças intermediárias ainda não enviadas são agrupadas. Respostas antigas não substituem o formulário atual nem anunciam que alterações posteriores já foram salvas. Web Locks, quando disponíveis, também impedem chamadas concorrentes à mesma venda entre abas desse navegador. `Salvando`, `Salvo · Pendente` e `Erro ao salvar` refletem a resposta real; o UUID de retorno deve corresponder à venda enviada.

O início não espera um debounce. As edições posteriores aguardam 250 ms após a última alteração para reduzir requisições; a saída para a lista ou abertura de outra pendência força o envio da última revisão. Reverter uma edição antes desse envio cancela o snapshot intermediário, e reverter durante uma gravação agenda a revisão corrigida.

Cada operação valida a identidade atual. Sessão trocada ou suspensa pausa as novas gravações. RLS e as permissões internas das RPCs continuam sendo a autoridade para propriedade da venda, desconto, frete e cancelamento. Não há INSERT/UPDATE/DELETE direto nas tabelas pelo frontend.

## Recuperação e navegação

Sair da tela mantém a fila e a pendência. Atualizar a página reconsulta `erp_sales`, `erp_sale_items` e `erp_sale_events`. Uma preparação local sem alterações pendentes é substituída pelos dados efetivamente lidos do servidor. Alterações ainda não confirmadas permanecem disponíveis para nova tentativa, isoladas pela URL do projeto, UUID autenticado e aba.

`sessionStorage` é uma recuperação auxiliar de edição e da chave de início, não a fonte oficial das pendências. Após fechar a aba, use **Pendências → Pendências** e selecione o número ou **Abrir venda / recibo**. A venda existente abre no mesmo formulário editável da Nova Venda; não é iniciado outro pedido. A ação continua sujeita à permissão `sales.draft` e às regras de propriedade. A consulta lê `erp_pending_sales` e funciona sem o armazenamento local, carregando itens por `sale_id`, valores, condições existentes e snapshots oficiais.

Ao sair da Nova Venda ou iniciar outra venda, primeiro é aguardado o salvamento da fila e consultado o progresso oficial. Se `first_product_at` ainda for nulo, o app chama `pamda_descartar_venda_vazia`; somente após resposta `true` a preparação local é limpa e o servidor pode reutilizar o número. Se já houve produto, a pendência é preservada, mesmo com carrinho vazio. Falha ou resposta negativa da RPC bloqueia navegação/limpeza e preserva o estado local. **Nova venda**, dentro do formulário, segue a mesma regra antes de abrir outra preparação vazia. Não há cancelamento automático de venda que já teve produtos.

No fechamento de aba/navegador, o frontend tenta chamar `pamda_descartar_venda_vazia` quando tem evidência local de uma venda sem produtos e sem gravação em andamento. Esse envio é de melhor esforço: o navegador pode encerrar a página antes de entregar ou concluir a solicitação. Não há prazo de expiração implementado ou presumido. Como trabalho futuro, o PAMDA CORE pode oferecer uma rotina administrativa segura para identificar reservas abandonadas a partir dos dados oficiais (incluindo `first_product_at` e estado da venda), confirmar a elegibilidade e liberar apenas vendas sem produtos; a retenção e qualquer prazo precisam ser definidos pelo responsável de negócio antes de implementar.

Não feche o navegador enquanto a tela indicar erro ou salvamento em andamento. O aviso de saída não substitui uma confirmação do servidor; interrupção de rede ou encerramento forçado antes da resposta pode exigir consulta às pendências e nova tentativa. Nunca se afirma que uma operação foi salva antes dessa confirmação.

## Consulta, detalhes e cancelamento

Todas as Vendas usa registros oficiais, sem vendas fictícias como fallback. A consulta a partir da ficha de um cliente aplica seu UUID como filtro. A lista mostra cliente/código, início, vendedor, valor atual, atualização e situação. `draft` é apresentado como **Pendente**. O Histórico lê vendas `cancelled` e `confirmed` de `erp_sales` e mantém acesso aos detalhes e eventos.

As ações de editar e cancelar consultam `pamda_has_permission(text)`. Como o contrato recebido não especificava o nome do argumento dessa função, o serviço descobre o nome declarado pelo OpenAPI autenticado (`supabase.getOpenApiSpec()`), sem tentar nomes presumidos. Se não for possível verificar o contrato/permissão, as ações ficam indisponíveis com aviso; não se concede acesso por fallback. A decisão é confirmada novamente pelo backend em cada escrita.

Cancelar exige `sales.cancel`, motivo não vazio e confirmação em um diálogo. A ação só é oferecida para pendências com `first_product_at` preenchido. A fila da venda é pausada e uma requisição já enviada termina antes do cancelamento. A aplicação chama somente `pamda_cancelar_venda(p_venda_id, p_motivo)`, depois lê o registro para confirmar `cancelled`. O registro e seu número nunca são apagados ou reutilizados. O histórico mostra data, motivo e responsável conforme a leitura autorizada pelo servidor. Se a RLS dos perfis impedir ler o nome de outro funcionário, a interface informa que a identificação não está disponível para aquela conta; não mostra UUID como nome.

Vendedores sem concessão não recebem botão de cancelar. Uma concessão individual já existente é reconhecida pelo backend; esta entrega não concede permissões automaticamente nem adiciona interface de concessão, conforme a etapa futura indicada pelo administrador. Revogação posterior continua sendo respeitada na RPC.

Vendas canceladas ou confirmadas são bloqueadas para edição. Cancelamento de confirmadas não é oferecido; a própria RPC deve rejeitar essa tentativa. Não há estorno ou confirmação fictícia.

## Valores históricos e condições comerciais

Na retomada, códigos, SKUs, descrições, quantidades, preços e personalização vêm de `erp_sale_items`. O contrato dessa tabela não fornece custo histórico nem preço original de catálogo: esses valores não são inventados a partir do cadastro atual. Restaurar preço fica indisponível quando o preço original não está no histórico. A tela comercial não exibe UUIDs, custos ou margens.

`payment_method_id` e `payment_term_id` existentes são preservados e reenviados; novos rascunhos usam NULL quando não há configuração. A tela consulta os catálogos oficiais para permitir selecionar forma e prazo, posicionados depois dos produtos. Enquanto não há condição selecionada, a tela e a prévia não exibem o texto “não configurado”.

O layout de prévia A4/80 mm foi mantido. **Ver / imprimir recibo** abre a prévia e oferece impressão, sem número oficial e sem confirmar venda ou pagamento. Ao continuar uma venda, o nome do vendedor registrado é preservado na prévia. Nenhuma dessas operações movimenta estoque, produção ou financeiro.

## Validação e limites

Os testes usam dados sintéticos e backend simulado conforme o contrato fornecido; não são homologação das funções SQL reais ou prova das políticas instaladas. Não foram criados registros reais para teste. Cobrem início vazio, navegação imediata, resposta perdida/idempotência, serialização, remoção de itens, frete/desconto, retomada sem armazenamento, troca de identidade, permissão individual, revogação, cancelamento com histórico e rejeição de confirmadas, além da regressão de sessão/recibos.

Execute `npm test`, `npm run test:ui`, `npm run lint` e `npm run build`. A homologação autenticada deve ser realizada pela Pamda no ambiente apropriado, incluindo uma conta de vendedor e uma conta com `sales.cancel`, sem usar credenciais privadas no frontend.

Validação local concluída: 123 testes de lógica/serviços/banco isolado e 36 cenários de navegador aprovados; lint e build aprovados. A verificação adicional do recibo confirmou que visualizar/imprimir uma pendência já salva não envia novas gravações. O build mantém um aviso de bundle acima de 500 kB, sem erro de compilação.

O contrato atual não oferece versão esperada de atualização. A fila evita concorrência na instância do aplicativo e, com Web Locks, serializa chamadas entre abas; não implementa controle transacional de conflitos entre computadores diferentes. A decisão final e os snapshots permanecem no servidor. A interface de quantidade existente utiliza inteiros positivos: itens fracionados externos são mantidos para consulta e não são arredondados silenciosamente para autosave.

## Finalização de homologação

Vendas de teste são finalizadas somente pela RPC `pamda_finalizar_venda_teste`, iniciada pelo botão autorizado no rodapé ao lado da prévia. A divisão entre múltiplas formas e valores é informada na etapa de homologação; o contrato de rascunho (`p_forma_id`, `p_prazo_id`) suporta apenas uma forma e um prazo e não persiste divisões antes da finalização. A venda, os pagamentos e o recibo são relidos do PAMDA CORE antes da confirmação na interface; o histórico marca o estado **Concluída - TESTE** e permite consultar pagamentos e recibo. O browser não grava pagamentos ou recibos diretamente, não movimenta estoque/financeiro real e não inclui esses valores no faturamento oficial. A confirmação manual de pagamento ERP usa `pamda_confirmar_pagamento_teste` com justificativa; pagamentos do site permanecem pendentes/agendados até confirmação futura validada pelo webhook do provedor.

Ao fechar ou recarregar uma aba, o evento `pagehide` tenta descartar pela RPC uma venda que nunca teve produto salvo. Navegadores não garantem que essa requisição seja entregue. Como melhoria futura, o servidor pode oferecer uma rotina administrativa de reconciliação de rascunhos abandonados, usando `first_product_at IS NULL`, presença/ausência de itens e proteção contra atualizações concorrentes; a rotina deve chamar a lógica segura de descarte e nunca inferir um prazo de expiração até que a Pamda defina formalmente esse prazo.

## Arquivos

- `src/types/pendingSales.ts`, `src/services/pendingSales.ts`: contratos oficiais, consultas paginadas, identidade, permissões, RPCs e leitura dos eventos.
- `src/services/pendingSaleMapping.ts`: valores monetários, payload e recuperação dos snapshots reais.
- `src/services/serialSaveQueue.ts`, `pendingDraftSync.ts`, `saleWorkspace.ts`, `preparationStore.ts` e `src/hooks/useSalePreparation.ts`: fila, continuidade fora da tela e recuperação auxiliar por identidade.
- `src/types/salePreparation.ts`, `src/types/salePricing.ts`, `src/services/salePreparation.ts`: metadados da pendência, pagamento e personalização.
- `src/views/sales/NewSaleView.tsx`, `SalePricingPanel.tsx`, `OfficialSalesView.tsx`, `SalesListView.tsx` e `src/App.tsx`: formulário, lista oficial, detalhes e cancelamento.
- `tests/pending-sales.test.ts`, `tests/fixtures/pendingSalesBackend.ts`, `tests/browser/pending-sales.spec.ts`, `tests/browser/support/mockSales.ts` e ajustes nos testes existentes: contrato e fluxos de regressão.
