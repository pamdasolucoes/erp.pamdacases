# Sincronização ERP + PAMDA CORE

Referência funcional recebida em 19/10/2026. O projeto existente `erp-pamda` é a única fonte oficial. Não foram aplicadas migrations, alterados cadastros ou criados registros reais para teste.

## Integrações entregues

| Área | Fonte e comportamento |
| --- | --- |
| Autenticação | Supabase Auth e perfil ativo em `erp_user_profiles`. Reconhece `admin_gerencial`, `venda_atendimento`, `producao`, `financeiro` e `estoque_expedicao`. Nenhum perfil ganha a flag financeira automaticamente. |
| Login e navegação | Login novo abre o dashboard. Recuperação de sessão já válida pode restaurar a navegação da mesma aba/usuário. Renovação e revalidação não reiniciam a tela. |
| Dashboard | `pamda_resumo_erp()`; mostra a data `as_of`, estados de carregamento/erro e os indicadores informados. NULL é “Não configurado”; zero só aparece quando retornado pelo servidor. Receitas dependem da flag financeira validada e da autorização da própria RPC. Sem gráficos, datas fixas, exemplos ou comandos de zerar dados. |
| Clientes | Leitura paginada de `customers` e `customer_branches`, sempre incluindo `is_primary`. Edição por `pamda_update_customer`, com versões esperadas de cliente e unidades, confirmação humana da revisão de endereço e validação do retorno. UUID, FK e código comercial original são protegidos também na resposta. |
| Permissões | `pamda_has_permission({ p_permission })`, sem descoberta OpenAPI. A edição cadastral consulta `customers.manage`; preço/frete e cancelamento continuam sujeitos às verificações do backend. |
| Contexto comercial | `pamda_contexto_comercial_cliente({ p_customer_id, p_branch_id })`. A resposta precisa corresponder exatamente à seleção atual. Zero da filial prevalece; NULL não é presumido gratuito. IDs de forma/prazo e limite existentes não são inventados. |
| Frete padrão | Ficha do cliente: `pamda_salvar_frete_padrao({ p_customer_id, p_amount, p_reason })` e `pamda_salvar_frete_filial({ p_branch_id, p_amount, p_reason })`. Sucesso só após reler e conferir o valor persistido. O controle visual requer `customers.manage`; a autorização específica continua no servidor. Confirmar as regras particulares das duas RPCs na inspeção. |
| Nova Venda | Matriz ativa identificada por `is_primary`; uma única unidade ativa é escolhida automaticamente. Ambiguidade exige escolha manual. Contexto comercial novo limpa os valores herdados da seleção anterior; frete negociado de pendência recuperada é preservado. `sales.shipping.override` controla a edição do frete. Custo real de entrega não é inferido. |
| Pendências | Consulta `first_product_at` e `order_number`, aceita o registro legado com número NULL e preserva `customer_snapshot.code` como TEXT; aceita `customer_code` de snapshots antigos. Não converte ou fabrica códigos. |
| Numeração e descarte | Numeração vem exclusivamente do servidor. Registro legado sem número nunca é descartado automaticamente. Administração pode revisar e confirmar descarte por `pamda_descartar_venda_vazia({ p_venda_id })`, após reler itens/histórico e confirmar a resposta. Vendas usadas só têm cancelamento protegido, com motivo e `sales.cancel`. |
| Catálogo | Mantém `products` e `kit_components` oficiais e paginados. Escritas/clonagens continuam indisponíveis até homologação. Estoque provisório permanece explicitamente não conferido. |

O salvamento de pendências permanece serializado e idempotente no início. Uma troca de cliente/unidade aguarda a consulta comercial antes de enviar novo frete/condição. A indicação de consulta pendente também é preservada na recuperação auxiliar por usuário. Falha no descarte não apaga a preparação e permite retomar a sincronização.

Fechar a aba não garante conclusão de uma RPC assíncrona. O aplicativo só limpa uma preparação após resposta de descarte confirmada; caso contrário, a pendência permanece consultável. Confirmação de venda, recibos definitivos e movimentos de estoque/financeiro continuam bloqueados.

## Operações indisponíveis

Produção, ajustes de estoque, financeiro, contas a receber, fechamentos, compras/fornecedores, entregas, despesas, relatórios, lucratividade, auditoria geral e configurações não possuem contrato homologado disponível nesta integração. Mantêm navegação, identidade visual, cabeçalhos e estrutura de consulta, com ações desabilitadas e aviso de integração pendente. Não exibem valores locais ou zeros financeiros para substituir uma consulta inexistente.

`erp_sale_events` continua sendo consultado no histórico oficial de cada venda; isso não habilita o módulo de auditoria geral.

Funcionários: a tela não invoca `pamda-auth`. O serviço antigo falha explicitamente antes de chamar a rede. Os arquivos de Edge Function e bootstrap foram preservados como referência histórica; não devem ser implantados/executados contra o schema atual sem revisão. O login operacional continua independente deles.

O ponto de entrada do aplicativo não importa `dbService`, os formulários de produtos demonstrativos ou a administração antiga. Há uma verificação do grafo real do bundle em `tests/official-entry.test.ts`. Dados empresariais locais antigos não são apagados nem reaproveitados como fallback.

