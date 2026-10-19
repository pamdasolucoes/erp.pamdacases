# Sincronização ERP + PAMDA CORE

Contrato confirmado pelo administrador em 19/10/2026, diretamente no projeto existente **erp-pamda**, ID `onorqcdauhxumbznosxf`. O aplicativo usa esse banco como única fonte oficial. Não foram executados SQL, migrations, mudanças de RLS ou testes com gravação em produção.

## Integrações entregues

| Área | Fonte e comportamento |
| --- | --- |
| Autenticação | Supabase Auth e perfil ativo em `erp_user_profiles`. Preserva o login atual por e-mail/senha e os cinco perfis oficiais. Não utiliza a Edge Function antiga `pamda-auth`, credenciais de demonstração ou login automático. |
| Sessão | Login novo abre Dashboard; sessão válida pode restaurar a navegação da mesma aba/usuário. Renovação e revalidação não reiniciam a tela nem a preparação. Erro transitório bloqueia acesso até validação; logout real e perfil negado continuam encerrando o acesso. |
| Dashboard | `pamda_resumo_erp()`, com data de referência. NULL permanece “Não configurado”; zero depende da resposta. Receitas exigem `pamda_has_permission('finance.read')` e a filtragem da RPC. Revalidação de perfil e foco atualizam permissões. |
| Clientes | Leitura paginada de `customers` e `customer_branches`, incluindo `is_primary`, `default_shipping_fee` e `shipping_fee_override`. Código comercial TEXT preservado exatamente; UUIDs e vínculos não são substituídos. |
| Edição cadastral | `pamda_update_customer` com versões esperadas, campos permitidos, confirmação humana de endereço revisado e validação do retorno `{customer, branches}`. Código, UUIDs e FKs protegidos. |
| Cliente novo | `pamda_admin_cadastrar_cliente_com_matriz`, código informado explicitamente, campos vazios sem políticas fictícias. Retorno TABLE validado e cadastro relido antes de mostrar sucesso. |
| Filiais | Criar por `pamda_admin_cadastrar_filial`, editar por `pamda_admin_atualizar_filial`, trocar matriz por `pamda_admin_definir_matriz` com confirmação. Releitura valida unidade, cliente e matriz. Nenhum agrupamento por nome. |
| Frete | Contexto por `pamda_contexto_comercial_cliente`. Filial prevalece sobre cliente, inclusive zero. NULL é não configurado. Escrita pelas duas RPCs de frete, motivo obrigatório e releitura. Interface consulta `customers.shipping.manage`; backend mantém autoridade. Custo real da entrega é independente. |
| Pagamentos | Catálogos paginados `erp_payment_methods`/`erp_payment_terms`. Seletores operacionais mostram somente opções ativas reais, sem selecionar automaticamente à vista. Vínculo salvo ausente/inativo permanece preservado e identificado como indisponível. |
| Condições do cadastro | Leitura de `erp_customer_payment_settings`/`erp_branch_payment_settings`; escrita pelas RPCs administrativas. NULL não vira limite zero. Edição/visualização de crédito exige `finance.read`; edição dos demais campos preserva o limite anterior. |
| Catálogo de pagamentos | Administração cria/atualiza formas e prazos pelas duas RPCs `pamda_admin_salvar_*`. Formulário novo começa vazio; código existente é somente leitura. Nenhuma condição é criada automaticamente. |
| Nova Venda | Matriz ativa oficial ou unidade ativa única automática; ambiguidade exige seleção manual. Contexto fornece frete e IDs de pagamento. Troca de cliente/unidade limpa herança anterior e aguarda o servidor. Negociação de pendência retomada é preservada. |
| Pendências | Início idempotente, salvamento serial e retomada oficial. Preserva `first_product_at`, `order_number` e snapshots `code`/legado `customer_code`, além de forma/prazo selecionados. Confirmação oficial permanece bloqueada. |
| Numeração/descarte | Controlados pelo servidor. Legado sem número nunca é descartado automaticamente; revisão administrativa chama descarte protegido. Histórico com produtos exige cancelamento autorizado, com motivo. Fechar aba não garante conclusão de RPC. |
| Recibo | Layout aprovado A4/80 mm preservado, sem adicionar blocos ao documento. O modelo de dados da prévia acompanha a condição nominal consultada do catálogo; os seletores e o resumo da Nova Venda exibem os nomes. Continua identificado como teste, sem recibo definitivo ou baixa financeira. |
| Produtos | Catálogo oficial `products`/`kit_components`, sem fallback local. Escritas/clonagens/ajustes bloqueados até homologação. Estoque não conferido não representa saldo físico validado. |

Ações administrativas de cadastro/pagamento exigem perfil administrativo e `customers.manage` na interface; RPCs e RLS validam a autorização real no servidor. Não há INSERT/UPDATE/DELETE diretos para substituir RPCs.

Gravações administrativas não são repetidas automaticamente pelo cliente Supabase. Criação de cliente/filial não possui chave de idempotência no contrato: resposta perdida ou retorno incompatível exige revisar a lista antes de repetir, e o formulário bloqueia novo envio naquela tentativa. Sucesso depende de resposta e releitura oficiais, sem atualização otimista que simule gravação.

A RPC administrativa de atualização de filial não recebe versão esperada. Há conferência prévia de `updated_at`, mas ela não garante atomicidade entre leitura e gravação. Para edição concorrente com controle transacional, use **EDITAR** do cliente, que mantém `pamda_update_customer`. CAS na RPC administrativa depende de futura revisão do backend.

## Verificar no localhost

