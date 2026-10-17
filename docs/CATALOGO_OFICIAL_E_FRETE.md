# Catálogo oficial e preparação de frete

Referência: schema de `products` e `kit_components` confirmado pela Pamda em **16/10/2026**, criado no SQL Editor do projeto existente **erp-pamda**. A migration antiga do repositório não foi usada como contrato nem executada. Não foi criada/aplicada nenhuma migration nesta tarefa.

## Implementado

O Catálogo de Produtos, Serviços & Kits e a Nova Venda usam o mesmo `ProductsService` / `useProducts`, exclusivamente com SELECT autenticado do Supabase. A leitura solicita contagem exata, ordena pelo UUID e percorre todas as páginas pelo número efetivo de linhas recebidas. Não depende de `max_rows = 1000` nem presume que a primeira página contém todo o catálogo. Erros ou respostas incompletas não são substituídos por dados de demonstração ou localStorage.

A referência informada é **637 produtos: 316 físicos, 4 serviços, 317 kits e 634 vínculos**. Esses números são conferidos nos testes; não são limites fixos no código de produção, permitindo futuras alterações autorizadas do catálogo. O frontend exibe as quantidades efetivamente retornadas pela RLS da sessão.

O layout mantém cabeçalho, filtros, tabela e suas nove colunas: código/SKU, nome, tipo, custo direto, custo gerencial, preço, estoque, status e ações. Os filtros Todos/Físicos/Serviços/Kits/Insumos e a busca por código, SKU e nome continuam disponíveis. Acrescentados estado de carregamento, vazio, erro, atualização manual e miniaturas opcionais de 36px. Imagens inválidas/ausentes ou com erro não geram foto fictícia; imagens usam HTTPS e não enviam o referer.

Cadastro, edição, clonagem, duplicação e alteração de status de produtos estão desabilitados, com explicação na tela. Os modais de escrita existentes não são montados pelo catálogo oficial. Não se chamam `pamda_cadastrar_item_basico` ou `pamda_cadastrar_kit` nesta entrega: os testes autenticados dessas operações e sua ativação ficam para a próxima etapa.

## Mapeamento e integridade

| Supabase | Interface | Tratamento |
|---|---|---|
| `products.id` | `id` | UUID preservado |
| `code`, `sku` | `code`, `sku` | TEXT exato, sem conversão numérica, renumeração ou trim |
| `type` | `type` | `fisico`, `servico`, `kit`, `insumo` |
| `current_cost`, `managerial_cost`, `sale_price` | custos e preço | `NULL` permanece desconhecido; zero explícito continua zero |
| `current_inventory`, `min_inventory`, `max_inventory` | estoque | valores reais; máximo pode ser nulo |
| `stock_verified` | `stockVerified` | estoque não conferido recebe indicação, mesmo que seja zero |
| `image_url` | `imageUrl` | opcional, sem alterar o valor armazenado |
| `source_tab` | `sourceTab` | origem preservada |
| `kit_product_id` | `kitProductId` | UUID do kit |
| `component_product_id` | `componentProductId` | UUID do produto componente |
| `quantity`, `sort_order` | quantidade e ordem | valores reais; desempate de ordem pelo UUID do vínculo |

Os nomes, tipos e custos exibidos dos componentes vêm dos produtos relacionados por UUID. IDs de vínculos também são preservados. Vínculos órfãos, duplicatas, tipos incompatíveis ou leitura incompleta geram erro, evitando apresentar composições parcialmente inventadas. Não se associa por nome, SKU parecido ou aritmética de código. Nenhuma regra de faixa/sequência de códigos é executada no frontend.

Os preços de referência comercial citados pela Pamda não foram gravados nem usados como fallback. Sempre prevalece `sale_price` retornado pelo servidor. O custo direto da tabela é o `current_cost` armazenado, inclusive nulo. Na preparação de venda, o custo de um kit é calculado a partir dos componentes utilizados, sem atualizar o produto nem substituir um custo desconhecido por zero.

## Nova Venda e preços

