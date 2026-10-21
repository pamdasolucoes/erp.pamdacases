# Instalação autorizada do SQL administrativo de produtos

Em 21/10/2026, após autorização explícita do usuário, o SQL revisado de `supabase/review/11_PRODUTOS_ADMIN_SEGURO.sql` foi aplicado no projeto `onorqcdauhxumbznosxf` pela ferramenta de migrations, com nome `pamda_produtos_admin_seguro_revisado`. O bloco de instalação foi executado na transação gerenciada pela ferramenta; os SELECTs de inspeção foram realizados separadamente, antes da aplicação.

## Resultado

- RPC pública `pamda_admin_produto_acao(uuid,text,timestamptz,jsonb,text)` instalada com os nomes de parâmetros utilizados pela interface.
- Implementação `private.pamda_admin_produto_acao_impl` instalada sem execução ou acesso ao schema privado por `anon`/`authenticated`; a RPC pública delega com privilégios controlados e a implementação verifica administrador ativo.
- `pamda_admin_editar_produto` atualizada com o bloqueio de remoção de preço publicado e as demais validações revisadas.
- Índice único de SKU normalizado criado. Não havia duplicidades no preflight.
- Cache do PostgREST atualizado com `NOTIFY pgrst, 'reload schema'`, conforme a [documentação do Supabase](https://supabase.com/docs/guides/troubleshooting/refresh-postgrest-schema).
- Verificação HTTP com chave pública, sem sessão e sem UUID de produto: `401 / 42501 permission denied for function pamda_admin_produto_acao`. Isso confirma reconhecimento da assinatura pela API e negação de execução anônima; não é um teste de arquivamento administrativo real.

## Preservação dos dados

As impressões digitais de todas as linhas de produtos, componentes, modelos técnicos e auditoria coincidem exatamente entre as consultas imediatamente anteriores e posteriores à instalação. Os valores das sequências oficiais também permaneceram iguais.

- 640 produtos; 636 vínculos de componentes; 313 modelos técnicos; zero modelos publicados; cinco registros de auditoria.
- Sequências: produtos 514, especiais 104 e serviços 4.
- Nenhum produto foi cadastrado, editado, arquivado ou publicado pela instalação/verificação. Nenhuma sequência foi consumida. Nenhum teste de criação foi realizado em produção.

Os registros completos estão em `produtos_admin_pre_instalacao_20261021.json` (incluindo definição anterior da função de edição) e `produtos_admin_instalacao_20261021.json` (definições instaladas, permissões e comparação de dados).

## Advisors de segurança

O advisor apontou funções `SECURITY DEFINER` acessíveis a `authenticated`, incluindo a nova RPC pública. Neste fluxo isso é intencional: `anon` não tem execução, a implementação privada é inacessível diretamente e todas as ações verificam administrador ativo. A ocorrência não foi ocultada nem resolvida removendo o acesso necessário ao ERP. [Referência do aviso](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

Também foram reportadas quatro tabelas fora desta instalação com RLS sem políticas ([referência](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)) e proteção contra senhas vazadas desativada no Auth ([referência](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)). Nenhuma dessas configurações foi alterada no escopo desta instalação.

Não foi feito novo deploy da interface nem operação administrativa sobre um produto real. O usuário pode recarregar o ERP e repetir a ação desejada com sua própria sessão administrativa.