1. Em `.env.local`, manter a URL do projeto existente e chave pública publishable/anon. Nunca usar `service_role`/secret. Reiniciar `npm run dev` se as variáveis mudarem.
2. Entrar com conta Auth existente e perfil ativo. Conferir Dashboard no login e ausência de reinício durante renovação.
3. Consultar clientes, código com zeros à esquerda, nome, matriz e endereço. Quantidades são retornadas pela RLS, sem lista fictícia alternativa.
4. Conferir frete NULL como não configurado. Após autorização administrativa, homologar alterações somente em registros/ambiente aprovados. Zero e vazio são distintos.
5. Abrir Nova Venda, conferir matriz, herança comercial, opções ativas e prévia. Navegar, atualizar e retomar a pendência. Não concluir a venda.
6. Com contas representativas, verificar recusa de administração/frete/dados financeiros sem permissão. Conferir autorização/grants/RLS no servidor; não desabilitar RLS.

Segundo o contrato confirmado, não há configuração nova de banco necessária. Não executar a inspeção 10 para prosseguir: as assinaturas já foram fornecidas. Homologação autenticada de produção depende de contas autorizadas e não foi realizada pelos testes automatizados.

## Operações ainda indisponíveis

Produção, ajustes de estoque, financeiro/recebíveis/fechamentos, compras/fornecedores, entregas, despesas, relatórios, lucratividade, auditoria geral e configurações mantêm navegação/estrutura visual com ações desabilitadas. Não foram fornecidos contratos homologados para operação oficial. `erp_sale_events` permanece no histórico individual de vendas.

Administração de funcionários continua indisponível: o antigo serviço não chama `pamda-auth`. Login/perfil oficiais são independentes desse serviço. Futura administração de Auth exige backend seguro.

O bundle não importa `dbService`, formulários demonstrativos de catálogo ou administração legada. Dados empresariais locais antigos não são apagados nem usados como alternativa. Preparação auxiliar continua isolada por usuário/projeto e não equivale a venda oficial.

## Banco e migrations

O administrador confirmou **18 migrations registradas**. Mais recentes:

| Versão | Nome |
| --- | --- |
| 20261019154725 | pamda_erp_pending_view_add_first_product_at |
| 20261019154834 | pamda_erp_customer_atomic_edit_rpc |
| 20261019155051 | pamda_erp_official_commercial_context_and_summary |

Já aplicadas; não executar novamente. Histórico completo/corpos SQL não foram fornecidos: não foram inventados dump ou migrations equivalentes. Migration geral antiga e scripts de revisão são históricos/propostas. Veja [contratos versionados](../supabase/contracts/README.md).

## Testes

```sh
npm test
npm run test:ui
npm run lint
npm run build
```

Serviços/navegador usam contratos sintéticos e rede interceptada. SQL usa propostas locais em PostgreSQL PGlite em memória, sem validar os corpos/RLS instalados. Cenários cobrem autorização, códigos, paginação, concorrência, NULL/zero, matriz, ausência do banco demonstrativo, resposta perdida sem repetição, pagamentos e retomada/recibo.

Consulta real anterior de resumo sem sessão foi recusada (HTTP 401/42501). Isso não substitui homologação autenticada nem auditoria de todas as políticas. Nenhum teste atual cria registros reais.

Resultado local: **140 testes de lógica/serviços/SQL isolado e 53 cenários de navegador aprovados**, TypeScript e build sem erros. O build mantém aviso de bundle acima de 500 kB (aproximadamente 652 kB antes de gzip). A captura sintética da Nova Venda/prévia foi inspecionada visualmente.

Erros corrigidos nesta conclusão: frete cadastral usava a permissão genérica em vez de `customers.shipping.manage`; financeiro dependia somente da flag do perfil em vez de `finance.read`; revalidações próximas podiam manter um resumo financeiro anterior. Cadastros administrativos e pagamentos estavam sem os contratos completos e agora usam as assinaturas confirmadas. Retornos perdidos/incompatíveis não simulam sucesso nem disparam criação repetida automática.

## Arquivos principais

- `src/services/core.ts`, `src/views/OfficialDashboard.tsx`, `src/hooks/useCorePermission.ts`: resumo, contexto e autorizações.
- `src/services/customers.ts`, `customerMapping.ts`, `customerAdmin.ts`, `src/views/customers/CustomersView.tsx`, `CustomerRegistrationModal.tsx`: cadastro/filiais/matriz. `CustomerEditModal.tsx` preserva edição atômica.
- `src/services/payments.ts`, `src/types/payments.ts`, `src/hooks/usePaymentCatalog.ts`, `src/components/common/PaymentSelect.tsx`: contratos/catálogos.
- `src/views/customers/CustomerCommercialPanel.tsx`, `CustomerPaymentPanel.tsx`, `PaymentCatalogModal.tsx`: fretes e condições oficiais.
- `src/views/sales/NewSaleView.tsx`, `SalePricingPanel.tsx`, `src/services/receiptPreview.ts`: seleção e prévia nominal de pagamento.
- `tests/core-admin.test.ts`, `tests/browser/core-admin.spec.ts`, `tests/fixtures/coreAdminBackend.ts`: novos cenários isolados.

## Pendências por prioridade

1. Homologação autenticada com contas/perfis representativos, incluindo permissões individuais, frete, condições, retomada e conflitos. Não usar produção para testes automatizados.
2. Exportar/revisar dump e histórico completo das 18 migrations por conexão administrativa autorizada. Isso não bloqueia os contratos confirmados nem autoriza execução de SQL.
3. Homologar confirmação, recibos definitivos e operações de estoque/financeiro/produção; manter ações bloqueadas.
4. Integrar administração de Auth e gravações do catálogo após fornecimento/homologação dos contratos.