O seletor carrega o catálogo oficial e os componentes do mesmo serviço. Mantém negociação unitária, preço original congelado, restauração, motivo, desconto adicional único e indicadores dos itens. Um preço original nulo permanece nulo no snapshot: o vendedor pode informar um preço apenas para a preparação. Restaurar a referência ausente limpa o campo, sem transformar ausência em R$ 0,00.

Custos nulos não geram lucro fictício. O custo gerencial ausente permanece não configurado. A diferença de preço para o catálogo fica desconhecida se não houver referência de um item. Os cálculos monetários continuam em centavos, com snapshots independentes das futuras alterações cadastrais.

Os snapshots agora identificam `catalogSource: supabase`. A autorização de demonstração da migration 07 anterior aceita somente itens de demonstração; **não é reutilizada para aprovar itens oficiais**. O frontend bloqueia essa chamada e informa a integração comercial pendente. Nenhuma mudança no SQL 07 foi feita nesta tarefa. A confirmação de vendas, recibos, estoque e financeiro permanece indisponível, inclusive por envio do formulário com Enter.

## Frete padrão do cliente

Não existe campo oficial de frete no schema atual de clientes. Por isso:

- A ficha exibe **Frete padrão (R$): Pendente de integração**.
- O formulário de edição mostra **FRETE PADRÃO (R$)** desabilitado, com aviso de que não pode ser salvo nesta etapa.
- Não foi acrescentada coluna inexistente ao SELECT nem à RPC `pamda_update_customer`.
- Os demais campos cadastrais conservam seu fluxo anterior, sem uma mensagem que afirme ter salvo o frete.
- Cadastro de novos clientes continua fora do escopo; não foi ativado um novo formulário de criação.

O modelo distingue explicitamente três situações: integração pendente, integração disponível com valor `NULL` (não configurado) e valor conhecido, incluindo zero. O adapter atual retorna **pendente**; não tenta detectar/ativar um campo futuro por suposição. Quando o contrato oficial for aprovado, o mapeamento deverá ser atualizado para fornecer a capacidade e o valor real.

## Frete da venda atual

O campo **FRETE COBRADO (R$)** é editável somente na preparação. Aceita reais com duas casas, incluindo zero, e motivo como troca, cortesia, entrega especial ou negociação. Preço inválido/negativo ou campo vazio não se tornam zero automaticamente. Sem frete configurado, o vendedor deve informar explicitamente o valor, inclusive `0,00`; o total aguarda um valor válido.

O modelo está preparado para preencher o frete padrão real quando o adapter retornar um valor confirmado do Supabase. Se for zero, preenche `0,00`; se estiver pendente/nulo, mantém vazio. Ao trocar de cliente, o campo reinicia com o padrão daquele cliente e descarta o ajuste anterior. Trocar somente a unidade não inventa outro padrão, pois o requisito é por cliente.

```text
Subtotal negociado = soma(preço praticado × quantidade)
Líquido dos itens = subtotal negociado − desconto adicional (uma única vez)
Total da preparação = líquido dos itens + frete cobrado
```

Alterar frete não altera os preços, os descontos rateados nem o cadastro do cliente. O motivo e os valores da revisão são mantidos no histórico da preparação, apenas em memória. O snapshot diferencia padrão capturado, frete efetivamente cobrado e origem manual/padrão.

**Frete cobrado não é custo real de entrega.** Esse custo continua desconhecido (`null`). As margens exibidas são dos itens após desconto, sem declarar o frete inteiro como lucro. O resultado completo incluindo entrega depende do custo real para a Pamda, ainda não informado/integrado. Não foi inventado custo zero, taxa ou política comercial.

## Banco de dados: pendências e análise para a próxima etapa

**Nenhum SQL novo foi criado ou executado nesta tarefa.** Não houve reimportação, gravação de produtos, alteração de UUID/código/SKU, atualização de vínculos, mudança de RLS ou escrita de frete em localStorage. A única consulta remota realizada foi de metadados sem linhas, com chave pública: produtos/componentes retornaram HTTP 401 / `42501` para acesso anônimo, como esperado. A leitura de dados no projeto real ainda requer homologação com uma sessão autenticada do ERP; não foram solicitadas senhas ou chaves privadas.

Mudanças SQL a especificar e revisar posteriormente, após análise comercial e autorização:

