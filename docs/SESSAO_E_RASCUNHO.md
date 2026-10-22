# Sessão, unidade principal e recuperação da Nova Venda

## Causa encontrada no código

`AuthService.start()` publicava `user = null` antes de validar qualquer evento do Supabase, inclusive `TOKEN_REFRESHED` e `SIGNED_IN` repetido. O `App` então renderizava o login e desmontava a Nova Venda. A volta ao foco/aba pode emitir eventos para a mesma identidade, conforme a [documentação oficial do Supabase](https://supabase.com/docs/reference/javascript/auth-onauthstatechange).

Além disso, a preparação vivia apenas nos estados locais dos componentes, e `openNewSale()` incrementava uma `key` que forçava a remontagem da tela, mesmo ao clicar novamente em Nova Venda. Navegar para outro módulo também desmontava a preparação. Erros de conexão ao consultar perfil eram tratados como encerramento definitivo da identidade, o que podia levar à navegação inicial na revalidação seguinte.

## Comportamento corrigido

Para a mesma identidade, eventos de sessão revalidam usuário e perfil sem publicar um usuário nulo durante a consulta. As consultas Auth saem do callback síncrono para evitar disputa pelo lock interno do SDK. Respostas antigas são descartadas por geração, inclusive após logout ou troca de identidade.

`persistSession` e `autoRefreshToken` permanecem habilitados. A recuperação inicial continua validando `auth.getUser()` e consultando `erp_user_profiles`; nenhum perfil vem de metadata ou do rascunho. `SIGNED_OUT`, identidade inválida, perfil ausente/inativo e permissão negada continuam bloqueando acesso. Falha transitória de rede mantém o contexto em memória **com a interface bloqueada**, erro visível e ações para revalidar ou sair. Voltar ao foco, retornar à aba ou recuperar conexão também revalida o perfil; nenhum erro transitório é tratado como sucesso.

O cliente Supabase é reutilizado durante HMR, e a assinatura antiga de Auth é removida ao substituir o módulo. A inicialização do serviço permanece idempotente. O efeito do App remove os próprios listeners ao desmontar. A renovação de sessão preserva a tela. Por solicitação de 22/10/2026, clicar explicitamente em Nova Venda inicia outra preparação e remonta o formulário para limpar também os estados locais, como a divisão de pagamentos. Retomar pedido existente é uma ação separada em Pendências.

## Rascunho temporário

Cliente, unidade, itens/snapshots, quantidades, preços negociados, motivos, personalização, frete, desconto e observações são armazenados como **preparação**, em `sessionStorage`, separados pela URL do projeto e pelo UUID autenticado. A navegação da aba também é recuperada por projeto/usuário.

Isso permite navegar, recarregar a página e recuperar após remontagem/HMR. Cada aba mantém seu próprio rascunho e não sobrescreve outra aba. Ao sair, a interface é bloqueada imediatamente; o rascunho só fica disponível novamente depois de autenticação e perfil válidos da mesma identidade. Outro usuário não lê nem restaura o rascunho anterior. Autorizações e histórico de auditoria não são recuperados de armazenamento do navegador como se fossem provas do servidor.

Clientes, endereços e catálogo continuam sendo consultados no Supabase. Não são substituídos por registros do rascunho. A recuperação valida formato/versão/usuário; os produtos e a disponibilidade são conferidos novamente contra o catálogo lido. Snapshots recuperados são dados de preparação do navegador, não autoridade para futura gravação oficial.

**Descartar rascunho** exige confirmação e limpa somente a preparação desta aba/usuário. Navegar, renovar token e sair não descartam o rascunho automaticamente. Fechar a aba, limpar dados do navegador ou bloquear o armazenamento pode remover essa recuperação temporária; ela não é um backup permanente. Se o armazenamento falhar, a tela exibe um aviso e mantém o estado em memória.

A confirmação oficial continua desabilitada. Nenhuma venda, reserva de estoque, cobrança, produção ou movimento financeiro é criado por essa recuperação.

## Unidade principal

Uma única unidade ativa é selecionada automaticamente. Com múltiplas unidades, nenhuma é escolhida pela posição, nome, endereço ou código de importação. Sem matriz identificável, aparece orientação de seleção manual. Uma escolha manual válida é preservada na revalidação e na recarga; trocar o cliente usa somente unidades do novo UUID e reinicia o frete contextual.

A integração futura está preparada para `customer_branches.is_primary`: use `VITE_CUSTOMER_BRANCHES_PRIMARY_ENABLED=true` somente após aprovação e instalação da coluna no projeto existente. Com a opção desativada (padrão), a consulta não menciona uma coluna inexistente. Com ela ativa, uma única matriz explicitamente marcada e ativa é selecionada, independentemente da ordem. Marcadores ambíguos não causam escolha arbitrária.

A proposta [08_PAMDA_MATRIZ_FUTURA_NAO_EXECUTAR.sql](../supabase/review/08_PAMDA_MATRIZ_FUTURA_NAO_EXECUTAR.sql) está apenas para revisão futura. Ela adiciona a coluna, limita a uma matriz por cliente e exige que a matriz esteja ativa. Não foi executada. A designação das matrizes e seu gerenciamento via RPC administrativa auditada ficam para uma etapa aprovada; a proposta não marca nenhuma unidade existente e não muda RLS, GRANT ou RPC.

## Como verificar no localhost

1. Execute `npm run dev` com a configuração válida em `.env.local` e entre com uma conta ativa.
2. Em Nova Venda, escolha um cliente com unidade única e confira a seleção automática. Num cliente com várias unidades sem matriz oficial, escolha manualmente e recarregue: a escolha deve permanecer.
3. Prepare itens, quantidades, preço negociado, frete zero, desconto e observações. Recarregar ou renovar a sessão preserva a preparação. Ao clicar em Nova Venda, a tela deve iniciar zerada e o pedido anterior com produtos deve permanecer em Pendências. Para retomá-lo, selecione seu pedido em Pendências. Ao iniciar pela ficha de um cliente, somente o cliente e sua unidade padrão são pré-selecionados. O botão redundante no cabeçalho à direita foi removido.
4. Abra outra aba no mesmo endereço e use o ERP nas duas abas. Alternar entre elas e renovar a sessão não deve voltar ao login nem misturar os rascunhos. Mantenha o mesmo hostname e porta; `localhost` e `127.0.0.1` são origens diferentes no navegador.
5. Para verificar renovação, acompanhe `token?grant_type=refresh_token` no Network durante o uso, sem copiar tokens/segredos. A tela deve continuar no mesmo módulo após a renovação.
6. Para simular falha de validação, bloqueie temporariamente a consulta `erp_user_profiles` e retorne à aba: aparecerá o bloqueio de revalidação. Restaure a rede e tente novamente; a preparação deve continuar.
7. Saia em uma aba e confirme que a outra perde acesso. Autentique outra conta e confira que não recupera a preparação da primeira. Volte à conta original para recuperá-la naquela aba.
8. Teste cancelar e confirmar o descarte. Só a confirmação deve limpar o rascunho; nenhuma venda oficial será criada.

Os testes automatizados usam Supabase simulado e banco isolado; não gravam dados do projeto real. O teste de uso prolongado avança duas horas de relógio do navegador e exercita a renovação automática real do SDK contra respostas sintéticas. A homologação com a sessão real do localhost continua necessária para condições de rede e configuração específicas da máquina.

## Arquivos

- `src/services/authService.ts`, `auth.ts`, `supabase.ts` e `src/App.tsx`: ciclo de sessão, HMR, bloqueio transitório e navegação.
- `src/types/salePreparation.ts`, `src/services/salePreparation.ts`, `src/hooks/useSalePreparation.ts`, `NewSaleView.tsx` e `SalePricingPanel.tsx`: estado da preparação e recuperação por usuário/aba.
- `src/services/defaultBranch.ts`, `customers.ts`, `customerService.ts`, `customerMapping.ts`, `src/types/pamdaCore.ts`, `src/vite-env.d.ts` e `.env.example`: unidade automática e opt-in futuro da matriz.
- `tests/auth.test.ts`, `tests/sale-preparation.test.ts`, `tests/browser/session-draft.spec.ts`, suporte/expectativas de navegador: regressões de sessão, unidade, isolamento, navegação e recuperação.

> Etapa atual: a preparação selecionada já é registrada como pendência no Supabase. Consulte [VENDAS_PENDENTES.md](./VENDAS_PENDENTES.md); a confirmação oficial permanece bloqueada. As descrições de preparação exclusivamente local abaixo correspondem à etapa anterior.
