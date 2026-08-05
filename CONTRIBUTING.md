# Contribuindo com o Cofrito

Obrigado por contribuir! Este documento explica como.

## Código de Conduta

Esperamos que todos os contribuidores sigam nosso [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Respeito mútuo é inegociável.

## Como contribuir

### 1. Issues

- **Bug:** use o template "Bug Report"
- **Feature:** use o template "Feature Request"
- **Dúvida:** use Discussions (GitHub)
- **Segurança:** **NÃO abra issue pública** — siga [SECURITY.md](SECURITY.md)

### 2. Pull Requests

#### Workflow

```
main (produção, protegido)
  ↑
develop (staging, protegido)
  ↑
feature/xyz  ←  você cria daqui
```

#### Antes de abrir PR

1. Branch a partir de `develop`: `git checkout -b feature/nome-descritivo`
2. Siga as convenções de código (ESLint + Prettier — `npm run lint` deve passar)
3. Adicione testes para código novo
4. Atualize documentação se necessário
5. Garanta que `npm test` e `npm run build` passam localmente
6. Commits com mensagens descritivas (Conventional Commits preferido)

#### Mensagens de commit (Conventional Commits)

```
feat(widget): adicionar estado "thinking" no avatar
fix(retrieval): corrigir threshold de similaridade
docs(readme): atualizar instruções de instalação
chore(deps): bump firebase-admin para 12.4.0
test(chat): adicionar golden set com 20 perguntas
refactor(services): extrair lógica de PII para módulo separado
```

#### Template de PR

Use o template `.github/PULL_REQUEST_TEMPLATE.md` e preencha todos os campos.

#### Revisão

- Pelo menos 1 aprovação de code owner (ver `.github/CODEOWNERS`)
- CI deve estar verde (lint, test, build)
- Mudanças em LGPD, segurança ou production rules → 2 aprovações
- Documentação revisada se afetar docs/

### 3. Adicionar material ao corpus

Veja [`docs/11-INGESTAO.md`](docs/11-INGESTAO.md).

Resumo:
1. Coloque o arquivo `.md` em `data/raw/` com frontmatter
2. Rode `npm run ingest` (local) ou abra PR
3. CI valida automaticamente
4. Após merge em main, Cloud Function `onRawMaterialChange` re-inge (v2)

### 4. Reportar vulnerabilidades

**NÃO abra issue pública.** Veja [SECURITY.md](SECURITY.md).

## Padrões de código

### TypeScript

- `strict: true` em todos os workspaces
- Evite `any` — use `unknown` + type guard
- Prefira `interface` para objetos, `type` para unions
- Comente apenas o "porquê", não o "o quê"

### React

- Componentes funcionais + hooks
- Props tipadas com interface
- Evite prop drilling — use Zustand ou Context
- Listas com `key` estável
- `useMemo`/`useCallback` apenas quando medido que ajuda

### Naming

- Componentes: `PascalCase`
- Hooks: `useCamelCase`
- Utils: `camelCase`
- Constants: `UPPER_SNAKE_CASE`
- Types/Interfaces: `PascalCase`
- Files: `kebab-case.ts` (exceto componentes React: `PascalCase.tsx`)

### Commits

- Mensagens em português ou inglês (consistência)
- Presente do indicativo: "adiciona feature" não "adicionado"
- Máximo 72 chars no título

## Setup local

Ver [`docs/01-INSTALACAO.md`](docs/01-INSTALACAO.md).

## Dúvidas?

Abra uma Discussion no GitHub.

Obrigado por contribuir! 🎉
