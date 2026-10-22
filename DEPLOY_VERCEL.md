# Implantação na Vercel

## Configuração

O projeto é uma aplicação React com Vite. O arquivo `vercel.json` define:

| Opção | Valor |
| --- | --- |
| Framework | Vite |
| Diretório raiz | Raiz do repositório (`./`) |
| Instalação | `npm ci` |
| Build | `npm run build` |
| Saída | `dist` |
| Node.js | 24.x, definido no `package.json` |

As rotas da aplicação retornam `index.html`, permitindo abrir links diretamente e atualizar a página.

## Publicar pelo GitHub

1. Na Vercel, selecione **Add New → Project**.
2. Conecte o GitHub e autorize acesso a `pamdasolucoes/erp.pamdacases`.
3. Importe o repositório e selecione `main` como branch de produção.
4. Mantenha o diretório raiz na raiz do repositório e a configuração acima.
5. Configure as variáveis públicas abaixo e conclua a configuração do backend conforme [INTEGRACAO_PAMDA_CORE.md](./docs/INTEGRACAO_PAMDA_CORE.md).
6. Clique em **Deploy** após revisar e validar a autenticação no projeto existente.

Após a conexão, novos pushes na branch `main` iniciam uma implantação de produção.

## Variáveis de ambiente e dados

O `.env.local` fica apenas no computador e não é enviado ao GitHub. Em **Settings → Environment Variables**, configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` (ou `VITE_SUPABASE_ANON_KEY`) para o projeto existente **erp-pamda**, e faça um novo deploy.

A autenticação usa Supabase Auth. O cadastro de usuários usa a Edge Function `pamda-user-admin`. Os módulos operacionais usam o banco oficial e RPCs com autorização. O SDK persiste a sessão de autenticação; registros operacionais não são gravados em dados demonstrativos locais. Consulte [OPERACAO_REAL.md](./docs/OPERACAO_REAL.md).

Configure o domínio de produção e cada domínio de preview autorizado em `PAMDA_ALLOWED_ORIGINS` na Edge Function. Não existe conta administrativa automática. O primeiro administrador é criado manualmente pelo procedimento seguro documentado.

Variáveis `VITE_` são públicas no bundle. Nunca cadastre `service_role`, `sb_secret_` ou credenciais privadas com esse prefixo. A credencial administrativa é usada somente no servidor da Edge Function e em terminal privado para o bootstrap.

## Verificação local

```bash
npm ci
npm test
npm run lint
npm run build
npm run preview
```

O build deve gerar `dist/index.html` e os arquivos em `dist/assets`.

Referência: [Vite na Vercel](https://vercel.com/docs/frameworks/frontend/vite).
