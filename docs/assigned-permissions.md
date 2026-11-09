# Permissões individuais do ERP

## Resultado da revisão
Foram confrontadas as 45 opções do catálogo real (25 ações/informações e 20 menus), os controles da interface, a autenticação, os RPCs e as políticas RLS. As definições consultadas no Supabase foram usadas apenas como referência e para testes isolados; nenhuma conta ou permissão foi alterada em produção.

Os bloqueios indevidos por perfil fixo foram removidos dos fluxos de produtos (cadastro, kits, edição, clonagem, SKU, arquivamento e modelos Panda IA), clientes e filiais, condições de pagamento, redes e administração de contas. Essas ações passam a exigir a respectiva permissão, perfil ativo e identidade autenticada. A permissão users.manage é uma delegação administrativa poderosa e continua sendo necessária para gerir contas e permissões.

As ações financeiras, de estoque, produção e vendas mantêm as verificações específicas no servidor. Foram alinhadas as leituras necessárias para usuários que gerenciam uma área e as ações de homologação às permissões correspondentes. Leituras de custos continuam separadas por stock.cost. Menus sozinhos não concedem escrita. Recursos sem opção correspondente no catálogo (por exemplo, administração de grupos do Messenger e autorizações B2B específicas) não foram delegados automaticamente.

## Comportamento da tela de acessos
Ativar uma ação marca também seus requisitos de leitura e telas. Exemplo: confirmar vendas marca preparação de pedidos, consulta de vendas e as telas necessárias para abrir e finalizar o pedido. Revogar um requisito desmarca ações dependentes. As alterações são visíveis nas caixas de seleção e só são persistidas ao salvar. Não há atualização em lote dos acessos de outros usuários.

As sessões abertas revalidam as permissões a cada 30 segundos enquanto a janela está visível e ao voltar para a janela. Mudanças nas permissões remontam a tela, removendo formulários antigos; o rascunho de venda continua sob responsabilidade do workspace existente. Falhas de comunicação não concedem permissões. O banco revalida a autorização em cada escrita, independentemente do estado da interface.

## Arquivos principais
- src/services/permissions.ts: mapa único das telas, verificações e requisitos das ações.
- src/services/access.ts e authService.ts: acesso aos módulos e carregamento de permissões.
- src/services/productAdmin.ts, customerEdits.ts e customerNetworks.ts: autorização dos serviços.
- src/views/products, customers, managerial/UsersView.tsx, OperationsView.tsx e sales/OfficialSalesView.tsx: controles das ações.
- src/App.tsx: atualização das sessões e descarte de formulários com autorização antiga.
- supabase/review/assigned_permissions.sql: atualização transacional das verificações dos RPCs e RLS, preservando os corpos e validações de negócio existentes.
- supabase/functions/pamda-user-admin/handler.ts: valida users.manage no servidor antes de criar contas ou redefinir senhas.

## Validação
Resultado final: 215 testes automatizados e 23 cenários de navegador passaram. TypeScript, build e verificação de whitespace passaram.

Testes de todas as ações do catálogo em cinco perfis não administrativos; ações negadas para perfil inativo e troca obrigatória de senha; dependências e revogações; autorização positiva e negativa de 17 RPCs; negação individual prevalecendo sobre permissão de perfil; sessão ausente; RLS e isolamento do bucket; ausência de escrita direta; reaplicação idempotente do SQL.

Também foi executado cadastro real de capa+kit e edição por gerencial autorizado em PostgreSQL isolado, mantendo os testes existentes de atomicidade, concorrência, custos desconhecidos, SKU, composição, auditoria, arquivamento e publicação. Os snapshots em tests/fixtures/permission-* contêm apenas estrutura, definições e catálogo; não incluem registros ou credenciais de usuários.

Validação do navegador com APIs sintéticas: concessão e revogação sem novo login, cadastro de produto autorizado/negado, cadastro de cliente por gerencial, opções de filiais e pagamento, matriz de acessos delegada, clientes e pagamentos administrativos, redes, operações e produtos. Os testes antigos de cadastro de cliente foram atualizados para o código automático e a seleção explícita do cadastro após recarregar a página.

## Instalação
1. Revisar e aplicar supabase/review/assigned_permissions.sql como uma transação. Ele já cobre o cadastro básico; não aplicar o arquivo antigo product_create_permission.sql depois deste.
2. Publicar a função pamda-user-admin atualizada e o frontend.
3. Conferir as opções do usuário na tela de acessos; para combinações históricas incompletas, reativar a ação desejada e salvar os requisitos apresentados.
4. Validar com as sessões normais dos usuários. Os testes não usaram senhas reais nem criaram produtos/clientes em produção.

O envio ao GitHub, a integração da branch e a instalação em produção são estados distintos. O código local e os testes não tornam a correção ativa no ERP publicado por si só.
