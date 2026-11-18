# Subir o projeto no GitHub

O arquivo `.env` (com as chaves do Firebase) **não** vai para o GitHub: ele já está no `.gitignore`.

## Opção A — pelo site (sem terminal)

1. Entre em https://github.com e clique em **New repository**.
2. Nome: `lalin-lanches` · marque **Private** · não marque README nem .gitignore (o projeto já tem) → **Create repository**.
3. Na página do repositório vazio, clique em **uploading an existing file**.
4. Descompacte o zip e arraste **o conteúdo** da pasta `lalin-lanches` (não arraste `node_modules`, `dist` nem `.env`).
   - Arquivos que começam com ponto (`.gitignore`, `.firebaserc`, `.env.example`) podem ficar ocultos no Windows/Mac: ative "mostrar arquivos ocultos" antes de arrastar.
5. Mensagem: `Versão inicial do sistema Lalin Lanches` → **Commit changes**.

## Opção B — pelo terminal (recomendado)

1. Instale o Git: https://git-scm.com/downloads
2. Configure uma vez:
   ```bash
   git config --global user.name "Darliton"
   git config --global user.email "darlitontrust@gmail.com"
   ```
3. Crie o repositório vazio no GitHub (passos 1 e 2 da opção A) e copie o endereço, ex.: `https://github.com/SEU-USUARIO/lalin-lanches.git`.
4. Na pasta do projeto:
   ```bash
   git init
   git add .
   git commit -m "Versão inicial do sistema Lalin Lanches"
   git branch -M main
   git remote add origin https://github.com/SEU-USUARIO/lalin-lanches.git
   git push -u origin main
   ```
   Na primeira vez o GitHub pede login no navegador.
5. Confira no site que **não** apareceu `.env` nem `node_modules`.

## No dia a dia

```bash
git add .
git commit -m "Descreva a mudança"
git push
```

## Opcional — publicar no Firebase a cada push

Com o projeto já no GitHub e o Firebase configurado:
```bash
firebase init hosting:github
```
Responda com o repositório `SEU-USUARIO/lalin-lanches`, comando de build `npm ci && npm run build` e branch `main`. Depois cadastre as variáveis do `.env` em **GitHub › Settings › Secrets and variables › Actions** e inclua-as no arquivo de workflow gerado (`.github/workflows/`), já que o `.env` não vai para o GitHub.

## Publicar pelo GitHub Pages (alternativa ao Firebase Hosting)

O GitHub Pages não executa o código-fonte: o sistema precisa ser montado (`npm run build`). O arquivo `.github/workflows/deploy.yml` faz isso sozinho a cada push.

1. **Settings › Pages › Build and deployment › Source:** troque *Deploy from a branch* por **GitHub Actions**.
2. **Settings › Secrets and variables › Actions › New repository secret** — crie 6 segredos com os valores do Firebase (os mesmos do `.env`):
   `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`.
3. Firebase › **Authentication › Settings › Authorized domains › Add domain:** `SEU-USUARIO.github.io`.
4. Firebase › **Firestore Database › Rules:** cole o conteúdo de `firestore.rules` e clique em **Publicar**.
5. Aba **Actions** do repositório: rode o workflow **Publicar no GitHub Pages** (ou faça um push). Em 1–2 minutos o site abre em `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`.
