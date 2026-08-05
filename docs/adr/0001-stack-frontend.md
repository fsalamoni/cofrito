# ADR-0001: Stack do Frontend (React + Vite + TypeScript + Tailwind)

- **Status:** Aceito
- **Data:** 2026-08-05
- **Decisor(es):** Equipe técnica
- **Contexto:** Escolha da stack do widget e portal admin

## Contexto

Precisamos de uma stack para construir:
- O widget do Cofrito (componente embarcável, leve)
- O portal admin (CRUD, dashboards, auditoria)

Requisitos:
- Performance: bundle < 200KB gzipped
- Acessibilidade: WCAG AA
- DX moderno (HMR, type safety, lint rigoroso)
- Compatibilidade com Web Components
- Boa experiência com Firebase SDK

## Decisão

Adotamos a seguinte stack:

| Camada | Escolha | Versão |
|---|---|---|
| Linguagem | TypeScript | 5.5+ |
| Framework | React | 18.3+ |
| Build tool | Vite | 5.3+ |
| Estilo | Tailwind CSS | 3.4+ |
| Componentes UI | shadcn/ui + Radix UI | latest |
| Estado local | Zustand | 4.5+ |
| Remote state | TanStack Query (React Query) | 5.x |
| Forms | React Hook Form + Zod | latest |
| Animações | Framer Motion | 11+ |
| Ícones | Lucide React | 0.400+ |
| Data fetching | Firebase Web SDK | 10.13+ |
| Lint | ESLint + @typescript-eslint | latest |
| Format | Prettier | 3.3+ |
| Testes | Vitest + Testing Library | latest |
| E2E | Playwright | 1.45+ |
| i18n | i18next + react-i18next | latest |

## Alternativas consideradas

### Next.js
- **Prós:** SSR, file-based routing
- **Contra:** SSR não é necessário (widget é CSR), bundle inicial maior, complexidade extra
- **Decisão:** rejeitado — overkill

### Svelte / SvelteKit
- **Prós:** bundle menor, performance excelente
- **Contra:** ecossistema menor, menos familiar para a equipe, curva de aprendizado
- **Decisão:** rejeitado — ecossistema React mais maduro

### Vue
- **Prós:** excelente DX, performance boa
- **Contra:** menos familiar, menos compatível com Firebase
- **Decisão:** rejeitado — consistência com resto do ecossistema

### CSS-in-JS (styled-components, Emotion)
- **Prós:** escopo automático
- **Contra:** runtime overhead, mais lento
- **Decisão:** rejeitado — Tailwind + CSS variables mais eficiente

## Consequências

### Positivas
- TypeScript previne bugs em runtime
- Vite é absurdamente mais rápido que CRA
- Tailwind permite prototipação rápida
- shadcn/ui dá componentes acessíveis prontos (Radix base)
- React Query simplifica sincronização com Firestore
- Zustand é leve (~1KB) e sem boilerplate

### Negativas
- shadcn/ui não é um "pacote" — exige copiar/colar código
- TanStack Query adiciona complexidade (vale a pena)
- Vite ainda jovem comparado a webpack (mas maduro o suficiente)

### Mitigações
- shadcn/ui: versionar componentes em `components/ui/`
- TanStack Query: treinar equipe nos conceitos
- Vite: monitorar issues, ter plano B (Next.js)
