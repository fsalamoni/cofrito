# Roadmap Detalhado — V1 Estrutural do Cofrito

> 3 pedidos grandes do owner. Tudo calibrado na Lexio (que tem o modelo maduro). Mudanças são **estruturais** — afetam banco, backend, frontend e admin.

## Contexto do Owner — Decisões confirmadas

1. **OpenRouter deep search (Opção C):** se o admin NÃO configurar modelo específico em "deep search", o orquestrador usa o **modelo LLM global já carregado** (sem novo chamado de LLM). Ele apenas invoca a **skill de pesquisa web profunda** e depois reassume o comando do chat para entregar a resposta. Mesma coisa para skills de pesquisa superficial, interna, externa — skills reutilizam o modelo global carregado.

2. **Chat orquestrador visível (como Lexio):** a tela do chat deve mostrar o transcorrer de **pensamentos, decisões, pesquisas e ações** do orquestrador, em tempo real, até a entrega final. Não é só "pensando..." — é o que o agente está fazendo: "Analisando pergunta", "Buscando no acervo interno", "Classificando documentos", "Lendo ementa X", "Gerando resposta".

3. **Substituir DocumentUpload.tsx por DocumentCatalog.tsx** com: upload, planilha, config do agente de upload.

---

## Fase 0 — Corrigir bug das configs globais

**Por que primeiro:** sem isso, qualquer config nova vai ter o mesmo bug. Validar que o ciclo read→write→read funciona para TODAS as configs.

### Investigação
1. Auditar cada handler de `get*Config` / `save*Config` em:
   - `admin-research.ts` → `getResearchConfig`, `saveResearchConfig`, `getWebSearchConfig`, `saveWebSearchConfig`, `getIntranetConfig`, `saveIntranetConfig`
   - `llm-config.ts` → `getLLMConfig`, `setLLMConfig`
   - `admin-documents.ts` → `adminGetSourcePaths`, `adminSetSourcePaths`
2. Verificar: o `save` está gravando no path correto? O `get` está lendo do mesmo path? Tem `merge: true` que sobrescreve acidentalmente?

### Mudanças
- Adicionar `version`, `updatedAt`, `updatedBy` em cada doc salvo
- Garantir `merge: false` (substitui o doc inteiro, sem perder campos)
- Adicionar log de auditoria: `console.info('config.saved', { collection, updatedBy, version })`
- Padronizar interface `ConfigDoc<T>` com `{ ...data, version: number, updatedAt: serverTimestamp, updatedBy: uid }`

### Validação
1. Admin salva ResearchConfig → reload → mantém ✓
2. Admin salva WebSearchConfig (muda provedor) → reload → mantém ✓
3. Admin salva IntranetConfig → reload → mantém ✓
4. Admin salva LLM config → reload → mantém ✓

---

## Fase 1 — Reorganizar WebSearchConfig + Deep Search OpenRouter

### 1.1 Estrutura nova de `WebSearchConfig.tsx`

```
<ConfigPage title="Pesquisa web externa">
  <SubTab name="Busca web" (4 provedores)>
    - Tavily (default, recomendado)
    - Serper (Google)
    - Brave (privacy)
    - Perplexity (busca + IA)
  </SubTab>
  <SubTab name="Deep search" (OpenRouter)>
    - Toggle: "Usar modelo LLM global" (default ON se houver)
    - Dropdown: se toggle OFF, lista de modelos OpenRouter (mesma UI da config global)
    - System prompt opcional para a skill
    - Info: "Esta skill é chamada quando o usuário ativa '+ Web externa'.
            O orquestrador passa o controle para a skill, que usa o modelo
            carregado para fazer busca + raciocínio, e depois reassume o chat."
  </SubTab>
  <SubTab name="Bases específicas">
    - DataJud (CNJ jurisprudência) — movido para cá
    - Link para aba MPRS Intranet (continua sendo aba dedicada)
  </SubTab>
</ConfigPage>
```

### 1.2 Backend
- Novo doc no Firestore: `admin-config/deep-search`
- Schema: `{ enabled, useGlobalModel: boolean, model?: string, systemPrompt?: string, maxTokens, temperature, updatedAt, updatedBy, version }`
- Novos handlers: `getDeepSearchConfig`, `saveDeepSearchConfig`, `testDeepSearch`
- Se `useGlobalModel: true` e houver config global → backend usa o mesmo modelo/provider/apiKey
- Se `useGlobalModel: true` e NÃO houver config global → backend retorna erro amigável: "Configure o LLM global primeiro"

