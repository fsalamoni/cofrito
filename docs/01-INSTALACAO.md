# Instalação e Setup Local

> Como rodar o Cofrito no seu computador para desenvolvimento.

---

## Pré-requisitos

| Ferramenta | Versão | Como instalar |
|---|---|---|
| **Node.js** | 20+ | https://nodejs.org ou `nvm install 20` |
| **npm** | 10+ | vem com Node |
| **Firebase CLI** | 13+ | `npm install -g firebase-tools` |
| **Java JDK** | 11+ | `apt install openjdk-17-jdk` (Debian/Ubuntu) ou via https://adoptium.net |
| **Git** | 2.30+ | `apt install git` |
| **Google Cloud SDK** | latest | https://cloud.google.com/sdk/docs/install (para deploy) |

Verifique:

```bash
node --version    # v20.x
npm --version     # 10.x
firebase --version  # 13.x
java -version     # 17.x
```

---

## 1. Clonar o repositório

```bash
git clone https://github.com/mp-rs/agente-caocipp.git
cd agente-caocipp
```

## 2. Instalar dependências

```bash
npm install
```

Isto instala:
- Dependências do workspace root
- Dependências do `frontend/`
- Dependências do `functions/`

## 3. Configurar variáveis de ambiente

### 3.1. Firebase Admin (para ingestão local)

1. Acesse o Console do Firebase: https://console.firebase.google.com
2. Crie um projeto (ou use um existente)
3. **Configurações do projeto** → **Contas de serviço** → **Gerar nova chave privada**
4. Salve o JSON como `serviceAccountKey.json` na raiz

### 3.2. Gemini API

1. Acesse https://aistudio.google.com/app/apikey
2. Crie uma API key
3. Copie para `.env.local`

### 3.3. Resend (e-mail)

1. Acesse https://resend.com/api-keys
2. Crie uma API key
3. Copie para `.env.local`

### 3.4. Preencher `.env.local`

```bash
cp .env.example .env.local
# Editar .env.local com os valores reais
```

```bash
# frontend/.env.local
cp frontend/.env.example frontend/.env.local
# Editar

# functions/.env.local
cp functions/.env.example functions/.env.local
# Editar
```

## 4. Subir os emuladores do Firebase

```bash
# Em um terminal
firebase emulators:start
```

Isto sobe:
- Auth: http://localhost:9099
- Firestore: http://localhost:8080
- Functions: http://localhost:5001
- Hosting: http://localhost:5000
- UI: http://localhost:4000

## 5. Rodar o frontend

```bash
# Em outro terminal
cd frontend
npm run dev
```

Abre em http://localhost:5173

## 6. Popular o banco (opcional, primeira vez)

```bash
# Em outro terminal
cd functions
npm run build
GEMINI_API_KEY=sua-key GOOGLE_APPLICATION_CREDENTIALS=../serviceAccountKey.json \
  npm run ingest
```

## 7. Rodar testes

```bash
# Tudo
npm test

# Apenas backend
cd functions && npm test

# Apenas frontend
cd frontend && npm test
```

## 8. Lint

```bash
npm run lint
```

## 9. Build

```bash
npm run build
```

Isto:
- Compila TypeScript do backend para `functions/lib/`
- Compila o frontend para `frontend/dist/`

## 10. Workflow diário

```bash
# 1. Abrir emuladores (em um terminal)
firebase emulators:start

# 2. Em outro terminal, rodar o dev server
npm run dev:frontend

# 3. Editar código — HMR atualiza o navegador

# 4. Antes de commit
npm run lint
npm test
```

---

## Troubleshooting

### "Java not found"

Instale Java JDK 11+ (necessário para Firestore Emulator).

### "Permission denied" no Firestore Emulator

Verifique permissões do `serviceAccountKey.json`.

### "GEMINI_API_KEY not set"

Verifique se `.env.local` foi criado e tem a chave.

### "EADDRINUSE" ao subir emuladores

Outra instância está rodando. Mate com `pkill -f firebase`.

### Build do frontend falha por "out of memory"

Aumente o heap do Node:
```bash
export NODE_OPTIONS=--max-old-space-size=4096
npm run build
```

---

## Próximo passo

Veja [`02-ARQUITETURA.md`](02-ARQUITETURA.md) para entender como o código se organiza.
