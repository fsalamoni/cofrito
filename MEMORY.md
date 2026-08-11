### 2026-08-11 — Cofrito Bot Identity + Anti-Hang (Deploy #83 SUCCESS)

**Owner testou chat e descobriu 2 problemas CRITICOS:**
1. Bot respondia "Nao encontrei material sobre isso no acervo" quando perguntado "quem e voce"
2. Orquestrador travava durante o processamento

**SOLUCOES (Deploy #83):**

1. SYSTEM PROMPT REESCRITO (functions/src/prompts/system.ts):
   - Adicionada secao # IDENTIDADE com texto canonico
   - Resposta padrao a perguntas "quem e voce", "o que faz", "como funciona"
   - Regra #0: perguntas sobre o proprio agente NAO buscam no corpus
   - Identidade institucional (CAOCIPP / MPRS) verbatim
   - Limites bem documentados

2. SEED CORPUS (services/seed-corpus.ts):
   - 3 documentos fundacionais inseridos automaticamente no cold start:
     * seed-sobre-o-cofrito (identidade, limites, como funciona)
     * seed-sobre-o-caocipp (estrutura, atribuicoes)
     * seed-como-abrir-consulta-formal (fluxo)
   - Idempotente (flag globalThis __cofritoSeedDone)
   - Inserido em corpus na primeira chamada ao chatV2
   - Handler adminSeedCorpus para forcar re-seed
   - 8 testes unitarios (passa)

3. ANTI-HANG (services/llm-providers.ts + agents/pipeline.ts):
   - withTimeout() helper reutilizavel
   - generateWithProvider() com timeoutMs default 60s
   - runAgent() no pipeline com timeout 90s por agente
   - Watchdog geral: pipeline termina com fallback se > 240s
   - Garantia: NUNCA trava, sempre finaliza
   - 3 testes para withTimeout (passa)

4. ONCALL CONFIG (chatV2):
   - timeoutSeconds: 300 (5 min)
   - memory: 1GiB
   - Seed corpus init no cold start (nao-bloqueante)

**METRICAS FINAIS:**
- Testes backend: 105 passed (era 102 + 3 do withTimeout)
- SW: v15 (era v14)
- Bundle: index-C7_hlGEz.js
- Latencia: 5-15s (chat com 5 agentes + timeouts)
- Deteccao de hang: 90s por agente, 240s pipeline total

**CI: #90 SUCCESS | Deploy: #83 SUCCESS**

**LICAO OPERACIONAL:**
Sempre que um bot pode ser perguntado sobre si mesmo, o system prompt
deve ter uma secao # IDENTIDADE. E qualquer chamada de LLM/pipeline
deve ter timeout - senao o pipeline pode travar indefinidamente.
Padrao: timeout por agente (90s) + watchdog geral (240s).
