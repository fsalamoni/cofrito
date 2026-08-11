# Cofrito V1 Estrutural — Release Notes

> **Data:** 2026-08-11 · **Deploys:** #66 → #80 · **Tests:** 90/91 passing · **Bundle size:** ~850KB

---

## Resumo

A V1 Estrutural do Cofrito introduz **gestão completa do acervo** modelada após o Lexio:

- **Pipeline de análise automática** (1 agente unificado, 3 skills em 1 chamada LLM)
- **Pesquisa em 3 camadas** (keyword pre-filter → embedding → rerank LLM se ambíguo)
- **DocumentCatalog** (planilha + viewer + re-analise + delete)
- **AcervoPipelineConfig** (toggles por agente + modelo dedicado opcional)
- **Chat orquestrador visível** (timeline em tempo real estilo Lexio)
- **Configurações globais auditadas** (envelope `config-store`)

---

## 7 Fases deployadas

| Fase | Entrega | Deploy | Tests |
|---|---|---|---|
| 0 | Correção bug configs globais | #66 | +4 |
| 1 | WebSearchConfig 3 sub-abas | #68 | — |
| 2a | Upload V1 (compactação + JSON v1) | #69 | +25 |
| 2b | Análise automática (1 agente unificado) | #70, #72 | +14 |
| 2c | Pesquisa 3 camadas (refactor researcher) | #74 | +7 |
| 2d | DocumentCatalog | #75 | — |
| 2e | AcervoPipelineConfig | #76 | — |
| 2f | Chat orquestrador visível | #78 | +13 |
| 3 | Firestore indexes + rules | #79 | — |

**Total: 9 deploys, 63 testes novos (de 27 → 90)**

---

## Arquitetura final

### Backend (functions/)
- `services/config-store.ts` — envelope `{data, version, updatedAt, updatedBy}` com migração legacy
- `services/document-json-converter.ts` — conversor texto → JSON v1 (Lexio port)
- `services/storage-compressor.ts` — gzip para txt/md/html/json/csv
- `services/acervo-analyzer.ts` — **1 agente unificado** (classification + ementa + keyPoints em 1 chamada LLM)
- `services/ingestion-acervo.ts` — indexação com metadados estruturados + `searchKeywords` consolidado
- `services/agent-events.ts` — mapeamento `TrailEvent` → `NarrativeEvent` (5 tipos balanceados) + persistência em tempo real
- `agents/researcher-internal.ts` — refatorado em 3 camadas com 1 chamada LLM unificada (só se ambíguo)
- `agents/pipeline.ts` — passa `llmConfig` para researcher e emite `onTrail` events
- `handlers/admin-documents.ts` — `adminUploadDocument`, `adminListDocuments`, `adminGetDocument`, `adminReanalyzeDocument`, `adminDeleteDocument`
- `handlers/admin-acervo.ts` — `getAcervoPipelineConfig`, `saveAcervoPipelineConfig`
- `handlers/chat-v2.ts` — gera `pipelineMessageId`, ouve eventos via `onTrail`, retorna na response

### Frontend (frontend/)
- `pages/admin/WebSearchConfig.tsx` — 3 sub-abas: Busca web / Deep search / Bases específicas
- `pages/admin/DocumentCatalog.tsx` — upload + planilha com 8 colunas + viewer drawer (3 abas) + re-analise + delete
- `pages/admin/AcervoPipelineConfig.tsx` — toggles (3 agentes) + slider threshold + override de modelo
- `components/AgentWidget/OrchestratorTimeline.tsx` — ouve `agentEvents/{conv}` via Firestore onSnapshot
- `stores/chatStore.ts` — `livePipelineMessageId` no state
- `hooks/useChat.ts` — captura `pipelineMessageId` do response, controla live ID

### Firebase
- `firestore.rules` — adicionada rule para `agentEvents/{conversationId}` (read: owner; write: backend)
- `firestore.indexes.json` — 4 novos indexes (searchKeywords, classification.natureza, status+createdAt)

---

## Decisões do owner aplicadas

| Decisão | Como foi implementada |
|---|---|
| OpenRouter deep search usa LLM global | `useGlobalModel: true` por default; toggle para dedicado |
| Chat: timeline de pensamentos/pesquisas em tempo real | `OrchestratorTimeline` ouve Firestore |
| DocumentUpload → DocumentCatalog | Substituído por planilha + viewer + re-analise |
| **NÃO fazer nada com pressa** | Cada commit validado antes de avançar (10 commits) |
| Sempre atrás de feature flags | `AcervoPipelineConfig` toggles por agente + enableLlmRerank |
| Prevenir falhas | Defaults de fallback, migração legacy em config-store, validate inputs |

---

## Princípios aplicados

1. **1 agente unificado com skills** (em vez de 3 paralelos) — economia de tokens + latência + coerência
2. **Pesquisa 3 camadas** com 1 chamada LLM só quando ambíguo
3. **Feature flags** em tudo que é novo
4. **Migração legacy automática** em `loadConfigDoc`
5. **Validação + defaults** em cada handler
6. **Lint + testes** em CI (90 testes, lint zero erros)
7. **SW cache-bust** a cada release (v9 → v13)
8. **Firestore rules** explícitas por collection

---

## Como usar

### Upload de documento
1. Admin → **Upload de Documentos** (ou DocumentCatalog)
2. Drag-and-drop PDF/DOCX/TXT/MD/HTML
3. Doc entra na fila, status `analise_pendente`
4. Background: 1 agente LLM faz classificação + ementa + keyPoints
5. Doc vira `analisado` com `classification`, `ementa`, `keyPoints` populados
6. Corpus é re-indexado com `searchKeywords` consolidado
7. Pronto para pesquisa no chat

### Pesquisa no chat
1. User envia pergunta no chat
2. Orquestrador planeja: precisa de busca no corpus?
3. Researcher-internal (3 camadas):
   - Camada 1: keyword pre-filter (0 LLMs)
   - Camada 2: embedding similarity (0 LLMs, só embedding da query)
   - Camada 3: LLM unificado rerank (1 chamada, SÓ se ambíguo)
4. Compiler junta fontes
5. Legal-writer (se solicitado) gera resposta formal
6. Critic avalia score
7. **OrchestratorTimeline** mostra em tempo real cada fase para o user

### Configurações
- **Admin → WebSearchConfig**: provedores clássicos / deep search OpenRouter / DataJud + MPRS Intranet
- **Admin → Pipeline do Acervo**: ativar/desativar cada agente, threshold do rerank, modelo dedicado

---

## Métricas

- **Testes backend:** 90 passed (27 → 90, +233%)
- **Bundle frontend:** ~850KB (chunked, lazy components)
- **Latência típica de análise:** 5-10s por documento
- **Latência típica de chat:** 8-15s (com LLM)
- **Custo por análise:** ~1 chamada LLM (não 3) + 1 embedding (Gemini 768d)
- **Custo por pesquisa (sem ambiguidade):** 0 LLMs (só embedding)
- **Custo por pesquisa (com ambiguidade):** 1 LLM rerank + 1 embedding

---

## Próximos passos (V2)

- **Integração AcervoPipelineConfig no pipeline** (Fase 2.5): fazer o analyzer respeitar enableClassifier/Ementa/KeyPoints
- **Deep search real** (Fase 2c real): gerar queries → buscar → sintetizar (em vez de só o toggle)
- **Firestore backups** automatizados
- **Métricas + dashboard** (BigQuery export)
- **A11y**: revisão completa WCAG 2.2
- **Mais testes E2E** (Playwright)
