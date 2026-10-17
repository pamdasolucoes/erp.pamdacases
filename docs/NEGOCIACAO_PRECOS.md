# Negociação de preços na Nova Venda

Atualização posterior: o catálogo da tela passou a usar o Supabase e o frete da preparação foi acrescentado. Consulte [catálogo oficial e frete](./CATALOGO_OFICIAL_E_FRETE.md). A autorização `demo_only` descrita abaixo continua restrita à demonstração e não é usada para aprovar itens oficiais.

A Nova Venda mantém a seleção de clientes/unidades oficiais e o carrinho de preparação. O catálogo continua sendo de demonstração (`dbService.getProducts()`). Esta atualização não grava em `public.products`, não cria vendas, não emite recibos e não movimenta estoque/financeiro. A confirmação oficial permanece bloqueada, inclusive depois de uma autorização de demonstração.

## Uso da tela

1. Adicionar produto, kit ou serviço. O preço inicial vem de `salePrice` do catálogo disponível. O item recebe uma cópia independente do preço, nome, tipo, versão, custos e composição nesse momento.
2. Editar **Preço unitário (R$)** com vírgula ou ponto e até duas casas decimais. Ao sair, a apresentação usa duas casas. Valores negativos, vazios, não numéricos ou com precisão excedente deixam o cálculo inválido; não são convertidos silenciosamente em zero. Zero é válido, mas pode exigir autorização por custo.
3. O item negociado ganha destaque e a marca **Preço negociado**. O botão de restauração usa o preço original capturado ao adicionar o item. Alterar o preço da linha não muda o cadastro, nem mesmo no catálogo local.
4. Informar o motivo quando aplicável. Motivo é obrigatório para solicitar autorização de item abaixo de custo e para desconto adicional. Não há limite de desconto percentual nem preço mínimo criado por esta entrega.
5. Se necessário, preencher **Desconto adicional total (R$)**. É um abatimento absoluto do pedido, separado da negociação unitária. Ele nunca pode exceder o subtotal negociado. Não há desconto de cliente ou condição de pagamento inventados.
6. Consultar os indicadores e o **Histórico da preparação — demonstração**. Esse histórico é apenas da tela atual e é perdido ao sair/recarregar. Não é histórico oficial de venda. Registra identidade do perfil autenticado, horário, preço original/anterior/praticado, motivo, quantidade, valor líquido, desconto e necessidade de autorização. A revisão autorizada também conserva a cópia completa dos itens analisados.

## Cálculos e precisão

Preços e descontos são inteiros em centavos. Custos unitários são congelados em micros de real (seis casas); são multiplicados pela quantidade e arredondados para centavos por linha. As quantidades de venda continuam inteiras positivas, como no controle existente. Quantidades de componentes aceitam até seis casas. Valores que excedem a precisão segura são rejeitados; isso não constitui política comercial de preço mínimo/máximo.

```text
Referência do catálogo = soma(preço original × quantidade)
Subtotal negociado = soma(preço praticado × quantidade)
Diferença por negociação = subtotal negociado − referência do catálogo (informativa)
Total líquido = subtotal negociado − desconto adicional
```

A diferença para o catálogo já está embutida no preço praticado e **não é subtraída novamente**. Não se usa `unitDiscount` legado junto com esse abatimento. O desconto adicional é rateado proporcionalmente ao valor negociado das linhas, com distribuição dos centavos residuais pelos maiores restos e desempate pela posição do item. A soma dos líquidos das linhas é exatamente o total líquido.

```text
Custo direto do kit = soma(custo atual do componente × quantidade utilizada)
Custo direto total = soma(custo direto unitário congelado × quantidade vendida)
Lucro bruto = receita líquida − custo direto total
Margem bruta = lucro bruto / receita líquida × 100
Resultado gerencial = receita líquida − custo gerencial total
Margem gerencial = resultado gerencial / receita líquida × 100
```

Para produto simples/serviço, usa-se `currentCost`. Para kit, os custos são obtidos dos produtos componentes atuais, incluindo composição aninhada, sem confiar em um `currentCost` antigo do kit ou em cópias antigas de custo na composição. Componentes ausentes, ciclos ou composição incompleta resultam em custo desconhecido; não se presume zero. A cópia da composição é preservada no item.

`managerialCost` representa o **custo gerencial total por unidade**, já incluindo o custo direto conforme o cadastro atual. Não se soma o custo direto novamente. Se não houver valor explícito, resultado e margem gerenciais ficam não configurados. Valor gerencial explicitamente zero continua zero. Receita zero tem margem **não calculável**, sem `Infinity` ou `NaN`. Não foram acrescentadas taxas estimadas, frete ou outros custos fictícios.

Os indicadores de custo/lucro são exibidos ao administrador ou ao perfil com `canViewFinancialMetrics` validado pela autenticação atual. O vendedor continua vendo o preço e o alerta de necessidade de revisão. Essa visibilidade de dados de demonstração não substitui políticas de acesso a custos reais na futura API de catálogo/vendas.

## Autorização e backend