1. Definir onde persistir o frete padrão por cliente. Opção simples: uma coluna monetária **nullable NUMERIC(12,2)** em `public.customers`, com nome técnico aprovado, `CHECK` não negativo e ausência representada por `NULL`. Não preencher automaticamente os 384 registros com zero nem com outro frete. Uma estrutura comercial separada só deve ser escolhida se a análise justificar.
2. Estender a função protegida de edição e sua whitelist, permissões de coluna/RLS e auditoria. Validar duas casas/zero/NULL no backend, preservar o código comercial/UUID e a checagem de versão concorrente. Frontend e SELECT só devem adotar o novo campo após confirmar o schema e a resposta canônica de gravação.
3. Definir snapshots de venda: frete padrão da revisão, frete cobrado, custo real da entrega **separado e nullable**, motivo, preço original/praticado, desconto adicional rateado, custos, usuário/data e autorização gerencial oficial. Tudo deve participar da futura transação de confirmação, com cálculo e permissões no servidor. O navegador não pode ser a autoridade de preços/custos/aprovação.
4. Homologar `pamda_cadastrar_item_basico` e `pamda_cadastrar_kit` com contratos e perfis reais antes de habilitar quaisquer botões de escrita. Não habilitar INSERT/UPDATE direto como atalho. As três sequências comerciais existentes continuam sob responsabilidade das funções de cadastro.
5. Integrar vendas/recibos/estoque/financeiro e a autorização específica para catálogo oficial antes de liberar confirmação. Aprovação `demo_only` deve continuar inválida para vendas oficiais.

## Arquivos desta entrega

- `src/types/productCatalog.ts`: tipos oficiais e contrato comum de precificação com nulos.
- `src/services/products.ts`, `productMapping.ts`, `productService.ts`, `src/hooks/useProducts.ts`: leitura paginada e mapeamento central.
- `src/views/products/ProductsView.tsx`, `src/components/common/ProductThumbnail.tsx`: catálogo oficial preservando a estrutura visual.
- `src/views/sales/NewSaleView.tsx`, `SalePricingPanel.tsx`, `src/services/salePricing.ts`, `src/types/salePricing.ts`: catálogo oficial na preparação, nulos, negociação e frete independente.
- `src/types/freight.ts`, `src/services/freight.ts`: estados de integração, snapshot e total com frete.
- `src/types/pamdaCore.ts`, `src/services/customerMapping.ts`, `src/views/customers/CustomersView.tsx`, `CustomerEditModal.tsx`: frete padrão pendente e sem escrita.
- `src/App.tsx`: exclui produtos/kits do aviso de dados locais; os demais módulos de demonstração permanecem como estavam.
- Testes de catálogo/frete, fixtures oficiais sintéticas, mocks de API e regressão de clientes/precificação.
- README e documentação. `db.ts`, formulários legados de produtos e migrations existentes foram preservados.

## Validação reproduzível

```sh
npm test
npm run test:ui
npm run lint
npm run build
```

As fixtures sintéticas usam 637 produtos e 634 vínculos com UUIDs, além dos 384 clientes de teste. Os testes forçam limite de 37 linhas por página, validam quantidades por tipo, UUIDs/códigos/SKUs, vínculos, busca, imagens, NULL/zero, falhas de rede/permissão, ausência de fallback local e bloqueio de escrita. Frete inclui os exemplos de padrão R$ 10,00 e cobrança pontual R$ 0,00/R$ 15,00 sem alterar o padrão. O padrão disponível é testado no modelo planejado; o banco atual permanece pendente.

Os testes de navegador usam API interceptada e bloqueiam chamadas externas não previstas; os testes SQL anteriores continuam exclusivamente em PostgreSQL em memória. Isso não substitui a homologação autenticada da leitura no Supabase real, nem testa funções de cadastro de produção.

Resultado nesta entrega: **95 testes de serviços/SQL e 14 testes de navegador passaram**; `npm run lint`, `npm run build` e `git diff --check` concluídos sem erros. As capturas do catálogo e do frete em 390px foram inspecionadas. O build mantém o aviso de bundle acima de 500 kB, sem impedir sua geração.
