# Buscas e prévia do recibo na Nova Venda B2B

A preparação continua em memória. A confirmação oficial permanece bloqueada. Nenhuma migration, RPC ou política RLS foi alterada nesta tarefa, e nenhum SQL deve ser executado para habilitar estas melhorias.

## Seleção de clientes e produtos

O campo **Cliente / Rede** reúne pesquisa e seleção. Digitar um código numérico procura exclusivamente `customer_code`: uma correspondência textual exata tem prioridade e elimina as demais sugestões. `350` e `000350` continuam códigos distintos. Sem correspondência exata, são apresentados códigos com o prefixo digitado. Pesquisa por nome ignora acentos e caixa, mantendo cada UUID independente, sem agrupar redes.

Enter escolhe o resultado destacado pelas setas ou um único resultado. Com múltiplos resultados, Enter sem destaque não escolhe automaticamente. Clique seleciona diretamente; Escape fecha a lista. Ao mudar o cliente, a unidade selecionada, o frete contextual e a autorização anterior são limpos. As unidades e a condição comercial vêm do contexto oficial, sem atribuir condições fictícias.

O campo de produtos pesquisa nome, modelo de aparelho, SKU e código, utilizando o catálogo integral carregado pelo serviço existente com paginação. Kits correspondentes aparecem primeiro, seguidos de capas físicas TPU/transparentes e outros itens. Quantidades e grupos não são fixados no código. A busca usa os valores realmente existentes no catálogo, sem criar aliases ou produtos.

A seleção adiciona o preço oficial como valor inicial. Selecionar novamente o mesmo UUID incrementa sua quantidade em uma única linha e preserva o preço negociado e a personalização. O desconto adicional é aplicado uma única vez ao subtotal negociado. O frete continua editável e aceita zero explícito.

Itens inativos não podem ser adicionados. Estoque conferido insuficiente impede adicionar/incrementar e abrir a prévia; o cálculo agrega componentes compartilhados entre kits e itens físicos. Estoque não conferido gera aviso de disponibilidade pendente, sem interpretar o saldo inicial zero como confirmação de indisponibilidade. Isso não reserva nem movimenta estoque.

## Prévia e impressão

Selecione cliente e unidade, adicione itens, informe preços válidos e um frete explícito, inclusive zero. Os campos opcionais de modelo, cor e faces da carteira pertencem somente ao item desta preparação.

**PRÉVIA DO RECIBO** captura os dados atuais e abre uma única apresentação responsiva. **Imprimir Recibo** abre a caixa padrão do navegador, onde o usuário escolhe impressora, papel e escala, sem uma segunda escolha de formato no ERP. O mesmo documento apresenta tabela em áreas largas (como A4) e blocos compactos em áreas de até 100 mm (como bobina de 80 mm), controlados por CSS de impressão. O documento apresenta a logo centralizada, o identificador visual **RECIBO Nº TESTE**, data e hora em São Paulo sem rótulo, código/nome do cliente, endereço formatado em linhas e CEP/contato quando disponíveis, além dos produtos, valores, frete e vendedor. Não mostra a identificação da unidade nem avisos de homologação no papel.

O identificador TESTE é somente visual e não é um número de recibo oficial. A prévia não possui cobrança, PIX ou confirmação de pagamento. Não cria venda, recibo persistido, lançamento financeiro, ordem de produção ou movimento de estoque, nem usa venda local como substituto oficial.

**Imprimir Recibo** monta um documento isolado, contendo apenas o recibo e seu CSS, e chama a impressão uma vez. Não fixa o tamanho de papel com `@page size`; a largura e o comprimento finais são definidos pelo usuário no navegador/driver. O documento usa o logotipo existente e estilos próprios, sem menus ou botões. Para térmica, selecione papel de 80 mm e margens compatíveis no driver da impressora; o comprimento depende da configuração de papel contínuo do navegador/driver. Desabilite cabeçalhos e rodapés do navegador se necessário.

A escolha do layout compacto usa `@media print and (max-width: 100mm)`, com variante estreita correspondente para a prévia em telas pequenas. Navegadores e drivers variam na forma como expõem a área imprimível às media queries, especialmente com margens personalizadas; confirme o alinhamento na impressora física e ajuste as margens no driver, não por escala artificial no ERP.

**Fechar e editar venda** mantém o formulário. Reabrir a prévia cria um novo snapshot com os valores e o horário atualizados. A preparação pode ser recuperada temporariamente na mesma aba após navegar ou recarregar, isolada por projeto e usuário autenticado, conforme [Sessão e rascunho](./SESSAO_E_RASCUNHO.md). Ela nunca se torna uma venda oficial por ser restaurada.

## Arquivos da implementação

- `src/components/common/SearchDropdown.tsx`: lista pesquisável acessível por teclado e mouse, estados de carregamento, erro e vazio.
- `src/services/saleSearch.ts`: busca de códigos/clientes e relevância dos produtos.
- `src/services/draftStock.ts`: validação de disponibilidade da preparação.
- `src/views/sales/NewSaleView.tsx` e `SalePricingPanel.tsx`: integração das buscas, incremento, personalização e abertura da prévia.
- `src/services/salePricing.ts`, `src/types/salePricing.ts` e `src/types/productCatalog.ts`: captura de SKU/descrição junto ao snapshot existente de preço e custos.
- `src/services/receiptPreview.ts` e `src/types/receipt.ts`: contrato e montagem pura do documento, com validações de contexto e valores.
- `src/components/receipt/ReceiptDocument.tsx`: apresentação compartilhada A4/térmica; preparada para um futuro documento com confirmação real do servidor.
- `src/components/receipt/ReceiptPreviewModal.tsx`, `src/services/printReceiptPreview.ts` e `src/index.css`: visualização, teclado, impressão e retorno ao formulário.
- `src/components/receipt/ReceiptModal.tsx` e `src/services/legacyReceipt.ts`: adaptação dos recibos locais anteriores para a mesma apresentação, identificados como demonstração.
- `tests/sale-search-preview.test.ts`, `tests/browser/sale-search-preview.spec.ts` e fixtures/seletores existentes: cobertura automatizada e regressões.

## Validação e limites

Execute `npm test`, `npm run test:ui`, `npm run lint` e `npm run build`. Os testes de navegador interceptam todas as chamadas ao Supabase com dados sintéticos: 384 clientes, 637 produtos e 634 componentes, com limite de 37 registros por resposta. Os cenários de preparação e impressão verificam ausência de requisições de escrita e preservação dos registros de entrada. O teste de impressão substitui `window.print` e inspeciona o documento isolado; não aciona impressora física.

A homologação com sessão real e impressão física A4/80 mm ainda deve ser feita no ambiente da Pamda. Não foi afirmada uma validação dos dados de produção por estes testes. A confirmação oficial e as autorizações aplicáveis às vendas reais continuam dependendo de implementação e validação do backend de vendas.

Validação local concluída em 16/10/2026: 100 testes de lógica/serviços/SQL em banco isolado e 18 testes de navegador aprovados; TypeScript e build aprovados. O build mantém um aviso de tamanho do bundle acima de 500 kB. As capturas completas dos documentos A4 e térmico ficam nos artefatos locais de `test-results/` após executar a suíte de navegador.
