# Arquitetura

> Como o código se organiza. Visão de quem vai implementar.

---

## Visão geral

```
┌─────────────────────────────────────────────────────────────┐
│                        USUÁRIO                              │
│  (Promotor, Servidor, Estagiário)                          │
└─────────────────────────────────────────────────────────────┘
                            │ HTTPS
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                  FRONTEND (React + Vite)                    │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  <cofrito-widget>  (Web Component com Shadow DOM)    │  │
│  │   - Avatar (Cofrito) com estados                      │  │
│  │   - ChatPanel com histórico                          │  │
│  │   - Login (Magic Link)                               │  │
│  │   - ConsultaFormalForm                               │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  Páginas: Home, Document, Perfil, Historico, Admin          │
└─────────────────────────────────────────────────────────────┘
                            │ Firebase SDK
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              FIREBASE CLOUD FUNCTIONS (Node 20)             │
│                                                              │
│  Handlers: chat, openConsultaFormal, getProfile, ...        │
│  Services: llm, retrieval, embeddings, guardrails, ...      │
│  Triggers: onUserCreate, onConsultaCreate, ...              │
│  Scheduled: cleanupRetention, aggregateAnalytics            │
└─────────────────────────────────────────────────────────────┘
              │                              │
              ▼                              ▼
┌──────────────────────────┐    ┌─────────────────────────────┐
│  GEMINI API              │    │  FIRESTORE                   │
│  - text-embedding-004    │    │  - /users (profile)          │
│  - gemini-2.5-flash      │    │  - /conversations            │
│  - gemini-2.5-pro        │    │  - /consultas-formais        │
│  (via Service Account)   │    │  - /corpus (Vector Search)   │
│                          │    │  - /audit                    │
└──────────────────────────┘    │  - /feature-flags            │
                                └─────────────────────────────┘
```

## Frontend

### Estrutura

```
frontend/src/
├── main.tsx                  # entrypoint
├── App.tsx                   # QueryClient + auth init
├── widget-entry.tsx          # entry do Web Component (cofrito.js)
│
├── components/
│   ├── AgentWidget/
│   │   ├── index.tsx          # componente principal
│   │   ├── AgentAvatar.tsx    # mascote
│   │   ├── ChatPanel.tsx      # chat
│   │   ├── MessageBubble.tsx  # bolha de mensagem
│   │   ├── Welcome.tsx        # tela inicial
│   │   ├── TypingIndicator.tsx
│   │   └── LoginPrompt.tsx
│   ├── ui/                    # design system
│   ├── document/
│   ├── consult/
│   └── consent/
│
├── pages/                     # rotas (futuro: react-router)
│   ├── HomePage.tsx
│   ├── DocumentPage.tsx
│   ├── PerfilPage.tsx
│   ├── HistoricoPage.tsx
│   ├── ConsultaPage.tsx
│   └── admin/
│
├── hooks/                     # lógica reutilizável
│   ├── useAuth.ts
│   ├── useChat.ts
│   ├── useProfile.ts
│   └── useToast.ts
│
├── stores/                    # estado global (Zustand)
│   ├── authStore.ts
│   ├── chatStore.ts
│   └── uiStore.ts
│
├── lib/                       # utilitários
│   ├── firebase.ts            # init Firebase
│   ├── api.ts                 # wrapper de Cloud Functions
│   └── utils.ts
│
├── i18n/                      # internacionalização
│   ├── config.ts
│   └── pt-BR.json
│
├── types/                     # tipos compartilhados
│   └── index.ts
│
├── assets/                    # imagens, fontes
│   └── cofrito/
│
└── styles/                    # CSS
    ├── index.css              # Tailwind base
    └── widget.css             # estilos do widget (Shadow DOM)
```

### Fluxo do widget

1. Usuário acessa a página hospedeira
2. `<script src="cofrito.js">` carrega
3. Script define `<cofrito-widget>` (Custom Element)
4. Widget se insere como Shadow DOM
5. Usuário clica no FAB → painel abre
6. Login via Magic Link
7. Conversa com Cofrito (chamadas a `chat` callable)
8. Resposta renderizada com fontes clicáveis
9. Ações contextuais (abrir consulta formal, ver documento)

### Build do widget standalone

```bash
cd frontend
npm run build:widget
# Gera dist-widget/cofrito.js (iife, ~50KB gzipped)
```

