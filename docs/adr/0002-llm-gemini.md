# ADR-0002: LLM Gemini (Flash + Pro)

- **Status:** Aceito
- **Data:** 2026-08-05
- **Decisor(es):** Equipe técnica + Coordenação CAOCIPP
- **Contexto:** Escolha do modelo de linguagem

## Contexto

Precisamos de um LLM que:
- Seja excelente em **português brasileiro jurídico**
- Tenha **custo baixo** (uso institucional, pode ter muitos usuários)
- Seja **rápido** (latência percebida < 3s)
- Tenha **contexto grande** (1M+ tokens, para caber histórico + RAG)
- Suporte **embeddings** no mesmo vendor
- Esteja disponível no **GCP** (já usamos Firebase)

## Decisão

Adotamos o **Gemini 2.5 Flash** como LLM principal, com **Gemini 2.5 Pro** para respostas longas/complexas.

Embeddings: **text-embedding-004** (768 dims, multilíngue).

## Alternativas consideradas

### OpenAI GPT-4 / GPT-4o
- **Prós:** Excelente qualidade, ecossistema maduro
- **Contra:** 3-5x mais caro, fora do GCP, lock-in separado
- **Decisão:** rejeitado — custo é o fator decisivo

### Anthropic Claude
- **Prós:** Excelente em raciocínio, baixa alucinação
- **Contra:** Mais caro que Gemini Pro, fora do GCP
- **Decisão:** rejeitado — pode ser reconsiderado se Gemini decepcionar

### Open source (Llama 3, Mistral)
- **Prós:** Sem custo por token, controle total
- **Contra:** Requer hospedagem própria, qualidade inferior em PT-BR
- **Decisão:** rejeitado — complexidade operacional vs. economia marginal

### Vertex AI Model Garden
- **Prós:** Acesso a vários modelos (Claude, Llama) sob contrato GCP
- **Contra:** Mais caro, contratos separados
- **Decisão:** adiar — considerar se Gemini decepcionar

## Consequências

### Positivas
- Custo: ~$0.15 por 1000 perguntas (Flash) — acessível
- Latência: < 1.5s p50 com Flash
- Contexto: 1M tokens (Flash) — espaço de sobra
- PT-BR: excelente
- Free tier generoso: 15 RPM, 1M tokens/dia
- Mesmo vendor para embeddings (consistência, billing único)

### Negativas
- Vendor lock-in no Google
- Qualidade pode variar por versão (mitigada por golden set)
- Mudanças de preço imprevisíveis

### Mitigações
- Adapter pattern em `services/llm.ts` para trocar de provider se necessário
- Golden set avaliado a cada release
- Monitoramento de custo diário
- Alertas em caso de regressão de qualidade

## Estimativa de custo

| Cenário | Perguntas/mês | Custo Gemini | Custo embeddings | Total |
|---|---|---|---|---|
| Piloto (50 usuários) | 500 | ~$0.08 | ~$0.10 | **~$0.18** |
| Pequeno (500 usuários) | 5.000 | ~$0.75 | ~$0.10 | **~$0.85** |
| Médio (2.000 usuários) | 20.000 | ~$3.00 | ~$0.20 | **~$3.20** |
| Grande (10.000 usuários) | 100.000 | ~$15.00 | ~$0.50 | **~$15.50** |

(Assumindo prompt médio: 600 input + 200 output tokens, 3 chunks no contexto.)
