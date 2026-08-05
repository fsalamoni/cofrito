# ADR-0003: Vector Search — Firestore Nativo (v1) vs Vertex AI (v2)

- **Status:** Aceito
- **Data:** 2026-08-05
- **Decisor(es):** Equipe técnica
- **Contexto:** Escolha do mecanismo de busca vetorial

## Contexto

O Cofrito precisa buscar chunks relevantes no corpus do CAOCIPP via similaridade semântica (embeddings).

Requisitos:
- Vetores de 768 dimensões (Gemini text-embedding-004)
- Latência < 500ms
- Filtros por metadata (tipo, área, status)
- Custo razoável
- Integração nativa com Firestore (sem manter 2 bancos)

## Decisão

Adotamos **Firestore Vector Search nativo** como solução v1, com plano de migração para **Vertex AI Vector Search** quando algum limite for atingido.

## Comparação

| Critério | Firestore Vector Search | Vertex AI Vector Search |
|---|---|---|
| Setup | Nativo, sem config extra | Requer criar index, IAM, sync |
| Latência | ~200ms p50 | ~50ms p50 |
| Custo | $0.06/GB/mês | ~$0.10/GB/mês + index update |
| Limite de vetores | até ~10k por query, 1M total | ilimitado |
| Filtros | WHERE clauses padrão | filter clauses separadas |
| Backup | incluso no Firestore | precisa configurar |
| Quando usar | até 50k chunks, queries simples | > 50k chunks, latência crítica |

## Alternativas consideradas

### Pinecone / Weaviate / ChromaDB
- **Prós:** Especializados, performance excelente
- **Contra:** Mais um serviço para gerenciar, billing separado, sincronização com Firestore
- **Decisão:** rejeitado — Firestore nativo suficiente para v1

### BigQuery com embeddings
- **Prós:** Já temos dados aqui eventualmente
- **Contra:** Latência maior (~1s), setup mais complexo
- **Decisão:** rejeitado — overhead desnecessário

### Busca apenas por keywords (sem embeddings)
- **Prós:** Mais simples, mais barato
- **Contra:** Não captura semântica, baixa cobertura
- **Decisão:** rejeitado — qualidade do RAG seria comprometida

## Consequências

### Positivas (Firestore nativo)
- Sem peça extra
- Regras de segurança já configuradas
- Backup incluso
- Custo previsível
- Migrar para Vertex AI é direto (mesmo SDK)

### Negativas
- Limitado a ~10k vetores por query (suficiente para nosso caso)
- Menos otimizado que Vertex AI para latência

### Plano de migração para Vertex AI

Quando **alguma** destas condições for atingida:
- [ ] Mais de 50.000 chunks no corpus
- [ ] Latência p95 > 500ms sustentada
- [ ] Necessidade de filtros complexos por metadata

Migração:
1. Criar index no Vertex AI Vector Search
2. Configurar Cloud Function de sync (Firestore → Vertex)
3. Atualizar `services/retrieval.ts` para usar Vertex SDK
4. Manter Firestore como source of truth
5. Testar em staging
6. Deploy em prod com feature flag

## Métricas a monitorar

- Latência p50/p95 de retrieval
- # de vetores indexados
- Custo mensal
- Recall@k vs. golden set
