# STATUS do Projeto — Agente Cofrito

> Snapshot vivo do estado do projeto. Atualizado em 2026-08-05.

---

## Identidade do projeto

| Item | Valor |
|---|---|
| **Nome** | Cofrito (assistente conversacional do CAOCIPP) |
| **Owner** | Você (assessor técnico do CAOCIPP/MP-RS) |
| **Tipo** | Protótipo → produção |
| **Workspace** | `/workspace/agente-caocipp/REAL/` |
| **Repositório** | (a criar) |
| **Domínio** | `cofrito.web.app` (Firebase default) |

---

## Decisões tomadas (2026-08-05)

| # | Decisão | Escolha |
|---|---|---|
| D1 | Conta Firebase | **Pessoal** (sua) |
| D2 | Custos Firebase | **Você paga** |
| D3 | Identidade visual | **Própria, minimalista, clara, objetiva** |
| D4 | System prompt | **Aprovado por você** |
| D5 | Termo de uso | **Aprovado por você** |
| D7 | Domínio | **`cofrito.web.app`** (Firebase default, sem custom) |
| D8 | Cenário de integração | **Decidir depois** (subdomínio ou Web Component) |
| D11 | Backup do corpus | **Cloud Storage** (default Firebase) |
| D13 | Owner institucional | **Você** |
| D14 | Início do desenvolvimento | **Imediato** |
| D15 | Revisão de código | **Solo (você)** |

### Decisões pendentes (não bloqueantes para dev)

- **D6:** Persona "cidadão externo" tem acesso na v1? (recomendo: não)
- **D9:** SLA do CAO para responder consultas formais (recomendo: informativo)
- **D10:** Quem opera (plantão) após lançamento? (recomendo: você, com TI MPRS depois)
- **D12:** DPO do MPRS — não relevante para dev, obrigatório antes de produção

---

## Stack final

| Camada | Escolha |
|---|---|
| Frontend | React 18 + Vite + TypeScript + Tailwind |
| Widget | Web Component com Shadow DOM |
| Auth | Firebase Auth — Magic Link |
| Banco | Firestore (com Vector Search nativo) |
| Backend | Firebase Cloud Functions (Node 20, TypeScript) |
| LLM | Gemini 2.5 Flash + Pro |
| Embeddings | Gemini text-embedding-004 |
| Email | Resend |
| Hosting | Firebase Hosting (`cofrito.web.app`) |
| CI/CD | GitHub Actions |
| Observabilidade | Cloud Logging + Sentry |

---

## Identidade visual

**Decisão (D3):** design próprio, minimalista, claro, objetivo.

Princípios:
- ✅ Cores limpas (azul institucional + neutros)
- ✅ Tipografia Inter (sans-serif moderna)
- ✅ Mascote "Cofrito" (livrinho simpático)
- ✅ Sem elementos decorativos desnecessários
- ✅ Acessibilidade WCAG AA
- ✅ Responsivo (desktop, tablet, mobile)
- ❌ Sem brasão oficial do MPRS (não temos autorização)
- ❌ Sem referências visuais à identidade do MPRS (será incorporado depois)

**Quando for incorporar à página oficial do MPRS:** rever com a Comunicação do MPRS para alinhar com identidade visual institucional.

---

## Roadmap de execução

### Fase 0 — Fundação ✅ (completa)
- ✅ Documento de planejamento completo
- ✅ Estrutura do projeto criada
- ✅ Decisões consolidadas
- ⏳ Criar repositório GitHub
- ⏳ Configurar conta Firebase pessoal
- ⏳ Configurar projeto `agente-caocipp-dev` no Firebase

### Fase 1 — Backend RAG (semanas 1-3) ⏳
- Cloud Functions base (chat, retrieval, llm)
- Ingestão de documentos
- Golden set
- Testes
- Deploy staging

### Fase 2 — Frontend widget (semanas 3-5) ⏳
- Widget React completo
- Integração com Cloud Functions
- Testes E2E
- Build < 200KB

### Fase 3 — Portal admin (semana 5) ⏳
- CRUD documentos
- Lista de consultas formais
- Dashboard

### Fase 4 — Hardening (semana 6) ⏳
- LGPD: termo, política, botões
- Rate limit, headers segurança
- Sentry
- Avaliação humana

### Fase 5 — Lançamento demo (semana 7) ⏳
- Deploy produção (`cofrito.web.app`)
- URL pública
- Teste com usuários

### Fase 6 — Integração MPRS (depende de aprovação) ⏳
- Decisão sobre cenário (subdomínio, Web Component, app)
- Alinhamento com TI MPRS
- Aprovação final

---

## Próximos passos imediatos

1. **Criar repositório GitHub** (sua conta pessoal)
2. **Subir este projeto** (`git init && git add . && git commit && git remote add origin <url>`)
3. **Criar projeto Firebase** pessoal: `agente-caocipp-dev`
4. **Configurar Firebase CLI**: `firebase login && firebase use agente-caocipp-dev`
5. **Instalar deps**: `cd /workspace/agente-caocipp/REAL && npm install`
6. **Subir emuladores**: `firebase emulators:start`
7. **Começar a Fase 1**: implementar os serviços de retrieval e LLM

---

## Contato / accountable

- **Owner técnico:** Você
- **Owner institucional:** Você
- **Suporte:** via GitHub Issues
- **Emergência:** caocipp@mprs.mp.br

---

> Atualize este arquivo sempre que o status mudar significativamente.
