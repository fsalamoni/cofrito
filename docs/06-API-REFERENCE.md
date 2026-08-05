# API Reference

> Contratos das Cloud Functions expostas ao cliente.

Todas as funções são **callable functions** (chamadas via `httpsCallable`).

**Base URL:** `https://<region>-<project>.cloudfunctions.net`
- Staging: `https://us-central1-agente-caocipp-staging.cloudfunctions.net`
- Produção: `https://us-central1-agente-caocipp-prod.cloudfunctions.net`

**Auth:** Firebase Auth (JWT no header `Authorization: Bearer <idToken>`)

---

## `chat`

Envia uma mensagem ao Cofrito e recebe resposta.

### Request

```typescript
interface ChatRequest {
  conversationId?: string;        // se ausente, cria nova
  message: string;                // 1..2000 chars
  context?: {
    documentId?: string;          // se pergunta é sobre doc específico
    intent?: string;              // hint
  };
}
```

### Response

```typescript
interface ChatResponse {
  conversationId: string;
  messageId: string;
  reply: string;                  // markdown
  sources: Array<{
    docId: string;
    chunkId: string;
    section: string;
    title: string;
    relevance: number;            // 0..1
    url?: string;
  }>;
  intent: string;
  inScope: boolean;
  feedbackToken: string;          // para enviar feedback
  suggestions: string[];          // perguntas relacionadas
  actions: Array<{
    type: 'open_consulta' | 'view_document' | 'restart' | 'view_history';
    label: string;
    payload?: Record<string, unknown>;
  }>;
  usage: { prompt: number; completion: number; total: number };
  latencyMs: number;
}
```

### Erros

| Código | Quando |
|---|---|
| `unauthenticated` | sem token |
| `invalid-argument` | message vazia ou > 2000 chars |
| `resource-exhausted` | rate limit excedido |
| `internal` | erro interno (Gemini offline, etc.) |

### Exemplo

```typescript
import { httpsCallable } from 'firebase/functions'
import { functions } from './firebase'

const chat = httpsCallable<ChatRequest, ChatResponse>(functions, 'chat')

const result = await chat({
  message: 'O que mudou na Lei de Improbidade?',
})

console.log(result.data.reply)
console.log(result.data.sources)
```

---

## `openConsultaFormal`

Abre uma consulta formal ao CAOCIPP.

### Request

```typescript
interface ConsultaRequest {
  assunto: string;                 // 5..200 chars
  questaoObjetiva: string;         // >= 20 chars
  contextoFatico?: string;         // <= 10000
  pgea?: string;                   // XXXXX.XXX.XXX/XXXX
  documentosIds: string[];         // até 20 refs
}
```

### Response

```typescript
interface ConsultaResponse {
  protocol: string;                // "CAO-20260805-00001"
  status: 'recebida';
  createdAt: string;
  estimatedResponseDays: string;   // "5 a 15 dias úteis"
}
```

### Erros

| Código | Quando |
|---|---|
| `unauthenticated` | sem token |
| `invalid-argument` | assunto/questão/PGEA inválidos |

---

## `getProfile`

Retorna o perfil do usuário autenticado.

### Request
nenhum

### Response

```typescript
interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  institutionalEmail: boolean;
  role: 'promotor' | 'servidor' | 'estagiario' | 'coordenador' | 'admin' | 'externo';
  unidade?: string;
  areasAtuacao: string[];
  areasInferidas: string[];
  preferences: {
    tone: 'formal' | 'conversational';
    detail: 'low' | 'medium' | 'high';
    language: 'pt-BR';
  };
  status: 'active' | 'suspended' | 'deleted';
  createdAt: string;
  lastSeen: string;
  consent: { ... };
}
```

---

## `updateProfile`

Atualiza campos do perfil.

### Request

```typescript
interface UpdateProfileRequest {
  displayName?: string;
  unidade?: string;
  areasAtuacao?: string[];
  preferences?: {
    tone?: 'formal' | 'conversational';
    detail?: 'low' | 'medium' | 'high';
  };
}
```

### Response: UserProfile atualizado

---

## `getHistory`

Lista as conversas do usuário.

### Request
nenhum

### Response

```typescript
Array<{
  id: string;
  title: string;
  status: 'active' | 'archived';
  createdAt: string;
  lastActivityAt: string;
  messageCount: number;
}>
```

---

## `submitFeedback`

Envia feedback (👍/👎) sobre uma resposta.

### Request

```typescript
interface FeedbackRequest {
  messageId: string;
  helpful: boolean;
  comment?: string;                // <= 500 chars
}
```

### Response
`{ ok: true }`

---

## `deleteAccount`

Apaga a conta do usuário (LGPD).

### Request
nenhum

### Response
`{ ok: true }`

### Efeito

1. Marca `status: 'deleted'`
2. Anonimiza PII
3. Apaga autenticação
4. Log de auditoria
5. Cloud Function agendada apaga após 90 dias

---

## Admin (requer role admin)

### `adminReingest`

Dispara re-ingestão do corpus.

**Request:** nenhum
**Response:** `{ documentsProcessed, chunksCreated, errors, totalTimeMs, estimatedCostUsd }`

### `adminListConsultas`

Lista as últimas 200 consultas formais.

**Response:** Array de `ConsultaFormal`

### `adminGetStats`

Estatísticas gerais.

**Response:**
```typescript
{
  users: number;
  conversations: number;
  consultas: number;
  documents: number;
  timestamp: string;
}
```

---

## Códigos de erro comuns

| Código | HTTP | Significado | UX |
|---|---|---|---|
| `unauthenticated` | 401 | Sem token ou token inválido | "Faça login para continuar" |
| `permission-denied` | 403 | Sem permissão | "Você não tem permissão" |
| `not-found` | 404 | Recurso não existe | "Não encontrado" |
| `invalid-argument` | 400 | Input inválido | Mensagem específica do campo |
| `failed-precondition` | 412 | Limite atingido | "Você atingiu o limite de..." |
| `resource-exhausted` | 429 | Rate limit | "Muitas requisições. Aguarde." |
| `unavailable` | 503 | Serviço offline | "Serviço temporariamente indisponível" |
| `internal` | 500 | Erro inesperado | "Algo deu errado. Tente novamente." |

---

## Versionamento

A API é versionada pelo `firebase-functions`. Mudanças incompatíveis:
- Incrementar versão no path (`/v2/chat`)
- Comunicar via changelog
- Manter v1 por 6 meses

Mudanças compatíveis (adicionar campo, novos endpoints) podem ir direto.

---

Próximo: [`07-AGENTE-PROMPT.md`](07-AGENTE-PROMPT.md).
