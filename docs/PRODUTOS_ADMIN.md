# Administração do catálogo PAMDA CORE

Atualização de revisão remota em 21/10/2026: a conexão de leitura ao Supabase foi utilizada posteriormente para comparar o SQL 11 com as funções, colunas, índices, permissões e relações oficiais. Não foram encontrados impedimentos estruturais na comparação. O estado observado agora é de 640 produtos, 636 vínculos e 313 modelos técnicos, todos sem publicação. Consulte `docs/REVISAO_SUPABASE_PRODUTOS.md` para o parecer e os limites; as referências abaixo à ausência de conexão e aos números anteriores descrevem as etapas anteriores. O SQL continua sem aplicação em produção.

Implementação de 21/10/2026. As assinaturas, definições das cinco RPCs, colunas, restrições, bucket e políticas de Storage foram consultados no projeto `onorqcdauhxumbznosxf` somente por leitura. Nenhuma migration, função, tabela, produto ou publicação foi criada ou alterada no projeto oficial durante a implementação.

Nesta etapa, o ambiente não disponibilizou uma conexão de leitura ao Supabase; portanto, os contratos remotos não foram reconsultados e a existência de `pamda_admin_produto_acao`/sua implementação privada continua pendente de confirmação no projeto oficial. O SQL 11 abaixo é uma proposta baseada nos contratos documentados e no snapshot local de testes, não uma confirmação do estado remoto. Não aplicar antes de comparar as assinaturas, definições, grants, índices e dados com o projeto oficial e obter aprovação.

## Funcionalidades

- Administrador ativo: Novo Produto, Nova Capa + Kit, Novo Kit Composto, Editar Produto, Duplicar Produto + Kit e Clonar Produto.
- Funcionários: consulta, busca, filtros e detalhes, sem ações de gravação ou consulta à tabela técnica restrita.
- Capa + kit: uma chamada a `pamda_admin_criar_capa_com_kit`, com preços reais obrigatórios, custos opcionais NULL e códigos gerados pelo servidor. Os exemplos de modelos são apenas sugestões de preenchimento.
- Itens independentes: `pamda_cadastrar_item_basico`. Kits existentes: `pamda_cadastrar_kit`, selecionando capa física e serviço por UUID e informando preço explicitamente.
- Clonagem abre formulário preenchido, limpa SKU e exige confirmação. Não envia código, estoque, auditoria ou visibilidade comercial do original.
- Edição: `pamda_admin_editar_produto`, somente diferenças autorizadas, motivo e versão `updated_at` original. Não oferece edição de código, SKU, tipo, estoque ou estado ativo. Produtos arquivados não podem ser editados por este formulário.
- Alterar SKU: ação específica `pamda_admin_produto_acao`; o SQL candidato deriva no servidor `KIT-<novo SKU da capa>` e atualiza o par atomicamente, com versões dos dois registros, unicidade normalizada incluindo arquivados e auditoria. A interface não oferece SKU independente para o kit. O servidor rejeita `linked_sku` arbitrário e qualquer alteração independente de kit; composição especial, associação incoerente, SKUs especiais e múltiplos kits ficam bloqueados para revisão.
- Excluir produto: arquivamento lógico por `pamda_admin_produto_acao`; exige digitação exata do SKU atual, validada na interface e no servidor. A tela lista SKUs, nomes e situações dos kits dependentes e explica o bloqueio por dependências ativas e publicação. Não arquiva nem despublica dependências automaticamente. Preserva vendas, estoque, produção, componentes, auditoria e relações do Panda IA.
- Preço de kit publicado: a proposta SQL bloqueia `sale_price: null` se existir modelo publicado ou indicador comercial ativo. Exige despublicação prévia explícita; uma tentativa bloqueada não altera preço, publicação ou auditoria. Depois da despublicação explícita, remover o preço é permitido.
- Detalhe do kit: associação técnica carregada por UUID apenas ao abrir o detalhe. Imagens e máscaras não são carregadas na listagem.
- Uploads técnicos: nomes únicos, sem sobrescrita, bucket `panda-ia-modelos`, até 10 MB. Verificação de tipo MIME, assinatura do arquivo e decodificação. Máscara PNG com pixels transparentes e visíveis; dimensões iguais ao molde; limite de 32 milhões de pixels para validação no navegador.
- Conferência técnica e publicação são escolhas explícitas. Alterar arquivos, nome ou marca limpa a conferência e a opção de publicação do formulário. O estado exibido corresponde ao último registro salvo.
- Gravação técnica: `pamda_admin_salvar_modelo_panda_ia`. Publicação exige imagens, conferência e kit ativo com preço. As RPCs continuam responsáveis pela autorização final e auditoria.
- Catálogo invalidado após confirmação das RPCs, sem recarregar a aplicação. Paginação de leitura e renderização progressiva preservadas.

## Limites dos contratos documentados

