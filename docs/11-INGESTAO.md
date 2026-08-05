# Ingestão de Material

> Como adicionar novos documentos ao corpus do Cofrito.

---

## Formatos suportados

| Formato | Como extrair | Observação |
|---|---|---|
| **Markdown (`.md`)** | ler direto | Ideal |
| **DOCX (`.docx`)** | `mammoth` | OK |
| **PDF (texto)** | `pdf-parse` | OK |
| **PDF (escaneado)** | precisa OCR (Tesseract/Cloud Vision) | Caro, evitar |
| **HTML** | `cheerio` | Limpar tags, manter só texto |

**Recomendação:** converter tudo para Markdown antes.

---

## Estrutura de pastas

```
data/raw/
├── atos-normativos/
│   ├── provimento-pgj-33-2017.md
│   ├── os-002-2015.md
│   └── ...
├── teses/
│   ├── tese-nepotismo.md
│   └── ...
├── legislacao/
├── doutrina/
├── templates/
├── faq/
└── jurisprudencia/
```

## Frontmatter obrigatório

```yaml
---
title: "Ordem de Serviço nº 002/2015"
type: ato                    # ato | tese | parecer | legislacao | template | doutrina | faq | manual
date: 2015-03-20
source: "Diário Oficial do MPRS"
url: "https://www.mprs.mp.br/legislacao/os-002-2015"
area: ["procedimental", "caos"]   # áreas temáticas (multi)
tags: ["ordem-de-servico", "solicitacoes"]  # tags livres
version: 1
status: ativo              # ativo | revogado | parcial
review:                   # revisão periódica
  lastReviewAt: 2025-01-15
  nextReviewAt: 2026-01-15
  reviewer: "uid-admin"
---

# Conteúdo do documento em markdown
```

### Tipos suportados

| Tipo | Uso |
|---|---|
| `ato` | Provimentos, OS, Recomendações |
| `tese` | Teses compiladas |
| `parecer` | Pareceres-modelo |
| `legislacao` | Leis, CF, códigos |
| `template` | Templates de peça |
| `doutrina` | Artigos, livros |
| `faq` | Perguntas frequentes |
| `manual` | Manuais institucionais |
| `jurisprudencia` | (futuro) |

---

## Pipeline de ingestão

```
[Arquivo em data/raw/]
   │
   ▼
[1. Parse] — gray-matter + extractor
   │
   ▼
[2. Limpeza] — remove ruído, normaliza
   │
   ▼
[3. Chunking] — 1000 tokens, overlap 200
   │              respeita estrutura
   │
   ▼
[4. Embedding] — Gemini text-embedding-004
   │                batch de 100
   │                cache: hash(text) → embedding
   │
   ▼
[5. Persistência] — /corpus/documents/{id}
   │                   /chunks/{chunkId} com vector
   │                   metadata para filtros
   │
   ▼
[6. Validação] — 5% amostra lida por humano
```

---

## Como adicionar um documento

### Opção 1: Via CLI (desenvolvimento)

```bash
# 1. Coloque o arquivo em data/raw/ com frontmatter
vim data/raw/teses/tese-nova.md

# 2. Rode a ingestão
cd functions
npm run build
GEMINI_API_KEY=sua-key GOOGLE_APPLICATION_CREDENTIALS=../serviceAccountKey.json \
  npm run ingest

# 3. Verifique
npm run validate:corpus
```

### Opção 2: Via painel admin (produção)

1. Login no painel admin
2. Seção "Adicionar documento"
3. Preencher: título, tipo, área, tags, conteúdo
4. Clicar em "Salvar"
5. Cloud Function processa automaticamente

### Opção 3: Via PR (governado)

1. Criar branch
2. Adicionar arquivo em `data/raw/...`
3. Abrir PR
4. CI valida
5. Após merge, script de ingestão roda automaticamente (v2)
6. Revisão humana para documentos críticos

---

## Versionamento

Cada documento tem `version` (número). Mudança:
- Incrementar `version`
- Reingerir (cria novos chunks, remove antigos)
- Marcar versão antiga com `status: 'revogado'`

Substituição:
- Documento novo com `status: 'ativo'`
- Documento antigo com `status: 'revogado'` + `replacedBy: 'novo-id'`

---

## Revisão periódica

Cada documento tem:
- `review.lastReviewAt` — última revisão
- `review.nextReviewAt` — próxima revisão
- `review.reviewer` — uid do revisor

**Cloud Function** (futuro, scheduled) verifica documentos com `nextReviewAt < hoje` e notifica.

---

## Critérios de qualidade

### Texto limpo

✅ Bom:
```markdown
## Art. 2º, IV

As respostas dos CAOs às perguntas não devem fazer parte
dos autos da investigação ou processo...
```

❌ Ruim:
```
Página 3 de 12
DIÁRIO OFICIAL DO MPRS
PODER LEGISLATIVO
DIÁRIO OFICIAL DO MPRS
PODER LEGISLATIVO
...
## Art. 2º, IV
As respostas dos CAOs...
```

### Granularidade

- **Atos normativos:** por artigo (ou parágrafo, se longo)
- **Teses:** uma tese = um chunk
- **Pareceres-modelo:** por seção (relatório, fundamentação, conclusão)
- **Legislação:** por artigo relevante

### O que NÃO entra

- ❌ Documentos com dados pessoais não anonimizados
- ❌ Pareceres com identificação de partes
- ❌ Documentos sigilosos ou restritos
- ❌ Texto em OCR de baixa qualidade
- ❌ Cópias não oficiais

---

## Reingerir todo o corpus

```bash
# CUIDADO: isso apaga todos os chunks e recria
cd functions
GEMINI_API_KEY=sua-key GOOGLE_APPLICATION_CREDENTIALS=../sa.json \
  ADMIN_UID=seu-uid \
  npx firebase functions:shell
  > adminReingest({})
```

Ou via admin callable:
```typescript
const reingest = httpsCallable(functions, 'adminReingest')
await reingest({})
```

---

## Monitorar ingestão

- Cloud Logging: query `message: "ingestion"`
- Cloud Function: `runIngestion` retorna `{ documentsProcessed, chunksCreated, errors, totalTimeMs, estimatedCostUsd }`

---

## Custos

| Etapa | Custo |
|---|---|
| Parsing (PDF, DOCX) | grátis |
| Embedding | $0.025 / 1M tokens (Gemini) |
| Firestore storage | $0.06 / GB / mês |
| Vector Search | $0.06 / GB / mês |

**Exemplo:** 100 docs de 5KB cada = 500KB = ~125k tokens de embedding = $0.003 (uma vez)

---

Próximo: [`12-INTEGRACAO-MPRS.md`](12-INTEGRACAO-MPRS.md).
