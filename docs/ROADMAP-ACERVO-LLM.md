# Roadmap — Acervo, Agentes e Configurações de LLM

Documento de planejamento das melhorias no acervo (banco de dados de documentos),
nos agentes da plataforma e nas configurações de LLM. Escrito a partir de uma
leitura completa do código atual (backend `functions/` + frontend `frontend/`).

> **Legenda:** ✅ feito nesta fase · 🔜 pendente (próximas fases) · 🧩 já existia

---

## Diagnóstico (estado atual do código)

O que **já existia** e funciona razoavelmente:

- 🧩 **Reconstrução do documento** (`services/document-json-converter.ts`, JSON v2):
  remove cabeçalhos/rodapés repetidos, junta parágrafos quebrados entre páginas e
  detecta seções. A base de "não deixar a quebra de página quebrar o parágrafo" existe.
- 🧩 **Ementa jurídica e Pontos Relevantes** (`services/acervo-analyzer.ts`):
  estruturas ricas — ementa (tipo, assunto, síntese, fundamentação, conclusão,
  keywords, matérias) e pontos relevantes (pessoas, cargos, vínculos de parentesco/
  afinidade/compadrio, citações jurídicas). O prompt já pede o mapeamento
  autoridade → parentesco → circunstâncias.

Causas reais dos problemas relatados:

1. **Sem LLM configurado → cai na heurística** (regex), que gera ementa/pontos
   genéricos ("Aguardando reanálise…"). Se a config global não persiste/aparece,
   todo upload cai na heurística → parece que "a IA não analisa".
2. **Bug de persistência (corrigido nesta fase):** a config global era **gravada
   com envelope** `{ data: {...} }` (via `config-store`), mas o front lia os campos
   na **raiz** do documento → valores salvos nunca reapareciam nos campos.
3. **Não existia** arquitetura por-agente (orquestrador / criador de acervo /
   pesquisador externo) com escolha de modelo próprio + **CRUD de skills**.
4. **Não existia** config por-agente por usuário.
5. **Não existe** visualizador/editor web do documento reconstruído (só o texto).

---

## Fase 1 — Backbone de Configuração de LLM/Agentes ✅ (esta entrega)

**Backend**

- ✅ `services/agents-config.ts`: modelo unificado de agentes
  (`orchestrator`, `acervo`, `web-researcher`) com `enabled`, `model`
  (`mode: global | custom` + provider/model/apiKey/baseUrl/temperature/maxTokens)
  e `skills[]` (CRUD). Inclui `resolveAgentLLMConfig()` (custom → senão global) e
  `buildAgentSkillsPrompt()` (injeta skills ativas no system prompt). Skills-semente
  por agente já preenchidas.
- ✅ `handlers/agents-config.ts`: `adminGetAgentsConfig` (apiKey **sempre mascarado**
  + `hasApiKey`) e `adminSaveAgentsConfig` (**preserva** a apiKey salva quando o
  front envia máscara/vazio). Persistido em `admin-config/agents`.
- ✅ Correção do getter global (`adminGetGlobalLLM`): passa a devolver
  `temperature`, `maxTokens`, `active` e `updatedBy`.
- ✅ Fiação real (não é só UI):
  - **Acervo:** `runAnalysisInBackground` e a fila de processamento resolvem o
    modelo do agente `acervo` e injetam as skills configuradas na análise.
  - **Orquestrador:** `chat-v2` aplica modelo dedicado + skills do orquestrador no
    system prompt do chat.
- ✅ Testes: `services/agents-config.test.ts` (7 casos). Suite backend: 135 verdes.

**Frontend**

- ✅ Correção do bug de persistência em `hooks/useLLMConfig.ts`: lê o **envelope**
  `{ data }` **e** o formato legado → valores globais reaparecem nos campos.
- ✅ Renomeado no admin: **"Pipeline do Acervo" → "Configurações de LLM"**. A página
  passou a consolidar 3 seções: (1) LLM Global, (2) Agentes e Skills, (3) Análise do Acervo.
- ✅ `pages/admin/AgentsConfig.tsx`: cartão por agente com toggle ativo/inativo,
  seletor "LLM global vs modelo dedicado" (provider/model/apiKey/baseUrl) e **CRUD
  de skills** (criar, editar nome/descrição/prompt, ligar/desligar, excluir).
- ✅ Removida a duplicação do override de modelo do acervo (agora único lugar: o
  cartão "Criador de Acervo").

---

## Fase 2 — Config de LLM/Agentes por usuário 🔜

- 🔜 Estender o modelo por-agente para o escopo do usuário
  (`users/{uid}.agentsConfig`), com a mesma UI (reaproveitar `AgentsConfig`).
- 🔜 Resolução em cascata: **usuário (por agente) → global (por agente) → global** →
  env. Regra: quando o admin **não** força um modelo global, cada usuário pode
  configurar seus provedores/modelos por agente.
- 🔜 Página `SettingsPage` do usuário com as mesmas seções (somente seus agentes).

## Fase 3 — Qualidade do acervo (ementa / pontos / ingestão) 🔜

- 🔜 Garantir que o caminho **LLM** rode de fato no upload quando há config (telemetria
  clara de `analysisMethod: llm|heuristic` na planilha do admin).
- 🔜 Refino de prompt da **ementa** e dos **pontos relevantes** (checklist explícito:
  assunto principal + complementares; autoridades e cargos; graus de parentesco;
  outros vínculos; fundamentos que embasaram a decisão), guiado pelas skills do agente.
- 🔜 Mapeamento formal dos **tipos jurídicos possíveis** em `admin-config` editável
  (hoje as listas de natureza/tipo estão embutidas no prompt).
- 🔜 Reprocessar o acervo existente com o novo pipeline (batch já existe:
  `adminReanalyzeBatch` / fila).

## Fase 4 — Visualizador / Editor do documento 🔜

- 🔜 Visualização do **original** (PDF/DOCX) + visualização em **editor web** a partir
  do JSON v2 reconstruído (parágrafos íntegros, seções, cópia de trechos com formatação).
- 🔜 Edição do texto reconstruído pelo admin, com persistência no JSON v2.

## Fase 5 — Pastas e Configurações de Pesquisa 🔜

- 🔜 Revisar persistência/exibição de "Pastas de Pesquisa" (`SourcePaths`) e
  "Configurações de Pesquisa" (`ResearchConfig`) no mesmo padrão (valores salvos
  reaparecem + status).

## Fase 6 — Segurança / Hardening 🔜

- 🔜 **`admin-config/llm` expõe a apiKey a qualquer usuário logado** (regra
  `allow read: if isSignedIn()`). Separar um doc público de "flag" (existe/ativo)
  de um doc privado com as chaves, e ler as chaves só via Cloud Function.
- 🔜 Idem para as chaves por-agente em `admin-config/agents`.

---

## Arquitetura de resolução de modelo (após Fase 1)

```
Chat (orquestrador):   orchestrator.custom → global(admin) → user → env → stub
Acervo (upload):       acervo.custom       → llmOverride(legado) → admin global → GEMINI env → heurística
Pesquisador web:       (base pronta; fiação de modelo dedicado na Fase 2/3)
```

As **skills ativas** de cada agente são concatenadas e injetadas no system prompt
do respectivo agente (`buildAgentSkillsPrompt`).
