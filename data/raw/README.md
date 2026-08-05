# Material do CAOCIPP

Esta pasta contém o material institucional do CAOCIPP que alimenta o agente "Cofrito".

## Estrutura

```
raw/
├── atos-normativos/    # Provimentos, OS, Recomendações
├── teses/              # Teses compiladas pelo CAOCIPP
├── legislacao/        # Leis, CF, códigos
├── doutrina/          # Artigos, livros
├── templates/         # Modelos de peças
├── faq/               # Perguntas frequentes
└── jurisprudencia/    # (futuro) Acórdãos
```

## Como adicionar

1. Coloque o arquivo `.md` na pasta apropriada
2. Adicione frontmatter no topo (veja `docs/11-INGESTAO.md`)
3. Rode `npm run ingest` ou abra PR

## Critérios de qualidade

- Texto limpo, sem cabeçalhos repetidos
- Metadados corretos
- Granularidade por artigo/seção
- Sem dados pessoais

Ver `docs/11-INGESTAO.md` para detalhes.
