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
5. Clique em **Deploy**.

Após a conexão, novos pushes na branch `main` iniciam uma implantação de produção.

## Variáveis de ambiente e dados

O `.env.local` fica apenas no computador e não é enviado ao GitHub. A versão atual não lê as variáveis `VITE_SUPABASE_*` e `VITE_DEFAULT_PIX_*` do modelo `.env.example`; nenhuma delas é necessária para este build. Os dados, configurações e usuários são persistidos no `localStorage` de cada navegador.

Publicar na Vercel não cria um banco de dados compartilhado. Os dados locais não são transferidos para o domínio publicado nem sincronizados entre dispositivos. A integração dos serviços com Supabase ainda precisa ser implementada para essa finalidade.

A autenticação atual é demonstrativa, com usuários padrão e login automático inicial como administrador. Para operar com dados reais, implemente autenticação no servidor e autorização no banco antes de disponibilizar o ERP à equipe.

Quando a aplicação passar a usar variáveis, cadastre-as em **Settings → Environment Variables** e faça um novo deploy. Variáveis com prefixo `VITE_` são públicas no bundle do navegador; chaves privadas devem ficar no servidor.

## Verificação local

```bash
npm ci
npm run lint
npm run build
npm run preview
```

O build deve gerar `dist/index.html` e os arquivos em `dist/assets`.

Referência: [Vite na Vercel](https://vercel.com/docs/frameworks/frontend/vite).