O valor **líquido após o desconto adicional** é comparado com o custo direto e com o custo gerencial, quando conhecido. Abaixo de qualquer um deles há alerta e exigência gerencial. Custo direto desconhecido impede autorização até conferir o catálogo. Não há percentual ou piso comercial fixado.

Somente um administrador ativo pode clicar em **Simular autorização gerencial**. O frontend chama `pamda_authorize_demo_pricing`; não compara senhas nem considera um clique local como aprovação. O servidor usa `auth.uid()` e o perfil atual em `erp_user_profiles` para validar `active = true` e `role = 'admin_gerencial'`, ignorando metadados do navegador. Recalcula custos, líquidos e rateio e rejeita totais adulterados, motivos ausentes e dados inválidos.

O retorno identifica o administrador e o horário do servidor, com `scope: demo_only` e `official_sale_allowed: false`. Não é um token de autorização para venda oficial. Preços/custos enviados pelo navegador continuam sendo dados de demonstração; a função não afirma que correspondem a um catálogo oficial. Não escreve em nenhuma tabela nem mantém uma aprovação persistente de produção.

Alterar cliente, unidade, itens, quantidade, preço ou motivos/desconto invalida a simulação atual. Uma resposta atrasada do servidor é descartada se a revisão mudou. Vendedor, produção, administrador inativo e acesso anônimo não podem autorizar no backend. Se a função estiver ausente, a tela informa a configuração pendente; não há aprovação local como fallback.

A função está na **[migration 07 para revisão](../supabase/review/07_PAMDA_AUTORIZACAO_PRECOS_DEMO.sql)**, não executada no projeto real. Ela é independente das migrations anteriores de funcionários/clientes. Para ativar a simulação, revisar o arquivo e aplicá-lo somente após aprovação no projeto existente **erp-pamda**. Verificar antes que `erp_user_profiles` é confiável e funcionários não podem promover o próprio perfil. A função pública de autorização é `SECURITY DEFINER`, com `search_path` fixo e consulta somente ao perfil do próprio usuário. Helpers não têm EXECUTE para papéis de frontend. Não exige `service_role` no navegador nem altera RLS de clientes/produtos.

## Persistência oficial futura

Os contratos `ProductPricingSnapshot`, `PriceDraftReview` e os campos opcionais em `SaleItem` preparam os valores originais/praticados, custos e autorização. Não foi criada outra tabela de vendas nem aplicado o SQL antigo do ERP.

Antes de habilitar confirmação oficial, o backend de vendas deverá reler catálogo, componentes, custos e perfis autorizados no servidor, recalcular negociação/desconto, obter autorização gerencial de produção vinculada à revisão exata e persistir snapshots dos itens, rateio, usuário, data, motivos e aprovação na mesma transação da venda. Deve preservar inclusive valores históricos após alterações posteriores no cadastro e rejeitar qualquer aprovação `demo_only`. Não confiar em preço original, custo, margem, autor ou autorização enviados pelo frontend. Também são necessárias as integrações já pendentes de recibos, estoque e financeiro.

## Arquivos desta entrega

- `src/views/sales/NewSaleView.tsx`: mantém o fluxo de cliente/unidade e incorpora o painel de preços.
- `src/views/sales/SalePricingPanel.tsx`: editor, motivos, restauração, indicadores, revisão e histórico da preparação.
- `src/services/salePricing.ts`: captura independente de catálogo/composição, precisão monetária, rateio e cálculos puros.
- `src/types/salePricing.ts`, `src/types/erp.ts`: contratos de snapshots, eventos e autorização.
- `src/services/priceAuthorization.ts`, `priceAuthorizationService.ts`: chamada autenticada ao servidor e validação do retorno.
- `supabase/review/07_PAMDA_AUTORIZACAO_PRECOS_DEMO.sql`: validação e autorização de demonstração, sem escrita comercial.
- `tests/sale-pricing.test.ts`, `price-authorization.test.ts`, `tests/fixtures/pricingProducts.ts`, `tests/browser/pricing.spec.ts`: cálculos, snapshots, SQL/perfis e interface.
- `tests/browser/support/mockErp.ts`, `tests/browser/customers.spec.ts`: extração do mock compartilhado para preservar os testes anteriores de clientes.
- Esta documentação e link no README. `db.ts` foi inspecionado e permanece como serviço legado de demonstração; a nova tela não chama `createSale`.

## Testes

```sh
npm test
npm run test:ui
npm run lint
npm run build
```

Testes usam PostgreSQL em RAM e um navegador isolado com API sintética, sem credenciais ou alterações em produção. Cobrem negociação/restauração, produtos/kits/serviços, desconto único, rateio de centavos, margens/receita zero, opcionais e custo desconhecido, imutabilidade dos snapshots, autorizações por perfil, payload adulterado e resposta atrasada. A função real depende da aprovação/aplicação do SQL 07; o catálogo e o histórico oficial de vendas ainda dependem da futura integração.

Resultado desta entrega: **86 testes de serviços/SQL e 11 testes de navegador passaram**, incluindo a regressão de clientes e o editor em 390px. TypeScript e build concluídos sem erros. O build mantém o aviso de bundle acima de 500 kB. Nenhuma migration ou alteração comercial foi executada no Supabase real.