## Contratos ainda necessários (por prioridade)

1. Retorno da inspeção somente leitura `supabase/review/10_INSPECAO_SINCRONIZACAO_SOMENTE_LEITURA.sql`: assinaturas/corpos das RPCs administrativas, colunas/constraints dos catálogos de pagamento, políticas e histórico das migrations.
2. Integrar criação de cliente com matriz, criação/atualização de filial e definição de matriz usando os parâmetros reais de `pamda_admin_cadastrar_cliente_com_matriz`, `pamda_admin_cadastrar_filial`, `pamda_admin_atualizar_filial` e `pamda_admin_definir_matriz`. As ações não foram ligadas a parâmetros presumidos.
3. Conectar os seletores de `erp_payment_methods` e `erp_payment_terms` e a gravação das configurações específicas. Seus campos/contratos de gravação ainda não foram fornecidos. A RPC comercial já fornece/preserva os IDs, mas não se inventam nomes ou condições. A prévia ainda depende desse catálogo para apresentar uma condição comercial nominal verificada.
4. Homologação autenticada das leituras/RPCs existentes, inclusive permissões individuais, fretes e conflitos cadastrais, por contas representativas. Nenhum teste automatizado cria dados no projeto real.
5. Versionar o dump/contrato real e as versões efetivamente registradas no banco. O repositório não deve alegar possuir um baseline sincronizado antes dessa inspeção.
6. Definir/homologar os contratos dos módulos operacionais indisponíveis e da administração de Auth. Qualquer operação com Auth Admin deve permanecer em serviço seguro; nunca utilizar credencial secreta no navegador.

## Diferença de schema e migrations

A migration `supabase/migrations/20261006000000_init_pamda_erp.sql` é histórica e não representa o banco oficial atual. Os scripts de `supabase/review` são referências/propostas/inspeções, não uma sequência de instalação automática. Não executar `db push`, reset, migration geral ou reaplicar os scripts de revisão no ambiente existente.

O administrador informou como já aplicadas: `pamda_erp_pending_view_add_first_product_at`, `pamda_erp_customer_atomic_edit_rpc` e `pamda_erp_official_commercial_context_and_summary`. Seus SQLs, versões completas e o restante do histórico ainda aguardam inspeção real. Ver `supabase/contracts/README.md`.

## Verificação

```sh
npm test
npm run test:ui
npm run lint
npm run build
```

Os testes de serviços/navegador usam backend sintético; os testes de SQL existentes executam propostas locais somente em PostgreSQL PGlite em memória. Eles não provam o corpo ou a RLS das funções atualmente instaladas. Os novos cenários cobrem resumo sem dados fictícios, NULL versus zero, receitas restritas/revogadas, herança de frete, matriz fora da primeira posição, pendência sem número, snapshots `code`, resposta cadastral divergente, espera do contexto comercial, permissões e ausência do banco local no bundle.

A única consulta real realizada nesta etapa foi `pamda_resumo_erp()` **sem sessão**, usando a chave pública: HTTP 401 / código 42501, nenhum dado retornado. Isso confirma a recusa desse acesso anônimo naquele momento, não substitui homologação autenticada nem auditoria de todas as políticas.

Resultado local: **132 testes de lógica/serviços/SQL isolado e 46 cenários de navegador aprovados**; TypeScript (`npm run lint`) e build aprovados. O build mantém um aviso de bundle acima de 500 kB, sem erro. A captura sintética do dashboard foi inspecionada visualmente. Nenhum resultado sintético deve ser interpretado como contagem ou homologação do banco real.

Não foi possível obter metadados administrativos via conexão local; não há token administrativo nem conexão Postgres configurados. A tentativa de inventariar uma sessão de navegador também falhou na inicialização da automação. A consulta de inspeção foi solicitada ao administrador, sem pedir senha ou chave privada.

## Arquivos principais

- `src/services/core.ts`, `coreService.ts`, `src/types/core.ts`: RPCs de resumo/contexto/frete e validação das respostas.
- `src/hooks/useCommercialContext.ts`, `useCorePermission.ts`: consultas por identidade/seleção, proteção contra respostas atrasadas e bloqueio enquanto a permissão não for validada.
- `src/views/OfficialDashboard.tsx`, `DashboardView.tsx`: painel oficial.
- `src/views/customers/CustomerCommercialPanel.tsx`, `CustomersView.tsx`, `CustomerEditModal.tsx`, `customerForm.ts`; serviços/tipos de clientes: cadastro e fretes oficiais.
- Serviços de pendências/workspace e telas de Nova Venda/lista: snapshots, nulabilidade, matriz, frete, retomada e descarte protegido.
- `src/components/common/UnavailableModule.tsx` e telas operacionais: retirada das fontes/gravações fictícias.
- Auth/tipos, `App.tsx`, Header e Sidebar: cinco perfis e navegação após login/recuperação.
- `tests/core.test.ts`, `tests/official-entry.test.ts`, `tests/browser/core-sync.spec.ts` e ajustes nos cenários existentes.
