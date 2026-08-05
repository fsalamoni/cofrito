# Testes

> Estratégia de testes do Cofrito.

---

## Pirâmide de testes

```
            ╱╲
           ╱  ╲           E2E (Playwright) — 5%
          ╱────╲
         ╱      ╲         Integração (Vitest) — 25%
        ╱────────╲
       ╱          ╲       Unitário (Vitest) — 70%
      ╱────────────╲
```

---

## Backend (functions)

### Unitários

**Localização:** `functions/src/**/*.test.ts`

**Ferramenta:** Vitest

**Cobertura target:** ≥ 70%

**O que testar:**
- Funções puras (chunking, validadores, geradores)
- Guardrails (todos os padrões)
- Filtro de PII
- Cálculo de similaridade (se mockarmos embeddings)

**Rodar:**
```bash
cd functions
npm test
npm run test:coverage
```

**Exemplo:**
```typescript
// functions/src/utils/validators.test.ts
import { describe, it, expect } from 'vitest'
import { validatePGEA } from './validators'

describe('validatePGEA', () => {
  it('aceita PGEA válido', () => {
    expect(validatePGEA('00021.000.181/2025').valid).toBe(true)
  })
  it('rejeita PGEA inválido', () => {
    expect(validatePGEA('abc').valid).toBe(false)
  })
})
```

### Integração

**Localização:** `functions/src/**/*.integration.test.ts`

**O que testar:**
- Cloud Functions end-to-end (com emulador)
- Fluxo completo: chat → RAG → LLM (mockado) → persistência
- Ingestão de documento (com Firestore emulator + Gemini mockado)

**Rodar com emulador:**
```bash
firebase emulators:start
# Em outro terminal
cd functions
npm run test:integration
```

### Golden set

**Localização:** `functions/src/test/golden-set.ts` + `data/golden-set.json`

**O que é:** 50 perguntas de referência com gabarito.

**O que verifica:**
- Resposta cita fonte correta
- Recusa off-topic
- Recusa caso concreto
- Tom adequado
- Não alucina

**Como adicionar pergunta:**
```json
// data/golden-set.json
{
  "id": "ts-nepotismo-1",
  "category": "tese",
  "question": "O que diz a Súmula Vinculante 13 do STF?",
  "expectedKeywords": ["nepotismo", "parente", "terceiro grau"],
  "expectedCitation": "sv-13",
  "shouldRefuse": false
}
```

**Rodar:**
```bash
cd functions
npm run test:golden
# Resultado em docs/AI_GUIDE/golden-set-results.md
```

---

## Frontend

### Unitários

**Localização:** `frontend/src/**/*.test.tsx`

**Ferramenta:** Vitest + Testing Library

**Cobertura target:** ≥ 60%

**O que testar:**
- Componentes puros (MessageBubble, AgentAvatar, Welcome)
- Hooks (useAuth, useProfile)
- Stores (Zustand)
- Utils (formatDate, classNames, etc.)

**Rodar:**
```bash
cd frontend
npm test
npm run test:coverage
```

**Exemplo:**
```typescript
// frontend/src/components/MessageBubble.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MessageBubble } from './MessageBubble'

describe('MessageBubble', () => {
  it('renderiza mensagem do usuário', () => {
    render(<MessageBubble message={{ role: 'user', content: 'Olá' }} />)
    expect(screen.getByText('Olá')).toBeInTheDocument()
  })
})
```

### Componentes críticos — runtime test

Componentes complexos devem ter `*.runtime.test.tsx` que:
- Importa o componente
- Tenta renderizar (smoke test)
- Verifica que não há undefined em props
- Verifica interações básicas

### E2E (Playwright)

**Localização:** `e2e/`

**Cenários:**
- Carregar a página
- Abrir widget
- Fazer login (mock)
- Enviar pergunta
- Ver resposta com fontes
- Abrir consulta formal
- Painel admin (mock)

**Rodar:**
```bash
npm run e2e
```

---

## Lint e type-check

### Lint
```bash
npm run lint
```
- 0 erros obrigatórios
- 0 warnings em CI

### Type-check
```bash
npm run typecheck
```
- 0 erros obrigatórios
- `strict: true` em todos os workspaces

### Prettier
```bash
npm run format
```

---

## CI

A cada PR:

1. ✅ Lint (frontend + backend)
2. ✅ Type-check (frontend + backend)
3. ✅ Testes unitários
4. ✅ Build (frontend + backend)
5. ✅ Bundle size check
6. ✅ CodeQL (análise de segurança)
7. ✅ Dependency review

PR só pode ser mergeado se CI passar.

---

## Test data

### Firestore
- **Dev:** usa emuladores (dados descartáveis)
- **Staging:** projeto Firebase separado, dados de teste (criados por script `seed-test.ts`)
- **Produção:** NUNCA usar dados de teste

### Gemini
- **Dev:** pode usar API real com rate limit baixo
- **CI:** usa mock (vitest mock)
- **Staging:** API real
- **Produção:** API real

---

## Mutation testing (opcional, v2)

Usar Stryker ou similar para verificar qualidade dos testes.

---

Próximo: [`09-MONITORAMENTO.md`](09-MONITORAMENTO.md).