Este `cofrito.js` é o que é embarcado em páginas externas.

## Backend (Cloud Functions)

### Estrutura

```
functions/src/
├── index.ts                  # entrypoint (exporta todos os handlers)
│
├── handlers/
│   ├── chat.ts                # RAG principal
│   ├── consulta-formal.ts     # abre consulta
│   ├── feedback.ts
│   ├── profile.ts             # get + update
│   ├── history.ts
│   ├── update-profile.ts
│   ├── delete-account.ts
│   ├── admin/
│   │   ├── reingest.ts
│   │   ├── list-consultas.ts
│   │   └── stats.ts
│   ├── triggers/
│   │   ├── on-user-create.ts
│   │   ├── on-feedback-create.ts
│   │   └── on-consulta-create.ts
│   └── scheduled/
│       ├── cleanup-retention.ts
│       └── aggregate-analytics.ts
│
├── services/                  # lógica de negócio
│   ├── llm.ts                 # wrapper Gemini
│   ├── embeddings.ts
│   ├── retrieval.ts           # busca vetorial
│   ├── ingestion.ts           # pipeline
│   ├── guardrails.ts          # filtros de escopo
│   ├── history.ts             # CRUD conversas
│   ├── profile.ts
│   ├── email.ts               # Resend
│   ├── analytics.ts           # logs
│   └── anonymizer.ts          # filtro PII
│
├── middleware/
│   └── auth.ts                # verificação admin
│
├── utils/
│   ├── chunking.ts            # divide texto
│   ├── protocol.ts            # gera protocolo
│   ├── validators.ts          # PGEA, etc
│   └── markdown.ts
│
├── prompts/
│   └── system.ts              # system prompt canônico
│
├── config/
│   └── env.ts                 # validação de env vars
│
├── types/
│   └── index.ts               # tipos compartilhados
│
└── scripts/
    ├── ingest.ts              # CLI de ingestão
    └── validate-corpus.ts     # verifica corpus
```

### Fluxo do chat (RAG)

```
[Client]                                  [Cloud Function 'chat']
   │                                              │
   ├─ message: "..."  ──────────────────────────►  │
   │                                              ├─ 1. Auth (uid)
   │                                              ├─ 2. Validação Zod
   │                                              ├─ 3. Anonimiza PII
   │                                              ├─ 4. Carrega histórico (6 msgs)
   │                                              ├─ 5. Embedding da query
   │                                              ├─ 6. Retrieval (top-8 chunks)
   │                                              ├─ 7. Guardrails
   │                                              │   - in scope? senão recusa
   │                                              ├─ 8. Carrega perfil
   │                                              ├─ 9. LLM (Gemini Flash)
   │                                              │   - system + history + chunks
   │                                              ├─ 10. Persiste mensagem
   │                                              ├─ 11. Log analytics
   │  ◄─────────────────────  response: {  ──────┤
   │       reply, sources, ...                   │
```

## Firestore

### Estrutura

```
/users/{uid}
  ├── (UserDoc)
  ├── /profile/main
  ├── /conversations/{convId}
  │     ├── (ConversationDoc)
  │     └── /messages/{msgId}
  ├── /feedback/{fbId}

/corpus/documents/{docId}
  └── /chunks/{chunkId}            (com embedding vetorial)

/consultas-formais/{consultaId}

/audit/{auditId}

/admins/{uid}

/feature-flags/{flagKey}

/system/usage-daily/{date}
```

Veja [`05-LGPD-SEGURANCA.md`](05-LGPD-SEGURANCA.md) para regras de segurança.

## Decisões chave

| Decisão | ADR |
|---|---|
| Stack frontend | [ADR-0001](adr/0001-stack-frontend.md) |
| LLM Gemini | [ADR-0002](adr/0002-llm-gemini.md) |
| Vector Search | [ADR-0003](adr/0003-vector-search.md) |
| Auth Magic Link | [ADR-0004](adr/0004-auth-magic-link.md) |
| Padrões de segurança | [ADR-0005](adr/0005-seguranca.md) |
| Estratégia de guardrails | [ADR-0006](adr/0006-guardrails.md) |
| Integração MPRS | [ADR-0007](adr/0007-integracao-mprs.md) |

---

Próximo: [`03-DEPLOY.md`](03-DEPLOY.md).