### 1.3 Skill no orquestrador
- Criar `agents/skills/deep-search.ts` que:
  - Recebe o LLM config JÁ carregado (do `configToUse` global)
  - Faz busca web via Tavily/Serper/Brave/Perplexity (configurado em "Busca web")
  - SÍNTETIZA com o LLM (usando o mesmo config carregado — sem novo load)
  - Retorna o resultado estruturado para o orquestrador
- Orquestrador invoca a skill como `await runDeepSearchSkill(ctx)` e re-rentrou no fluxo principal

### 1.4 Validação
- Admin salva "Usar modelo global" + ativa ✓
- Admin salva "Modelo dedicado" + escolhe modelo ✓
- Chat com "+ Web externa" ativo → orquestrador mostra "Executando skill de deep search..." e usa o LLM carregado

---

## Fase 2 — Sistema de acervo profissional (Lexio-style)

### 2a. Refatorar `adminUploadDocument` (commit 1)

**Mudanças no handler:**
- Decodificar base64 → buffer
- Detectar mimeType e decidir compactação:
  - PDF/DOCX: já são binários, não compacta
  - TXT/MD/HTML/CSV: comprime com `gzip` antes de salvar no Storage
- Salvar **2 cópias no Storage**:
  - `corpus/uploaded/{docId}/original.{ext}` — para entregar ao usuário
  - `corpus/uploaded/{docId}/original.{ext}.gz` — versão compactada (se aplicável)
- Extrair texto (PDF: pdf-parse, DOCX: mammoth, MD/TXT/HTML: leitura direta)
- **Converter para JSON estruturado v1** (portar `document-json-converter.ts` da Lexio)
- Persistir no Firestore (`corpus/uploaded/{docId}`):
  - `textContent`: JSON.stringify(StructuredDocumentJson) — versão otimizada para busca
  - `textOriginal`: texto bruto (sem chunk/otimização) — para entregar ao usuário no chat
  - `meta`: metadata do JSON (format, pages, paragraphs, chars_original, chars_stored, compression_ratio)
  - `storagePath`, `storageSize`, `mimeType`, `mimeTypeOriginal`
  - `status: 'processando'` → após extração OK → `'analise_pendente'`
- **Não fazer chunk + embed aqui** (legacy). A pesquisa vai usar os metadados estruturados.
- Retornar: `{ ok, docId, status: 'analise_pendente', message: 'Upload OK. Análise automática iniciada.' }`

**Estrutura do doc no Firestore:**

```typescript
// corpus/uploaded/{docId}
{
  id: string
  fileName: string
  mimeType: string
  mimeTypeOriginal: string
  title: string  // editável
  type: string  // tipo documental (Parecer, Petição, etc) — editável
  area: string[]  // editável
  tags: string[]  // editável
  storagePath: string
  storageSize: number
  textContent: string  // JSON estruturado
  textOriginal: string
  storageFormat: 'json-v1'
  meta: { format, pages?, paragraphs, charsOriginal, charsStored, compressionRatio }
  status: 'processando' | 'analise_pendente' | 'analisado' | 'erro_analise' | 'erro_ingestao'
  analyzedAt: Timestamp | null
  classification: null | {
    natureza: 'consultivo' | 'executorio' | 'transacional' | 'negocial' | 'doutrinario' | 'decisorio'
    areaDireito: string[]
    assuntos: string[]
    tipoDocumento: string
    contexto: string[]
  }
  ementa: null | {
    tipo: string
    assunto: string
    sintese: string
    areas: string[]
    topicos: string[]
    conclusao: string
    keywords: string[]
  }
  keyPoints: null | {
    items: string[]
    reusableContent: string
  }
  chunksCount: number
  version: number
  createdAt: Timestamp
  createdBy: string
  updatedAt: Timestamp
  updatedBy: string
}
```

**Helper file: `functions/src/services/document-json-converter.ts`** (portado da Lexio)
- `textToStructuredJson(text, filename, pageCount): StructuredDocumentJson`
- `serializeStructuredJson(doc): string`
- `parseStructuredJson(textContent): StructuredDocumentJson | null`
- `resolveTextContent(textContent): string` — funciona tanto com JSON v1 quanto com texto legacy
- `getStructuredMeta(textContent): StructuredDocumentMeta | null`

