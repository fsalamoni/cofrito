# Smoke Test V1 — Validação manual do deploy

> **Como rodar:** após cada deploy, validar que tudo funciona end-to-end.

## Pré-requisitos
- Conta Firebase com permissão master admin em `cofrito.web.app`
- GEMINI_API_KEY configurada (env ou admin-config/llm)
- Navegador com DevTools aberto

---

## 1. App carrega (sem cache)

- [ ] Abrir `https://cofrito.web.app` (Ctrl+Shift+R)
- [ ] Verificar que o bundle JS tem hash novo (DevTools → Network → `index-*.js`)
- [ ] Verificar SW: Application → Service Workers → sw-v13.js

## 2. Login

- [ ] Login com Google
- [ ] Aceitar consent
- [ ] Verificar que aparece o widget de chat

## 3. Chat básico

- [ ] Enviar "O que é o Cofrito?"
- [ ] Verificar **OrchestratorTimeline** aparece com eventos em tempo real:
  - thinking
  - planning
  - searching-acervo (com count de fontes)
  - answering
  - complete
- [ ] Verificar que o response do agentRunIndicator aparece DEPOIS da resposta

## 4. Acervo (admin)

- [ ] Acessar `#/admin/documents`
- [ ] Ver DocumentCatalog com planilha (vazia ou populada)
- [ ] Upload de um PDF de teste
- [ ] Status muda: `analise_pendente` → `analise_processando` → `analisado`
- [ ] Abrir viewer do doc → ver 3 abas: Info / JSON v1 / Análise
- [ ] Verificar que `classification.natureza`, `ementa.assunto`, `keyPoints.items` estão preenchidos
- [ ] Botão "Re-analisar" funciona
- [ ] Botão "Deletar" funciona

## 5. Pipeline config

- [ ] Acessar `#/admin/acervo`
- [ ] Desativar toggle "Classificador"
- [ ] Salvar
- [ ] Re-analisar um doc → verificar que `classification` fica como `{}` ou null

## 6. WebSearch config

- [ ] Acessar `#/admin/websearch`
- [ ] Ver 3 sub-abas: Busca web / Deep search / Bases específicas
- [ ] Sub-aba "Deep search": toggle "Usar modelo LLM global" ON
- [ ] Configurar provider OpenRouter com API key
- [ ] Testar com "Testar"

## 7. Configs globais

- [ ] Acessar `#/admin/research`
- [ ] Salvar config
- [ ] Acessar Firestore console: `admin-config/research` tem envelope `{data, version, updatedAt, updatedBy}`

## 8. Chat com pesquisa

- [ ] No chat, enviar pergunta sobre matéria do corpus
- [ ] Verificar que `internalSources` aparecem na response
- [ ] Testar toggle "+ Web externa" no chat
- [ ] Verificar que o response inclui fontes com snippet

---

## Checklist de validação de cada deploy

- [ ] CI passa (Lint, TypeCheck, Test, Build)
- [ ] Deploy Firebase SUCCESS
- [ ] Smoke test E2E passa
- [ ] Bundle JS novo no ar
- [ ] SW atualizado (v+1)
- [ ] Console sem erros críticos
- [ ] Firestore rules aplicadas (testar leitura como user)
- [ ] Firestore indexes ativos (queries sem 503)
