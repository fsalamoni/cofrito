# Monitoramento e Observabilidade

> Como saber se o Cofrito está saudável.

---

## Stack de observabilidade

| Camada | Ferramenta | Custo |
|---|---|---|
| **Logs** | Cloud Logging | Grátis (até 50 GB/mês) |
| **Métricas** | Cloud Monitoring | Grátis (até 150 MB/mês) |
| **Traces** | Cloud Trace | Grátis (amostra) |
| **Erros** | Sentry | Free tier (5k eventos/mês) |
| **Uptime** | UptimeRobot ou similar | Free tier |
| **Alertas** | Cloud Alerting + Slack | Grátis |

---

## Logs estruturados

Todas as Cloud Functions emitem logs em JSON.

### Formato

```json
{
  "severity": "INFO",
  "message": "chat.success",
  "userId": "abc123",
  "conversationId": "conv-xyz",
  "messageId": "msg-001",
  "intent": "tese_nepotismo",
  "inScope": true,
  "sourcesCount": 3,
  "latencyMs": 1840,
  "tokensUsed": 650
}
```

### Como emitir

```typescript
import { logger } from 'firebase-functions/v2'

logger.info('chat.success', { userId, latencyMs, tokensUsed })
logger.error('chat.error', { userId, err })
```

### Como pesquisar

No Cloud Logging:
- `severity=ERROR`
- `jsonPayload.userId=abc123`
- `jsonPayload.action=consulta.created`

---

## Métricas principais

### Latência
- `chat` p50, p95, p99
- `openConsultaFormal` p95
- `retrieval` p95 (componente)

**Target:** p95 < 3,5s para chat simples; < 6s com geração longa

### Erro
- Taxa de erro por função
- Por tipo (timeout, 5xx, 4xx)
- **Target:** < 0,5%

### Throughput
- Conversas iniciadas/dia
- Mensagens/dia
- Tokens consumidos/dia

### Custo
- Gemini por dia/mês
- Firestore reads/writes por dia
- Bandwidth (hosting)
- **Target:** alerta em $5/dia

### Negócio
- Recusas (off-topic, caso concreto, no-results)
- Taxa de feedback 👍/👎
- Consultas formais abertas/dia
- Tempo médio de resposta do CAO a consultas

---

## Alertas

### Críticos (notificação imediata)

| Alerta | Condição | Canal |
|---|---|---|
| Sistema indisponível | 0 requisições em 5 min | e-mail + telefone |
| Erro spike | > 5% em 5 min | e-mail + Slack |
| Latência extrema | p95 > 10s por 10 min | e-mail + on-call |
| Vazamento de dados | qualquer | e-mail + telefone |

### Importantes (notificação em 1h)

| Alerta | Condição | Canal |
|---|---|---|
| Custo > $5/dia | gasto diário | e-mail |
| Latência alta | p95 > 6s por 10 min | e-mail |
| Gemini offline | > 3 falhas consecutivas | e-mail |
| Taxa de recusa < 70% | scope creep | e-mail |

### Informativos (relatório diário)

| Alerta | Condição | Canal |
|---|---|---|
| Feedback 👎 > 👎×3 | mais downvotes que upvotes | relatório |
| Custo > $1/dia | gasto diário | relatório |
| Documentos desatualizados | revisão vencida | relatório |

---

## Configuração de alertas (Cloud Monitoring)

Exemplo para alerta de erro spike:

```bash
# Via console web
# Cloud Monitoring → Alerting → Create Policy

# Condição:
# - Resource: Cloud Function
# - Metric: cloudfunctions.googleapis.com/function/execution_count
# - Filter: status != "ok"
# - Threshold: > 5% em 5 min
# - Aligner: rate, alignment_period=300s

# Notificação:
# - Email: oncall@example.com
# - Slack: webhook
```

---

## Dashboard

### Painel de saúde (recomendado)

**Grafana + Cloud Monitoring** (free tier)

Widgets:
- Latência p50/p95/p99 (chat)
- Taxa de erro
- Throughput (req/min)
- Custo (acumulado mês)
- Recusas (% por tipo)
- Feedback ratio

### Sentry

- Erros do frontend e backend
- Alertas em issues novas
- Release tracking

---

## Tracing

**Cloud Trace** correlaciona chamadas:
- Frontend → chat
- Chat → retrieval → Gemini
- Chat → persistence

Já habilitado por padrão em Cloud Functions v2.

---

## Auditoria (LGPD)

Logs de auditoria em `/audit/{eventId}`:

```typescript
{
  userId: '...',
  action: 'consulta.created' | 'consent.revoked' | 'document.deleted' | ...,
  resource: '/consultas-formais/CAO-2026-...',
  meta: { ... },
  at: Timestamp,
  ipHash: sha256(ip),
  userAgent: '...'
}
```

Pesquisáveis no Firestore por:
- `userId`
- `action`
- `resource`
- `at` (range)

Retenção: 5 anos (compliance).

---

## Uptime monitoring

Monitorar a URL pública:
- Staging: `https://agente-caocipp-staging.web.app/`
- Produção: `https://cofrito.caocipp.mp.rs.gov.br/`

A cada 1 min, alerta se down > 2 min.

---

## Debug em produção

### Logs em tempo real

```bash
# Ver logs em tempo real
firebase functions:log --project prod --follow

# Filtrar por severidade
firebase functions:log --project prod --only errors

# Filtrar por função
firebase functions:log --project prod --only chat
```

### Inspecionar Firestore

Console do Firebase → Firestore → navegar coleções (com cuidado, dados reais).

### Inspecionar conversa específica

```bash
# Via console web
# Firestore → users/{uid}/conversations/{convId}/messages

# Ou via script
node scripts/dump-conversation.js --user abc123 --conv conv-xyz
```

---

## Playbook de incidente

### Erro spike de chat

1. **Detecção** (alerta Sentry/Cloud Monitoring)
2. **Avaliação** (5 min):
   - Todos os usuários? → problema global
   - Só um? → pode ser conta específica
   - Algumas queries? → pode ser guardrail
3. **Contenção**:
   - Se Gemini: ver status.cloud.google.com
   - Se bug: rollback para versão anterior
4. **Comunicação**:
   - Notificar Coordenação
   - Banner no widget (se for longo)
5. **Pós-mortem** (em 5 dias úteis)

### Latência alta

1. **Detecção** (alerta p95 > 6s)
2. **Avaliação**:
   - Firestore: quotas atingidas?
   - Gemini: pico de uso?
3. **Contenção**:
   - Se Gemini: mudar para Flash (mais rápido)
   - Se Firestore: revisar índices
4. **Pós-mortem**

### Custo descontrolado

1. **Detecção** (alerta $5/dia)
2. **Avaliação**:
   - Quais funções/horas?
   - Ataque? Bug? Crescimento?
3. **Contenção**:
   - Se ataque: ativar rate limit agressivo
   - Se bug: corrigir
4. **Pós-mortem**

---

## Onde olhar quando algo está errado

| Sintoma | Onde olhar |
|---|---|
| Widget não abre | Console do browser, status Firebase Hosting |
| Resposta lenta | Cloud Monitoring (latência chat), Gemini status |
| Erro 500 | Sentry, Cloud Logging (ERROR) |
| Usuário não consegue logar | Firebase Auth console, logs |
| Consultas formais não chegam | Cloud Logging, e-mail Resend dashboard |
| Custo alto | Cloud Billing, Gemini usage |

---

Próximo: [`10-FAQ-INSTITUCIONAL.md`](10-FAQ-INSTITUCIONAL.md).
