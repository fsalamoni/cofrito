# Agente Cofrito — CAOCIPP / MP-RS

> Assistente conversacional institucional do Centro de Apoio Operacional Cível e do Patrimônio Público do Ministério Público do Estado do Rio Grande do Sul.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-20-green.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/typescript-5.5-blue.svg)](https://www.typescriptlang.org)

---

## O que é

O **Cofrito** é um agente de IA conversacional que:

- Aparece como widget na página do CAOCIPP
- Responde perguntas sobre o material institucional (atos, teses, modelos, FAQ)
- **Recusa educadamente** perguntas fora do escopo
- Mantém histórico por usuário (personalização)
- Permite abertura de **consulta formal** ao CAOCIPP quando o material não basta

> ⚠️ **Status:** em desenvolvimento — ver [`docs/00-PLANEJAMENTO-COMPLETO.md`](docs/00-PLANEJAMENTO-COMPLETO.md) para o roadmap completo e [`STATUS.md`](STATUS.md) para o estado atual.

## Owner e decisões

- **Owner técnico:** você
- **Owner institucional:** você
- **Conta Firebase:** pessoal (sua)
- **Custos:** pagos por você
- **Domínio:** `cofrito.web.app` (Firebase default — sem custom domain)
- **Identidade visual:** design próprio minimalista
- **LGPD formal:** revisar antes de produção (não bloqueante para dev)

Mais detalhes em [`STATUS.md`](STATUS.md).

---

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 18 + TypeScript + Vite + Tailwind + shadcn-style UI |
| Widget | Web Component com Shadow DOM |
| Auth | Firebase Auth (Magic Link) |
| Banco | Firestore (com Vector Search nativo) |
| Backend | Firebase Cloud Functions (Node 20, TypeScript) |
| LLM | Gemini 2.5 Flash (default) + Pro (longo) |
| Embeddings | Gemini text-embedding-004 |
| Email | Resend |
| Hosting | Firebase Hosting (com domínio custom) |
| CI/CD | GitHub Actions |
| Observabilidade | Cloud Logging + Sentry |

---

## Estrutura

```
.
├── docs/                       # documentação completa
│   ├── 00-PLANEJAMENTO-COMPLETO.md
│   ├── 01-INSTALACAO.md
│   ├── 02-ARQUITETURA.md
│   ├── 03-DEPLOY.md
│   ├── 04-OPERACAO.md
│   ├── 05-LGPD-SEGURANCA.md
│   ├── 06-API-REFERENCE.md
│   ├── 07-AGENTE-PROMPT.md
│   ├── 08-TESTES.md
│   ├── 09-MONITORAMENTO.md
│   ├── 10-FAQ-INSTITUCIONAL.md
│   ├── 11-INGESTAO.md
│   ├── 12-INTEGRACAO-MPRS.md
│   └── adr/                    # Architecture Decision Records
│
├── frontend/                   # Widget React + portal admin
│   ├── src/
│   │   ├── components/
│   │   │   ├── AgentWidget/   # componente embutível principal
│   │   │   ├── ui/            # design system
│   │   │   ├── document/
│   │   │   ├── consult/
│   │   │   └── consent/
│   │   ├── pages/             # rotas do portal
│   │   ├── hooks/
│   │   ├── stores/
│   │   ├── lib/
│   │   ├── i18n/
│   │   ├── types/
│   │   └── assets/cofrito/    # mascote e estados
│   ├── public/
│   ├── package.json
│   └── ...
│
├── functions/                  # Cloud Functions
│   ├── src/
│   │   ├── handlers/          # endpoints
│   │   ├── services/          # lógica de negócio
│   │   ├── middleware/
│   │   ├── utils/
│   │   ├── prompts/           # system prompt e templates
│   │   └── config/
│   ├── package.json
│   └── ...
│
├── data/
│   └── raw/                    # material do CAOCIPP (Markdown)
│
├── scripts/                    # utilitários (ingest, validate, etc.)
├── tools/                      # scripts de shell
│
├── firebase.json
├── firestore.rules
├── firestore.indexes.json
├── storage.rules
├── .firebaserc
├── .github/workflows/
├── package.json                # workspace root
└── README.md (você está aqui)
```

---

## Quickstart (desenvolvimento local)

```bash
# 1. Pré-requisitos
# - Node 20+
# - Java 11+ (para Firestore Emulator)
# - Firebase CLI: npm i -g firebase-tools

# 2. Clone e instale
git clone <repo>
cd agente-caocipp
npm install

# 3. Configure
cp .env.example .env.local
# Preencha GEMINI_API_KEY e outras variáveis
cp frontend/.env.example frontend/.env.local
cp functions/.env.example functions/.env.local

# 4. Suba os emuladores
cd functions
npm run build
cd ..
firebase emulators:start

# 5. Em outro terminal: rode o frontend
cd frontend
npm run dev

# 6. Abra http://localhost:5173
```

Para mais detalhes, veja [`docs/01-INSTALACAO.md`](docs/01-INSTALACAO.md).

---

## Documentação

| Documento | Conteúdo |
|---|---|
| [`docs/00-PLANEJAMENTO-COMPLETO.md`](docs/00-PLANEJAMENTO-COMPLETO.md) | **Visão geral do projeto — começar por aqui** |
| [`docs/01-INSTALACAO.md`](docs/01-INSTALACAO.md) | Setup de ambiente de dev |
| [`docs/02-ARQUITETURA.md`](docs/02-ARQUITETURA.md) | Arquitetura técnica detalhada |
| [`docs/03-DEPLOY.md`](docs/03-DEPLOY.md) | Como fazer deploy |
| [`docs/04-OPERACAO.md`](docs/04-OPERACAO.md) | Operação, monitoramento, incidentes |
| [`docs/05-LGPD-SEGURANCA.md`](docs/05-LGPD-SEGURANCA.md) | LGPD, segurança, compliance |
| [`docs/06-API-REFERENCE.md`](docs/06-API-REFERENCE.md) | Contratos das Cloud Functions |
| [`docs/07-AGENTE-PROMPT.md`](docs/07-AGENTE-PROMPT.md) | System prompt, guardrails |
| [`docs/08-TESTES.md`](docs/08-TESTES.md) | Estratégia de testes |
| [`docs/09-MONITORAMENTO.md`](docs/09-MONITORAMENTO.md) | Observabilidade |
| [`docs/10-FAQ-INSTITUCIONAL.md`](docs/10-FAQ-INSTITUCIONAL.md) | FAQ do usuário |
| [`docs/11-INGESTAO.md`](docs/11-INGESTAO.md) | Como adicionar documentos |
| [`docs/12-INTEGRACAO-MPRS.md`](docs/12-INTEGRACAO-MPRS.md) | Como integrar à página oficial |

### ADRs (Architecture Decision Records)

| ADR | Decisão |
|---|---|
| [0001](docs/adr/0001-stack-frontend.md) | Stack do frontend (React + Vite + TS + Tailwind) |
| [0002](docs/adr/0002-llm-gemini.md) | LLM Gemini (vs OpenAI, Claude) |
| [0003](docs/adr/0003-vector-search.md) | Firestore Vector Search (vs Vertex AI) |
| [0004](docs/adr/0004-auth-magic-link.md) | Auth Magic Link (vs senha, OAuth) |
| [0005](docs/adr/0005-seguranca.md) | Padrões de segurança |
| [0006](docs/adr/0006-guardrails.md) | Estratégia de guardrails |
| [0007](docs/adr/0007-integracao-mprs.md) | Estratégia de integração com MPRS |

---

## Contribuindo

1. Fork / branch a partir de `develop`
2. Faça suas mudanças
3. Garanta: `npm run lint && npm test && npm run build` passam
4. Abra Pull Request para `develop`
5. Aguarde review

Veja [`CONTRIBUTING.md`](CONTRIBUTING.md) para detalhes.

---

## Licença

Código: [MIT](LICENSE)
Material institucional: direitos do MPRS / CAOCIPP.

---

## Contato

- **Owner institucional:** Coordenação do CAOCIPP
- **Owner técnico:** ver [`CODEOWNERS`](.github/CODEOWNERS)
- **DPO MPRS:** ver [`docs/05-LGPD-SEGURANCA.md`](docs/05-LGPD-SEGURANCA.md)
- **Issues:** GitHub Issues

---

**Mantido pela Assessoria técnica do CAO Cível/Patrimônio Público — MP/RS**
