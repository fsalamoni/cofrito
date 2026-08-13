# Setup completo — Firebase projeto `cofrito`

> Passo a passo para colocar a Fase 0 (infra) no ar.

---

## ✅ O que JÁ ESTÁ FEITO

- [x] Projeto Firebase `cofrito` (número 941013755211) criado
- [x] Authentication: Google + email/senha
- [x] Firestore Database (modo produção)
- [x] Hosting para `cofrito.web.app`
- [x] Storage (plano Blaze)
- [x] Repo `fsalamoni/cofrito` com scaffold inicial
- [x] Firestore rules + índices (Vector Search)

## 🚧 O que FALTA (5 passos)

### 1. Baixar service account JSON

1. https://console.firebase.google.com/project/cofrito/settings/serviceaccounts/adminsdk
2. **Generate new private key** → salva como `serviceAccountKey.json`
3. **MANTÉM ESSE ARQUIVO FORA DO GIT** (já está no `.gitignore`)

> ⚠️ Esse JSON dá acesso TOTAL ao projeto. Trate como senha.

### 2. Obter API keys

| Key | Onde obter | Para quê |
|---|---|---|
| `GEMINI_API_KEY` | https://aistudio.google.com/app/apikey | Embeddings + chat LLM |
| `RESEND_API_KEY` | https://resend.com/api-keys | Envio de e-mails |
| `FIREBASE_TOKEN` | `npx firebase login:ci` (rodar local) | Deploy via CI |

### 3. Configurar secrets no GitHub

Vá em https://github.com/fsalamoni/cofrito/settings/secrets/actions e adicione:

```
GEMINI_API_KEY         → sua chave Gemini
RESEND_API_KEY         → sua chave Resend
FIREBASE_TOKEN         → token de deploy (passo 2)
GCP_SA_KEY_B64         → service account JSON codificado em base64
```

Para codificar o service account em base64:
```bash
base64 -w 0 serviceAccountKey.json
```

### 4. Configurar o Authentication corretamente

No Firebase Console → Authentication → Sign-in method:

- [x] **Google** (já ativado) — ótimo para SSO com contas @mprs.mp.br
- [x] **Email/senha** (já ativado) — bom para usuários externos
- [ ] **Email link (passwordless)** — RECOMENDADO adicionar
  - Ativar em Sign-in method
  - Configurar URL de redirect: `https://cofrito.web.app/__/auth/action`
  - Esse é o método principal do ADR-0004 (mais simples para Promotores)

> **Decisão sua:** Quer manter só Google + email/senha, ou adicionar Magic Link?
> Para o caso de uso (Promotores MPRS), recomendo deixar todos os 3.

### 5. Configurar domínio autorizado

Authentication → Settings → Authorized domains:

- [x] `localhost` (já está)
- [x] `cofrito.web.app` (já está)
- [ ] `cofrito.firebaseapp.com` (recomendado adicionar)

## 🎯 Depois que tudo estiver OK

Rode o checklist em [`docs/CHECKLIST-FASE-1.md`](CHECKLIST-FASE-1.md) — **Semana 1: Dia 1-2 (Setup)**.

Resumo do que fazer no seu ambiente local:

```bash
# 1. Clonar
git clone https://github.com/fsalamoni/cofrito.git
cd cofrito

# 2. Variáveis
cp .env.example .env.local
cp frontend/.env.example frontend/.env.local
# Preencher com suas keys

# 3. Deps + testes
npm install
npm test

# 4. Subir emuladores
firebase emulators:start
```

Quando os 4 emuladores subirem (auth, functions, firestore, hosting), está tudo OK.

## 📋 Smoke test manual

1. Acesse http://localhost:4000 (Emulator UI)
2. Crie um usuário em Authentication (e-mail fake)
3. Em Firestore, crie um doc em `users/{uid}` com `displayName: "Teste"`
4. Chame a function `chat` via Emulator UI → deve responder com erro de corpus vazio (esperado!)
5. Pronto, a infra está funcional

## ⏭️ Próximo passo

Quando você terminar os 5 passos acima, me avisa e a gente parte para a **Semana 1 da Fase 1**:
- Implementação real de retrieval
- Ingestão dos 11 documentos seed
- Golden set rodando
- Deploy em staging
