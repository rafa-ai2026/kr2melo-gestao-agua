# Publicar o KR²MELO no GitHub Pages

> Importante: GitHub Pages hospeda os arquivos do site. Ele não transforma `localStorage` em banco compartilhado entre aparelhos. No mesmo navegador/origem, `index.html` e `mobile.html` compartilham os dados. Para computador e celular diferentes, use a sincronização em nuvem já prevista no KR²MELO (Supabase) ou transfira/restaure BKP.

1. Crie uma conta em GitHub, se ainda não tiver.
2. Crie um repositório novo, por exemplo `kr2melo-gestao-agua`. Para um sistema com dados e lógica próprios, prefira repositório **Private** durante os testes. GitHub Pages em repositório privado depende do plano/organização; se Pages não estiver disponível, use um repositório Public apenas quando estiver confortável em publicar o código.
3. Extraia o ZIP do KR²MELO no computador. Não envie os arquivos `.exe`; o `.gitignore` desta versão já os ignora quando você usa Git.
4. No repositório, use **Add file → Upload files** e envie os arquivos e pastas do site, mantendo `index.html`, `app.js`, `styles.css`, `mobile.html`, `mobile.js`, `sync.js`, `sw.js`, `manifest.webmanifest` e `assets/` na raiz.
5. Confirme o commit.
6. Abra **Settings → Pages**. Em **Build and deployment**, escolha **Deploy from a branch**. Selecione a branch `main` e a pasta `/(root)`, depois clique em **Save**.
7. Aguarde o deploy. O GitHub exibirá o endereço publicado. Normalmente será `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`.
8. Abra primeiro `index.html` pelo endereço publicado e depois use **Modo leiturista** pelo próprio menu do KR²MELO. Assim as duas telas ficam sob a mesma origem do GitHub Pages e podem compartilhar o `localStorage` naquele aparelho.
9. No celular, abra o endereço HTTPS publicado e, se desejar, use **Adicionar à tela inicial/Instalar app** do navegador. O Service Worker funciona em GitHub Pages porque ele é servido por HTTPS.
10. Antes de trocar de computador/celular ou limpar dados do navegador, gere um BKP total. Para trabalhar simultaneamente em aparelhos diferentes, configure a sincronização em nuvem e sempre confira o status antes do fechamento mensal.
