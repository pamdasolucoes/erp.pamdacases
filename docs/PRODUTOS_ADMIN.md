# SKU e arquivamento administrativo

Implementação preparada para revisão; nenhum cadastro real foi modificado e o SQL não foi aplicado ao projeto onorqcdauhxumbznosxf.

## Contratos inspecionados em 21/10/2026

Produtos usam UUID, SKU único e active. kit_components vincula por UUID. erp_panda_ia_phone_models mantém base e kit, publicação e imagens. erp_product_admin_audit já existe. As FKs de vendas, componentes, auditoria e Panda IA usam ON DELETE RESTRICT. Há RLS de atualização admin, mas os grants efetivos consultados concedem somente SELECT a authenticated: a política não autoriza DML sem o grant.

## Comportamento

- Somente perfil admin_gerencial ativo; verificação definitiva no banco, sem confiar em metadata ou interface.
- SKU normalizado em maiúsculas, sem espaços externos, único inclusive entre inativos. Índice único protege contra concorrência. Duplicatas legadas impedem a instalação, sem correção automática.
- Base e kit são encontrados por UUID em kit_components. Troca atômica de SKU e KIT-SKU com auditoria individual. Troca diretamente no kit com base física é bloqueada. Kits especiais, múltiplas bases ou vínculos inconsistentes exigem revisão manual.
- Motivo e confirmação digitando o SKU atual. Versão updated_at impede sobrescrita de cadastro antigo.
- Excluir significa active=false. Publicações Panda IA, visibilidade B2B e kits ativos dependentes bloqueiam a operação, com orientação. Arquivar o kit primeiro e depois a capa é uma decisão explícita do administrador. Não há cascata nem despublicação automática.
- IDs, códigos, estoque, snapshots de vendas, componentes, produção, imagens e vínculos Panda IA permanecem intactos. Arquivados deixam de aparecer na busca para adicionar produtos às vendas; rascunhos e histórico não são reescritos.
- Integrações externas baseadas em SKU exigem conferência antes da troca. Histórico conserva o SKU vendido.
- Exclusão física não implementada: não existe necessidade clara neste fluxo e a própria auditoria mantém referência ao cadastro.

## Instalação e impacto

Homologar supabase/review/11_PRODUTOS_ADMIN_SEGURO.sql em ambiente isolado compatível com o esquema oficial, depois revisar e aplicar antes de liberar a interface. Não executar a migration antiga init_pamda_erp para este banco. O arquivo de revisão não é aplicado automaticamente.

A RPC pública é SECURITY INVOKER e delega a função privilegiada em schema privado não exposto, com search_path vazio, acesso autenticado e validação admin em toda chamada. Não adicionar pamda_private aos schemas expostos da API. O script revoga UPDATE/DELETE direto de produtos e escrita direta de auditoria para clientes; RPCs existentes SECURITY DEFINER continuam funcionando. As tabelas de auditoria oficiais conservam RLS existente.

As operações administrativas serializam brevemente escrita nas tabelas de produtos, componentes e modelos para impedir vínculos concorrentes inconsistentes; não executar alterações em lote por esta função. As permissões do service_role são preservadas para processos internos confiáveis.

Após instalar: executar advisors de segurança e conferir grants/RLS; testar com produtos sintéticos em homologação como admin, vendedor, inativo e anon. Conferir base/kit, colisão, versão antiga, publicação, arquivamento e histórico. Não usar produtos reais para testes.

## Testes locais

`npm test`, `npm run lint`, `npm run build`; `npx playwright test tests/browser/product-admin.spec.ts`.

O teste PostgreSQL embutido usa esquema sintético representando os campos usados; não substitui homologação no esquema completo de produção. Confere atomicidade, auditoria, acesso, duplicatas, conflitos de versão, bloqueios e preservação. Testes de navegador usam API interceptada e não alcançam o Supabase real.
