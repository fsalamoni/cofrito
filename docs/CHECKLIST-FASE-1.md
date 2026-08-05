# Checklist — Fase 1 (Backend RAG)

> Detalhamento da Fase 1 do roadmap. Duração estimada: 2-3 semanas.

---

## Semana 1 — Serviços base

### Dia 1-2: Setup
- [ ] Criar projeto Firebase `agente-caocipp-dev`
- [ ] Configurar Firebase CLI (`firebase use agente-caocipp-dev`)
- [ ] Baixar service account JSON
- [ ] Obter Gemini API key (https://aistudio.google.com/app/apikey)
- [ ] Configurar `.env.local`
- [ ] Rodar `npm install`
- [ ] Rodar `firebase emulators:start` (deixa rodando)
- [ ] `npm test` em frontend e functions deve passar

### Dia 3-4: Retrieval
- [ ] `services/embeddings.ts` (✅ já implementado)
- [ ] `services/retrieval.ts` (✅ já implementado)
- [ ] Testes unitários para `embeddings` (✅ cache)
- [ ] Smoke test com emulador:
  - Inserir 1 documento manualmente
  - Chamar `retrieveRelevantChunks` via Cloud Function de teste
- [ ] Verificar latência < 500ms

### Dia 5: LLM
- [ ] `services/llm.ts` (✅ já implementado)
- [ ] Testar com prompt real
- [ ] Verificar citação de fonte no output
- [ ] Verificar recusa de caso concreto
- [ ] Medir tokens consumidos

---

## Semana 2 — Handler `chat` end-to-end

### Dia 1-2: Handler
- [ ] `handlers/chat.ts` (✅ já implementado)
- [ ] Fluxo completo:
  - Autenticação ✓
  - Validação Zod ✓
  - Anonimização PII ✓
  - Histórico (6 msgs) ✓
  - Retrieval ✓
  - Guardrails ✓
  - LLM ✓
  - Persistência ✓
- [ ] Smoke test via emulador: enviar pergunta e ver resposta

### Dia 3: Golden set
- [ ] `data/golden-set.json` com 50 perguntas (✅ já criado)
- [ ] Script `scripts/run-golden-set.ts` que:
  - Itera pelas 50 perguntas
  - Para cada, chama `Agent.answer` (ou stub)
  - Avalia: citou fonte? recusou off-topic? tem keyword esperado?
  - Salva resultado em `data/golden-set-results.json`
- [ ] Rodar manualmente em cada release

### Dia 4-5: Testes
- [ ] Testes de `chat` handler (integration com emulador)
- [ ] Testes de `consulta-formal` handler
- [ ] Cobertura ≥ 70%

---

## Semana 3 — Ingestão + Deploy

### Dia 1-2: Ingestão
- [ ] `services/ingestion.ts` (✅ já implementado)
- [ ] `services/embeddings.ts` com batch (✅ já implementado)
- [ ] Script `scripts/ingest.ts` (✅ já criado)
- [ ] `scripts/validate-corpus.ts` (✅ já criado)
- [ ] Rodar localmente:
  - 11 documentos seed
  - Verificar chunks criados no Firestore
  - Medir custo e tempo

### Dia 3: Admin
- [ ] `handlers/admin/reingest.ts` (✅ já criado)
- [ ] `handlers/admin/stats.ts` (✅ já criado)
- [ ] `handlers/admin/list-consultas.ts` (✅ já criado)
- [ ] Testar via emulador

### Dia 4: Deploy staging
- [ ] Criar projeto `agente-caocipp-staging`
- [ ] Configurar secrets (Gemini, Resend)
- [ ] `firebase use staging`
- [ ] `npm run deploy:staging`
- [ ] Smoke test em `agente-caocipp-staging.web.app`

### Dia 5: Validação
- [ ] Golden set rodando em staging
- [ ] Latência p95 < 3,5s
- [ ] Custo < $1/dia em staging
- [ ] Documentar resultados

---

## Critérios de pronto (Definition of Done)

A Fase 1 está pronta quando:

- [ ] Cloud Function `chat` responde corretamente
- [ ] Golden set ≥ 80% de acerto (meta: 90%)
- [ ] Cobertura de testes ≥ 70% no backend
- [ ] Latência p95 < 3,5s
- [ ] 0 erros de lint
- [ ] 0 erros de typecheck
- [ ] Deploy em staging funcional
- [ ] Logs estruturados
- [ ] Alertas configurados
- [ ] CHANGELOG atualizado

## Métricas a monitorar

| Métrica | Target |
|---|---|
| Latência p50 | < 2s |
| Latência p95 | < 3,5s |
| Taxa de erro | < 0,5% |
| Golden set | ≥ 80% (meta 90%) |
| Custo por pergunta | < $0,001 |
| Tokens por pergunta | < 1500 |

## Riscos

- **Alucinação do Gemini:** mitigar com prompt + golden set
- **Latência do Firestore Vector Search:** monitorar
- **Custo de embedding em batch grande:** sempre usar batch
- **Firestore quota:** 50k reads/dia free — suficiente para protótipo

## Próxima fase

Quando Fase 1 estiver ✅, seguir para **Fase 2 (Frontend widget)**.
