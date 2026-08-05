# Deploy

> Como colocar o Cofrito em produção.

---

## Ambientes

| Ambiente | Branch | URL | Firebase Project | Quem dispara |
|---|---|---|---|---|
| **Dev (local)** | qualquer | localhost:5173 | emulators | você (manual) |
| **Staging** | `develop` | `agente-caocipp-staging.web.app` | `agente-caocipp-staging` | CI (automático em push) |
| **Produção** | `main` | `cofrito.caocipp.mp.rs.gov.br` | `agente-caocipp-prod` | manual (com aprovação) |

---

## Setup inicial (uma vez)

### 1. Criar projetos no Firebase

1. Acesse https://console.firebase.google.com
2. Crie dois projetos: `agente-caocipp-staging` e `agente-caocipp-prod`
3. Em cada projeto, ative:
   - Authentication → Email link
   - Firestore Database (modo produção)
   - Functions
   - Hosting
   - Storage

### 2. Configurar Gemini API

1. Acesse https://aistudio.google.com/app/apikey
2. Crie uma API key para staging
3. Crie outra para produção (recomendado)
4. No console do Firebase, em cada projeto:
   - Functions → Secrets → `GEMINI_API_KEY` = sua chave
   - Functions → Secrets → `RESEND_API_KEY` = sua chave do Resend

### 3. Configurar domínio customizado (produção)

1. Firebase Hosting → Add custom domain
2. Domínio: `cofrito.caocipp.mp.rs.gov.br`
3. Firebase fornece registros DNS para adicionar
4. Após propagação DNS, SSL é provisionado automaticamente

### 4. Configurar OAuth redirect (Magic Link)

Em cada projeto do Firebase, Authentication → Settings → Authorized domains:
- `agente-caocipp-staging.web.app`
- `agente-caocipp-dev.web.app` (emulador)
- `cofrito.caocipp.mp.rs.gov.br` (produção)
- `localhost` (dev)

---

## Deploy em staging

Automático: cada push em `develop` faz deploy.

Para disparar manualmente:

```bash
# 1. Garantir que está em develop e atualizado
git checkout develop
git pull

# 2. Build
npm ci
npm run build

# 3. Selecionar projeto
firebase use staging

# 4. Deploy
firebase deploy --only hosting,functions,firestore:rules,firestore:indexes

# 5. Verificar
open https://agente-caocipp-staging.web.app
```

## Deploy em produção

**SEMPRE** com aprovação humana (proteção de branch).

### Via GitHub Actions (recomendado)

1. Vá em **Actions** → **Deploy Production** → **Run workflow**
2. Preencha:
   - **Tag:** (opcional) tag a deployar. Ex: `v0.1.0`
   - **Confirm:** digite `DEPLOY`
3. CI faz:
   - Checkout
   - Build
   - Backup do hosting anterior
   - Deploy
   - Smoke test
   - Notificação no Slack

### Manual (emergência)

```bash
# 1. Garantir main atualizado
git checkout main
git pull

# 2. Selecionar projeto
firebase use prod

# 3. Build
npm ci
npm run build

# 4. Backup do estado atual
firebase hosting:clone live:pre-deploy-$(date +%Y%m%d-%H%M%S)

# 5. Deploy
firebase deploy

# 6. Verificar
open https://cofrito.caocipp.mp.rs.gov.br
```

---

## Rollback

### Hosting (instantâneo)

```bash
# Listar versões
firebase hosting:versions --project prod

# Reverter para uma versão específica
firebase hosting:clone VERSION_ID live --project prod
```

### Cloud Functions

Rollback = deploy da versão anterior:

```bash
git log --oneline  # pegar commit anterior
git checkout COMMIT_HASH
npm run build
firebase deploy --only functions --project prod
```

### Firestore Rules

Rules são versionadas no Git. Para reverter:

```bash
git checkout COMMIT_HASH -- firestore.rules
firebase deploy --only firestore:rules --project prod
```

---

## Checklist pré-deploy

Antes de cada deploy em produção, garantir:

- [ ] CI passou (lint, test, build)
- [ ] Golden set avaliado (≥ 90% acerto)
- [ ] Smoke tests em staging passaram
- [ ] Documentação atualizada
- [ ] CHANGELOG atualizado
- [ ] Aprovação de code review obtida
- [ ] Coordenação do CAOCIPP notificada (deploy relevante)
- [ ] Equipe de operação avisada (deploy relevante)
- [ ] Plano de rollback documentado

---

## Pós-deploy

1. Verificar logs: `firebase functions:log --project prod`
2. Verificar Sentry (erros novos?)
3. Verificar métricas (latência, taxa de erro)
4. Verificar consultas formais (email chegou?)
5. Comunicar à equipe

---

## Domínio customizado

Após configurar DNS, validar:

```bash
curl -I https://cofrito.caocipp.mp.rs.gov.br/
# Deve retornar 200
```

Para teste completo do Magic Link:
1. Abrir https://cofrito.caocipp.mp.rs.gov.br/
2. Clicar no widget
3. Fazer login
4. Verificar que o e-mail chega
5. Verificar que o link funciona

---

## Ambientes de homologação do MPRS

Quando a TI MPRS homologar:

1. Crie um quarto projeto Firebase: `agente-caocipp-homolog`
2. Configure o domínio temporário: `homolog.cofrito.caocipp.mp.rs.gov.br`
3. Faça deploy nesse ambiente
4. Após homologação, promova para prod

---

Próximo: [`04-OPERACAO.md`](04-OPERACAO.md).