`pamda_cadastrar_kit` aceita uma capa física e um serviço, com uma unidade de cada e regras específicas de compatibilidade; não aceita uma lista arbitrária de componentes. O formulário reflete esse contrato. A duplicação automática de kit usa o fluxo capa + DTF UV; kits com composição especial são bloqueados para evitar alteração silenciosa da composição. Ampliar esse comportamento exige um contrato transacional adicional no backend e fica fora desta entrega.

Não houve alteração no repositório do Panda IA nem substituição da planilha Google. A compatibilidade de arquivos é validada no ERP por formato, alfa, decodificação e dimensões; a homologação no editor externo continua dependendo da conferência técnica. Não foi executado teste de publicação ou upload no Supabase oficial; o navegador usa API e Storage interceptados, e as RPCs são exercitadas em PostgreSQL PGlite isolado com cópias das definições reais.

O arquivo `supabase/review/11_PRODUTOS_ADMIN_SEGURO.sql` contém o SQL candidato, incluindo preflight para SKUs duplicados normalizados, índice único, RPC pública e helper privado com privilégios restritos. O teste PGlite aplica exatamente esse arquivo em esquema sintético. O arquivo não foi aplicado no projeto oficial. A proposta deverá ser ajustada caso a inspeção remota encontre implementação já existente, assinatura diferente, políticas/grants incompatíveis ou SKUs duplicados históricos.

## Arquivos

Aplicação:

- `src/views/products/ProductsView.tsx`: ações administrativas, detalhes e integração dos formulários.
- `src/views/products/ProductAdminModal.tsx`: cadastro, edição e clonagem.
- `src/views/products/PandaModelPanel.tsx`: associação, previews, uploads e publicação técnica.
- `src/services/productAdmin.ts`: contratos, validação, autorização, RPCs e upload.
- `src/services/productAdminService.ts`: conexão com identidade e cache do catálogo.
- `src/services/pandaAssets.ts`: decodificação, assinaturas, alfa e dimensões.

Validação:

- `tests/product-admin.test.ts`: contratos do serviço e validações.
- `tests/product-admin-sql.test.ts`: execução das RPCs reais em banco isolado.
- `tests/fixtures/product-admin-functions.sql`: snapshot de funções exclusivamente para testes locais.
- `tests/fixtures/product-admin-schema.sql`: estrutura exclusivamente para o banco de teste.
- `tests/browser/product-admin.spec.ts`: fluxos administrativos, permissões, uploads e publicação.
- `tests/browser/catalog.spec.ts`: atualização da expectativa das ações habilitadas para administrador.
- `supabase/review/11_PRODUTOS_ADMIN_SEGURO.sql`: proposta pendente de revisão remota e aprovação; não é migration executada.
- `docs/PRODUTOS_ADMIN.md`: registro da entrega e limitações.

## Verificação

`npm run lint`, `npm test` e `npm run build` passaram. Na revisão adicional, `npm test` executou 173 testes (173 aprovados, 0 falhas); os testes focados de serviço/SQL passaram. O SQL 11 foi aplicado apenas no PGlite isolado. As novas verificações chamam diretamente as RPCs, sem depender da interface: SKU arbitrário do kit, alteração independente do kit, kits especiais/incoerentes, remoção de preço publicado e arquivamento sem SKU exato. Para cada bloqueio, os testes comparam todos os produtos, modelos e registros de auditoria antes/depois, além dos caminhos autorizados de alteração do par e remoção de preço após despublicação explícita.

Testes de navegador: `npx playwright test tests/browser/product-admin.spec.ts tests/browser/catalog.spec.ts tests/browser/catalog-cache.spec.ts`: **16 aprovados, zero falhas** na execução completa desta revisão.

Os cenários de navegador incluem regressões de catálogo/cache, máscara opaca, dimensões incompatíveis, publicação, duplicação de capa + kit, SKU derivado, exibição dos kits dependentes, digitação do SKU para arquivar e bloqueio da remoção de preço publicado. Todas as chamadas usam mocks e registros sintéticos; não houve validação da interface conectada ao Supabase oficial.

Arquivos alterados nesta revisão: `supabase/review/11_PRODUTOS_ADMIN_SEGURO.sql`, `src/services/productAdmin.ts`, `src/views/products/ProductAdminModal.tsx`, `tests/product-admin-sql.test.ts`, `tests/product-admin.test.ts`, `tests/browser/product-admin.spec.ts` e este documento. As demais alterações existentes foram preservadas. Nenhuma chamada ao projeto oficial foi executada nesta revisão; o SQL continua aguardando nova revisão e não foi aplicado em produção.

O snapshot previamente registrado neste documento reporta 637 produtos, 634 vínculos de componentes, 312 modelos técnicos e zero modelos publicados. Esses números não foram reconsultados nesta etapa. As sequências oficiais não foram utilizadas pelos testes isolados.
