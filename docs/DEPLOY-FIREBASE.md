# Publicar o Lalin Lanches no Firebase

Tempo estimado: 30 minutos. O plano gratuito do Firebase (Spark) é suficiente para começar.

## 1. Instale o que precisa no computador

1. **Node.js** versão LTS: https://nodejs.org (instale com as opções padrão).
2. Abra o terminal (no Windows: *PowerShell*) e confira:
   ```bash
   node -v
   npm -v
   ```
3. Instale a ferramenta do Firebase:
   ```bash
   npm install -g firebase-tools
   ```

## 2. Crie o projeto no Firebase

1. Acesse https://console.firebase.google.com e entre com **darlitontrust@gmail.com**.
2. **Adicionar projeto** → nome `lalin-lanches` → pode desativar o Google Analytics → **Criar**.
3. Anote o **ID do projeto** (aparece embaixo do nome, ex.: `lalin-lanches-1a2b3`).

## 3. Registre o app Web e copie as chaves

1. Na página do projeto, clique no ícone **Web** (`</>`).
2. Apelido: `lalin-web` → marque **também configurar o Firebase Hosting** → **Registrar app**.
3. Vai aparecer um bloco `firebaseConfig = { apiKey: ..., authDomain: ..., ... }`.
4. Na pasta do projeto, copie o arquivo `.env.example` para `.env` e preencha:
   ```
   VITE_FIREBASE_API_KEY=apiKey
   VITE_FIREBASE_AUTH_DOMAIN=authDomain
   VITE_FIREBASE_PROJECT_ID=projectId
   VITE_FIREBASE_STORAGE_BUCKET=storageBucket
   VITE_FIREBASE_MESSAGING_SENDER_ID=messagingSenderId
   VITE_FIREBASE_APP_ID=appId
   VITE_SUPER_ADMIN=darlitontrust@gmail.com
   ```
   (Essas chaves identificam o app e podem ficar no site; quem protege os dados são as regras do Firestore.)
5. Abra o arquivo `.firebaserc` e troque `SEU-PROJETO-FIREBASE` pelo ID do projeto.

## 4. Ative o login com Google

1. Menu **Build › Authentication** → **Vamos começar**.
2. Aba **Sign-in method** → **Google** → **Ativar** → escolha o e-mail de suporte → **Salvar**.
3. Aba **Settings › Authorized domains**: `localhost`, `SEU-PROJETO.web.app` e `SEU-PROJETO.firebaseapp.com` já vêm liberados. Se um dia usar domínio próprio, adicione aqui.

## 5. Crie o banco Firestore

1. Menu **Build › Firestore Database** → **Criar banco de dados**.
2. Local: **southamerica-east1 (São Paulo)** — não dá para mudar depois.
3. Modo: **produção** → **Criar**. (As regras do projeto serão enviadas no passo 7.)

## 6. Teste no seu computador

Na pasta do projeto:
```bash
npm install
npm run dev
```
Abra http://localhost:5173 e entre com o Google.

## 7. Publique

```bash
firebase login                          # abre o navegador para autorizar
firebase deploy --only firestore:rules  # envia as regras de segurança
npm run deploy                          # gera a versão final e publica o site
```
No final aparece o endereço, por exemplo `https://lalin-lanches-1a2b3.web.app`. Esse é o link para usar no balcão, no celular e no tablet.

## 8. Primeiro acesso

1. Abra o link e clique em **Entrar com Google** com **darlitontrust@gmail.com**.
2. Na tela **Primeiro acesso**, clique em **Criar configuração + cardápio inicial** (cria os 21 produtos do cardápio com estoque zerado).
3. Confira em **Cadastro › Pagamentos e PIX** a chave PIX, o nome e a cidade.
4. Lance o estoque em **Estoque › Entrada / Baixa** e os custos reais em **Cadastro**.
5. Libere a equipe em **Usuários**: nome + e-mail Google + perfil + módulos. A pessoa entra com o mesmo e-mail. Quem não estiver na lista é bloqueado.

## 9. Atualizar depois

Sempre que mudar o código:
```bash
npm run deploy
```
Se mudar `firestore.rules`, rode também `firebase deploy --only firestore:rules`.

## Dicas e problemas comuns

- **"auth/unauthorized-domain"**: adicione o domínio em Authentication › Settings › Authorized domains.
- **"Missing or insufficient permissions"**: as regras não foram enviadas (passo 7) ou o usuário não tem permissão no módulo.
- **Trocar o administrador principal**: altere `VITE_SUPER_ADMIN` no `.env` **e** o e-mail na função `isSuper()` de `firestore.rules`, depois publique os dois.
- **Instalar como app no celular**: abra o link no Chrome › menu › **Adicionar à tela inicial**.
- **Backup**: no console do Firestore é possível programar exportações; para começar, os botões **Exportar XLSX** de cada módulo já guardam os dados em planilha.