**Compression helper: `functions/src/services/storage-compressor.ts`**
- `shouldCompress(mimeType, fileName): boolean`
- `compressBuffer(buffer, mimeType): Buffer` (gzip para texto)
- `decompressBuffer(buffer, mimeType): Buffer`

### 2b. Pipeline de análise automática (commit 2-3)

**Arquivo: `functions/src/services/acervo-analyzer.ts`**

3 agentes LLM que rodam em PARALELO (Promise.all) após o upload:

```typescript
// Agent 1: Classificador
export async function classifyAcervoDoc(input: {
  uid: string
  docId: string
  fileName: string
  text: string
  model: string
  apiKey: string
}): Promise<ClassificationResult> {
  // System prompt: "Você é um classificador especializado em documentos jurídicos..."
  // Output: { natureza, areaDireito, assuntos, tipoDocumento, contexto }
}

// Agent 2: Ementa
export async function generateEmenta(input: {
  uid: string
  docId: string
  fileName: string
  text: string
  model: string
  apiKey: string
}): Promise<EmentaResult> {
  // System prompt: "Você é um indexador de documentos jurídicos..."
  // Output: { tipo, assunto, sintese, areas, topicos, conclusao, keywords }
}

// Agent 3: Pontos Relevantes
export async function extractKeyPoints(input: {
  uid: string
  docId: string
  fileName: string
  text: string
  model: string
  apiKey: string
}): Promise<KeyPointsResult> {
  // System prompt: "Você é um analista jurídico. Identifique os pontos relevantes
  //                 e marque trechos reutilizáveis do documento."
  // Output: { items: string[], reusableContent: string }
}

// Orquestrador (roda em background)
export async function analyzeAcervoDoc(uid, docId, fileName, text, config): Promise<void> {
  // 1. Marcar status='processando'
  // 2. Promise.all([classifyAcervoDoc, generateEmenta, extractKeyPoints])
  // 3. Atualizar doc com classification, ementa, keyPoints
  // 4. Marcar status='analisado' (ou 'erro_analise' com log)
}
```

**Integração no upload:**
- Após o `adminUploadDocument` persistir o doc com `status: 'analise_pendente'`, dispara `analyzeAcervoDoc` em background (sem await, sem bloquear a response)
- O admin vê o status na planilha: `processando` → `analisado`

**Cache de análise:** se o admin re-upload do mesmo arquivo (mesmo hash), reusar a análise.

**Modelos:** o admin pode configurar modelos dedicados em `AcervoPipelineConfig` OU herdar do LLM global. Default: herdar.

### 2c. Refatorar `researcher-internal` em 3 camadas (commit 4)

**Arquivo: `functions/src/agents/researcher-internal.ts` (refatorar + `researcher-3layers.ts` novo)**

```typescript
// Layer 1 (zero-cost, Firestore query)
async function layer1_keywordPrefilter(query: string, limit = 30): Promise<DocCandidate[]> {
  // 1. Extrai keywords da query (simples split + stopwords)
  // 2. Query no Firestore: 
  //    WHERE status == 'analisado' AND (
  //      ementa.keywords array-contains-any keywords OR
  //      keyPoints.items array-contains-any keywords OR
  //      classification.assuntos array-contains-any keywords OR
  //      title contains-any (via keyword text-search) OR
  //      fileName contains-any
  //    )
  // 3. Retorna top 30 ordenados por data
  // Fallback: se query vazia, retorna os 10 mais recentes
}

// Layer 2 (LLM-barato, Buscador)
async function layer2_buscador(query: string, candidates: DocCandidate[], model): Promise<DocCandidate[]> {
  // System prompt: "Você é o BUSCADOR DE ACERVO. Recebe lista de documentos
  //                 (filename + ementa + keywords + keyPoints) e seleciona os
  //                 MAIS RELEVANTES (max 5). Responda JSON com {selected: [{id, score, reason}]}"
  // User prompt: query + lista de candidatos com metadados
  // Output: top 5 ranqueados
}

// Layer 3 (LLM-caro, Analista)
async function layer3_analista(query: string, topDocs: DocCandidate[], model): Promise<AnalyzedDoc[]> {
  // Para cada doc do top 5:
  //   - Lê textOriginal (truncado a 8000 chars)
  //   - System prompt: "Você é o ANALISTA DE ACERVO. Leia o documento e
  //                   gere: relevance (alta/media/baixa), score (0-1),
  //                   summary (2-3 frases), key_points (3-8 pontos),
  //                   reusable_content (trecho citável)"
  //   - Em paralelo (Promise.all) para os 5 docs
  // Output: top 5 com análise profunda
}
```

