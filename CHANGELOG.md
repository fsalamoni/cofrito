# Changelog

Todas as mudanças notáveis neste projeto são documentadas aqui.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
e este projeto segue [Semantic Versioning](https://semver.org/lang/pt-BR/).

## [Não publicado]

### Em progresso (Fase 1 — Backend RAG)
- `services/embeddings.ts` — wrapper Gemini text-embedding-004 com cache
- `services/ingestion.ts` — pipeline de ingestão com frontmatter + chunking
- `services/validation.ts` — validação de corpus
- `scripts/run-golden-set.ts` — avaliador automático
- Testes unitários para `embeddings` e `anonymizer`
- Golden set com 50 perguntas (9 categorias)
- `docs/CHECKLIST-FASE-1.md` — plano detalhado de 3 semanas

### Planejado
- [ ] v0.1.0 — Backend RAG funcional
- [ ] v0.2.0 — Widget React
- [ ] v0.3.0 — Portal admin
- [ ] v0.4.0 — Hardening (LGPD, segurança)
- [ ] v1.0.0 — Lançamento produção
- [ ] v1.1.0 — Integração página oficial MPRS

## [0.0.0] - 2026-08-05

### Adicionado
- Documento de planejamento completo (`docs/00-PLANEJAMENTO-COMPLETO.md`)
- Scaffold do projeto (frontend, functions, CI/CD)
- Configurações Firebase (rules, indexes, hosting)
- ADRs iniciais
- CI/CD workflows
- 11 documentos seed para o corpus
- Protótipo HTML standalone (referência de UX)

## [0.0.1] - 2026-08-06

### Configurado
- Projeto Firebase `cofrito` (número 941013755211) criado e configurado
- Authentication: Google + email/senha
- Firestore Database (modo produção, região southamerica-east1)
- Hosting para `cofrito.web.app`
- Storage (plano Blaze)
- `.firebaserc` atualizado com project ID `cofrito`
- `.env.example` e `frontend/.env.example` atualizados
