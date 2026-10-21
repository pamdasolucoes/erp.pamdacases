# Revisão do SQL de produtos no Supabase

Data: 21/10/2026. Projeto: `onorqcdauhxumbznosxf`. Arquivo comparado: `supabase/review/11_PRODUTOS_ADMIN_SEGURO.sql`.

## Parecer

A comparação de leitura com o PostgreSQL 17.11 oficial não encontrou impedimentos de estrutura, assinaturas, permissões ou duplicidade normalizada para o SQL proposto. Esta é uma revisão de compatibilidade, não uma aplicação nem uma execução dos caminhos de escrita em produção. As proteções novas ainda não estão instaladas no servidor oficial.

## Conferências realizadas

- `public.pamda_admin_editar_produto(uuid,timestamptz,jsonb,text)` existe, retorna `jsonb` e tem a mesma assinatura da proposta. A definição instalada ainda aceita `active` e não bloqueia remoção de preço publicado; a proposta substitui essa implementação e separa o arquivamento.
- `public.pamda_admin_produto_acao` e `private.pamda_admin_produto_acao_impl` não existem. O schema `private` também não existe; não há função ou permissão desse schema a sobrescrever nesta consulta.
- As colunas, tipos e restrições de `products`, `kit_components`, `erp_panda_ia_phone_models` e `erp_product_admin_audit` comportam os parâmetros, consultas e registros de auditoria da proposta. Não foram encontrados triggers nessas quatro tabelas.
- `pamda_is_admin()` verifica `auth.uid()` contra perfil ativo com role `admin_gerencial`. As funções atuais usam `SECURITY DEFINER` com `search_path` vazio. A proposta mantém a verificação de administrador e revoga execução pública/anônima; a implementação privada revoga também execução por `authenticated`.
- `authenticated` não tem INSERT, UPDATE ou DELETE efetivos nas quatro tabelas, nem por privilégios de coluna. As tabelas têm RLS e `anon` não tem SELECT. As políticas antigas de INSERT/UPDATE de `products` não concedem escrita enquanto os respectivos privilégios permanecem revogados. O SQL proposto não concede escrita direta.
- O índice `products_sku_normalized_unique` ainda não existe. A consulta por `upper(btrim(sku))` não encontrou duplicidades; não há bloqueio de dados observado para a criação proposta. Não foi criado nenhum índice durante a revisão.
- Foram encontrados 313 pares padrão elegíveis pela composição, quantidade, SKU derivado e vínculo único. Cinco kits usam convenções especiais: `KIT-VELUDO`, `KIT-MAGSAFE`, `KIT-SPACE`, `KIT-CARTEIRA-1F` e `KIT-CARTEIRA-2F`. O bloqueio desses casos na proposta corresponde às relações reais; a capa carteira possui dois kits.
- As RPCs de cadastro e publicação têm as assinaturas usadas pelo ERP. A publicação bloqueia kit inativo/sem preço e bloqueia imagem, máscara ou conferência ausentes. Ela bloqueia a linha do kit antes de gravar; a edição proposta também bloqueia a linha do produto.

## Estado observado na consulta

| Registro | Quantidade |
| --- | ---: |
| Produtos | 640 |
| Produtos ativos | 640 |
| Kits | 318 |
| Vínculos de componentes | 636 |
| Modelos técnicos | 313 |
| Modelos publicados | 0 |
| Produtos com visibilidade comercial | 0 |
| Produtos com saldo diferente de zero | 309 |

Não há inconsistência de publicação observada; atualmente não há modelos publicados. Os números anteriores de 637 produtos, 634 componentes e 312 modelos são históricos e não representam esta consulta. A revisão não identifica a origem das alterações ocorridas entre consultas e não atribui essas alterações a um usuário ou processo.

## Limites e próximo passo

Não foram chamadas RPCs de escrita, consumidas sequências, executados DDL/DML ou alterados produtos, estoque, auditoria, imagens ou publicação. Não foi feito teste com rollback no banco oficial. Os resultados anteriores de 173 testes de serviços/SQL e 16 testes de navegador pertencem à execução local já registrada; esses testes não foram reexecutados nesta revisão de leitura.

Antes de instalar, validar o candidato em ambiente isolado que reproduza a estrutura e permissões oficiais agora confirmadas, incluindo os cinco kits especiais. A futura aplicação deve repetir o preflight de duplicidade e privilégios para detectar mudanças posteriores a esta consulta e ocorrer somente após autorização explícita. Este parecer não autoriza executar o SQL em produção.