**Integração no pipeline existente (`pipeline.ts`):**
- O `researcher-internal` vira o orquestrador das 3 camadas
- Mantém o `retrieveRelevantChunks` (embedding) como **fallback** se Layer 1 não retornar nada (sem docs analisados ainda)

**Atualizar o chat:**
- Quando o orquestrador invoca a skill `researcher-internal`:
  - Emite evento `orchestrator:research-layer1-start`
  - Emite `orchestrator:research-layer1-done` com N candidatos
  - Emite `orchestrator:research-layer2-start` (mostra "Buscando com LLM...")
  - Emite `orchestrator:research-layer2-done` com top 5
  - Emite `orchestrator:research-layer3-start` (mostra "Analisando...")
  - Emite `orchestrator:research-layer3-done` com análise final

### 2d. Nova página `DocumentCatalog.tsx` (commit 5)

**Substitui `DocumentUpload.tsx`**

**Estrutura:**

```
<Page>
  <Header>
    <Title>Documentos do acervo</Title>
    <Subtitle>Base de conhecimento interna</Subtitle>
  </Header>
  
  <Section title="1. Upload">
    <FileDropZone />
    <ConfigInline>
      - Tipo documental (input)
      - Área (multi-select)
      - Tags (input)
    </ConfigInline>
    <UploadButton />
  </Section>
  
  <Section title="2. Planilha de documentos">
    <Filters>
      - Status (select)
      - Natureza (select)
      - Área (multi-select)
      - Tipo documental (select)
      - Full-text search (input)
    </Filters>
    <BulkActions>
      - Re-analisar selecionados
      - Excluir selecionados
    </BulkActions>
    <Table>
      | Filename | Título | Tipo | Área | Assuntos | Natureza | Status | Size | Uploaded | Ações |
    </Table>
    <Pagination />
  </Section>
</Page>
```

**Modal de edição de metadados:**
- Campos editáveis: title, type, area[], tags[]
- Botão: "Salvar" / "Re-analisar" / "Cancelar"

**Ações por linha:**
- **Ver original** — abre o doc em nova aba via signed URL
- **Ver JSON** — abre modal com o JSON estruturado formatado
- **Editar metadados** — modal
- **Re-analisar** — re-roda o pipeline (limpa classification/ementa/keyPoints, status='analise_pendente')
- **Excluir** — confirma e remove

### 2e. Nova página `AcervoPipelineConfig.tsx` (commit 6)

**Estrutura:**

```
<Page>
  <Header>
    <Title>Configurações do agente de acervo</Title>
  </Header>
  
  <Section title="Modelos">
    - Toggle: "Usar modelos do LLM global" (default ON)
    - Se OFF: dropdown para cada agente (Classificador, Ementa, Pontos Relevantes)
    - Mostra o modelo atual de cada
  </Section>
  
  <Section title="Pipeline">
    - Toggle: "Habilitar classificador" (default ON)
    - Toggle: "Habilitar gerador de ementa" (default ON)
    - Toggle: "Habilitar extrator de pontos relevantes" (default ON)
  </Section>
  
  <Section title="Pesquisa no chat">
    - Slider: "Threshold de similaridade Layer 1" (0.0-1.0)
    - Input: "Max docs no Layer 2 (Buscador)" (default 30)
    - Input: "Max docs no Layer 3 (Analista)" (default 5)
    - Toggle: "Usar embedding como fallback" (default ON, se Layer 1 vazio)
  </Section>
  
  <Section title="Prompts (avançado)">
    - Textarea: "Prompt do classificador" (editável, com botão "Restaurar padrão")
    - Textarea: "Prompt da ementa"
    - Textarea: "Prompt dos pontos relevantes"
  </Section>
</Page>
```

### 2f. Chat orquestrador visível (commit 7)

**O user pediu explicitamente: "demonstrar o transcorrer de pensamentos, decisões, pesquisas e demais ações"**

**O que o orquestrador emite em tempo real:**

