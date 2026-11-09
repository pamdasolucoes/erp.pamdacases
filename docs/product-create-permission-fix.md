# Cadastro de novo produto: permissão individual

## Diagnóstico
A base main verificada foi 34c9ca0. O perfil de Nilu está ativo, corresponde a uma conta Auth e resolve products.manage=true. O AuthService já valida identidade, perfil e pamda_my_permissions; não usa metadata editável para autorizar. O bloqueio vinha de verificações fixas de admin_gerencial em ProductsView, ProductAdminService e pamda_cadastrar_item_basico.

## Correção mínima
Somente Novo Produto (modo basic) passa a aceitar administrador ativo ou usuário ativo com products.manage=true. O serviço confere getUser e reavalia a identidade/permissão após a consulta. O RPC usa pamda_has_permission, que consulta perfil ativo, override individual e permissões do perfil no servidor. O SQL preserva o corpo de criação e restringe EXECUTE a authenticated.

Nenhum perfil, override ou permissão de grupo é alterado. Outros usuários que já têm products.manage também terão essa autorização respeitada. Não há regra por nome ou e-mail. Edição, SKU, arquivamento, clonagem pela interface, kits e Panda IA continuam administrativos. As políticas RLS e os grants de escrita direta das tabelas permanecem iguais. As funções de kits continuam administrativas.

## Validação
- 192 testes automatizados passaram, incluindo reprodução do RPC original negando cadastro ao gerencial autorizado e execução da versão corrigida em PostgreSQL isolado (PGlite).
- Casos negativos: permissão ausente/revogada, override individual false sobre grant de perfil true, perfil inativo, sessão ausente, anon, identidade divergente e revogação durante a validação no frontend.
- 10 testes de navegador passaram: oito cenários administrativos existentes e dois novos cenários gerenciais com permissão habilitada/desabilitada. APIs sintéticas, sem uso da senha de Nilu.
- TypeScript e build passaram.
- Inspeção somente leitura no Supabase: conta/perfil, resolução de permissões, definições reais dos RPCs, políticas RLS e assessores. Logs consultados não retornaram erros correspondentes nas últimas 24h; isso não elimina o bloqueio estático reproduzido.

## Instalação pendente
Esta proposta não altera produção. Aplicar supabase/review/product_create_permission.sql e publicar o frontend para disponibilizar a correção. Conferir a definição atual do RPC antes de aplicar, pois o arquivo contém CREATE OR REPLACE com o corpo inspecionado. Validar o cadastro na sessão normal de Nilu após a publicação. Não foi realizado login real como Nilu nem criado produto de teste em produção.