```
[14:35:22] 💭 Analisando pergunta do usuário
[14:35:22] 🔍 Detectei: pergunta sobre improbidade administrativa
[14:35:22] 📂 Intenção: pesquisa interna + externa
[14:35:23] 💡 Decisão: vou buscar no acervo interno primeiro (corpus estruturado)
[14:35:23] ⚡ Layer 1: busca por keywords no Firestore
[14:35:23]    → "improbidade", "administrativa", "lei 8.429"
[14:35:24] ✓ Encontrei 8 documentos candidatos
[14:35:24] 🤖 Layer 2: Buscador LLM ranqueando...
[14:35:28] ✓ Top 3 selecionados:
[14:35:28]    1. "Parecer_MPRS_Improbidade_2024.pdf" (score 0.92)
[14:35:28]    2. "Acordao_TJRS_Improbidade.docx" (score 0.87)
[14:35:28]    3. "Artigo_Doutrina_Improbidade.pdf" (score 0.74)
[14:35:28] 🤖 Layer 3: Analista LLM lendo conteúdo...
[14:35:35] ✓ Análise concluída
[14:35:35] ✍️ Compilando resposta final
[14:35:36] ✅ Pronto!
```

**Como implementar:**
- O pipeline (multi-agente) já emite logs via `logger.info`
- Criar novo canal: `agentEvents` (Firestore ou in-memory pub/sub)
- Frontend escuta via `onSnapshot` e renderiza no ChatPanel
- UI: novo componente `<OrchestratorTrace>` que mostra a timeline

**Mudanças no backend (`chat-v2.ts`):**
- Adicionar `onEvent: (event) => void` no pipeline
- Cada agente emite eventos estruturados
- O backend escreve os eventos no Firestore: `chat-events/{conversationId}/{messageId}/{eventId}`
- Ou usa streaming via Server-Sent Events (SSE) — mais moderno, mas mais complexo

**Decisão:** usar Firestore collection (`chat-events`) — mais simples, escala OK para ~100 eventos/msg.

**Mudanças no frontend:**
- `ChatPanel.tsx` ganha novo sub-componente `<OrchestratorTrace>`
- Estilo: cards com ícone + cor por tipo de evento
- Streaming via `onSnapshot` do Firestore
- "Pensando..." vira uma timeline viva

### Fase 3 — Firestore indexes + security rules (commit 8)

**Indexes compostos necessários para Layer 1:**
```
collection: corpus/uploaded
- status + analyzedAt (para filtrar analisados, ordenar por data)
- classification.areaDireito + analyzedAt (filtro por área)
- classification.assuntos + analyzedAt (filtro por assunto)
- ementa.keywords + analyzedAt (filtro por keyword)
- classification.natureza + analyzedAt (filtro por natureza)
```

**Security rules — adicionar:**
- Validação de create/update em `corpus/uploaded/{docId}`:
  - Admin master pode tudo
  - Outros usuários só podem ler (campos públicos: title, type, area, classification, ementa, keyPoints, status, createdAt)
- Validação de `admin-config/deep-search`: admin master only
- Validação de `chat-events/{conversationId}/{messageId}/{eventId}`: usuário lê os próprios, sistema escreve

### Fase 4 — Testes + smoke test + docs (commit 9)

**Testes unitários:**
- `document-json-converter.test.ts` (portar da Lexio + adicionar casos)
- `acervo-analyzer.test.ts` (mock LLM, validar output schema)
- `researcher-3layers.test.ts` (mock Firestore, validar fluxo)

**Smoke test (CI):**
- Upload de PDF de teste
- Aguardar análise completar (polling, max 60s)
- Validar que doc tem classification + ementa + keyPoints
- Validar que a planilha retorna o doc

**Documentação:**
- `README.md` atualizado com a nova arquitetura
- `docs/architecture/acervo.md` com fluxo + schema
- `docs/architecture/orchestrator.md` com os eventos

---

## Cronograma estimado (commits + validações)

Cada commit:
1. Codar (1-3h para os grandes)
2. Build + test local
3. Push
4. CI (5-10min) → deploy
5. Validar no seu navegador
6. Seu feedback → próximo commit

| Fase | Commits | Tempo estimado |
|---|---|---|
| 0 | 1 | 30min |
| 1 | 1-2 | 1-2h |
| 2a | 1 | 1h |
| 2b | 2 | 2-3h |
| 2c | 1 | 2h |
| 2d | 1 | 2h |
| 2e | 1 | 1h |
| 2f | 2 | 3-4h |
| 3 | 1 | 30min |
| 4 | 1 | 1h |
| **Total** | **~12 commits** | **~15-20h** |

**Validação a cada commit.** Você testa, me diz se está OK, eu sigo. Se algo não funcionar, eu corrijo antes de avançar.

---

## Status atual

**Fase 0 — INICIANDO AGORA.**
