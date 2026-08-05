# ADR-0006: Estratégia de Guardrails

- **Status:** Aceito
- **Data:** 2026-08-05
- **Decisor(es):** Equipe técnica + Assessoria CAOCIPP
- **Contexto:** Como garantir que o Cofrito responda **apenas** dentro do escopo e com qualidade

## Contexto

O Cofrito precisa:
- Recusar perguntas fora do escopo (clima, futebol, etc.)
- Recusar análise de caso concreto (acervo fático-probatório)
- Não inventar leis, artigos, julgados
- Sempre citar fonte
- Manter tom e linguagem consistentes

**Ameaças principais:**
- Alucinação (LLM inventa informação)
- Scope creep (LLM responde o que não deve)
- Jailbreak (usuário tenta burlar limites)
- Drift (qualidade piora ao longo do tempo)

## Decisão

Adotamos **guardrails em múltiplas camadas**, com **defense in depth**.

## Camadas

### Camada 1 — Input filtering (antes do LLM)

```typescript
// services/guardrails.ts

// 1.1. Detecção de off-topic (regex)
const OFF_TOPIC_PATTERNS = [
  /clima|tempo|previsão/i,
  /futebol|jogo|campeonato/i,
  /receita|culinária|cozinhar/i,
  // ...
];

// 1.2. Detecção de jailbreak
const JAILBREAK_PATTERNS = [
  /ignore (previous|all) instructions/i,
  /act as (a|an) /i,
  /forget you (are|were) /i,
  /pretend (to be|you are) /i,
];

// 1.3. Detecção de caso concreto
const CASE_ANALYSIS_PATTERNS = [
  /no meu caso|no caso concreto|na minha ação|na minha apuração/i,
  /parte|autuado|investigado|denunciado|réu|autor/i,
];
```

Ação: se detectado, retorna recusa educada **sem chamar o LLM**.

### Camada 2 — Retrieval filtering

```typescript
// Se maxSimilarity < 0.55  →  recusa (no-results)
// Se área não relacionada ao CAOCIPP  →  recusa
// Se tipo de doc não bate com intent  →  recusa
```

### Camada 3 — System prompt (no LLM)

```typescript
const SYSTEM_PROMPT = `
Você é o Cofrito, assistente do CAOCIPP.
ESCOPO: atue APENAS sobre [lista de tópicos].
REGRAS:
1. NUNCA invente leis, artigos, julgados.
2. CITE a fonte de toda afirmação.
3. RECUSE análise de caso concreto.
4. Use 3ª pessoa.
5. Se não souber, diga "não encontrei material no acervo".
`;
```

### Camada 4 — Output validation (depois do LLM)

```typescript
// 4.1. Verificar se resposta tem citação
if (!responseHasSource(response)) {
  // Regenera com prompt mais restritivo
  return await regenerateWithStricterPrompt(query, history);
}

// 4.2. Verificar se resposta contém "como IA" / "como modelo"
if (containsAIReference(response)) {
  // Substitui por texto padrão
  return sanitize(response);
}

// 4.3. Verificar se resposta aludiu a algo não-citado
if (hasUncitedClaims(response, sources)) {
  // Adiciona disclaimer
  return addDisclaimer(response);
}
```

### Camada 5 — Golden set evaluation (offline)

Toda release roda o **golden set** (50 perguntas com gabarito) e mede:

- **% cita fonte correta** (target: ≥ 95%)
- **% recusa off-topic** (target: ≥ 95%)
- **% recusa caso concreto** (target: ≥ 95%)
- **% alucina** (target: ≤ 2%)
- **% tom adequado** (target: ≥ 90%)

Se algum indicador cair, prompt é ajustado e versão só sobe após validação.

## Recusas pre-definidas

### Recusa 1 — Off-topic

```
Desculpe, "[tema]" está fora do escopo deste assistente,
que é dedicado exclusivamente ao material do CAOCIPP.

Posso ajudá-lo(a) com temas como direito administrativo,
constitucional, improbidade, patrimônio público, ou
procedimentos do MP.
```

### Recusa 2 — Caso concreto

```
Este assistente não analisa casos concretos — o exame do
acervo fático-probatório é de responsabilidade do órgão
de execução (Ordem de Serviço nº 002/2015, art. 2º, IX).

Posso ajudá-lo(a) a:
- Localizar material institucional sobre a tese jurídica aplicável
- Abrir uma consulta formal ao CAOCIPP para análise específica
```

### Recusa 3 — No-results

```
Não encontrei material específico sobre "[tema]" no acervo
do CAOCIPP que possa responder com segurança.

Posso orientá-lo(a) na abertura de uma consulta formal
ao CAOCIPP?
```

## Configuração de safety no Gemini

```typescript
const model = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
  safetySettings: [
    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_LOW_AND_ABOVE' },
    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_LOW_AND_ABOVE' },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_LOW_AND_ABOVE' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_LOW_AND_ABOVE' },
  ],
});
```

## Monitoramento contínuo

- **Amostragem semanal:** 20 respostas aleatórias avaliadas por humano
- **Alerta:** se taxa de recusa < 80% (suspeita de scope creep) ou > 60% (suspeita de over-blocking)
- **Feedback do usuário:** 👍/👎 com comentário opcional
- **Auditoria mensal:** amostra maior (50 respostas) com avaliação por 2 revisores

## Consequências

### Positivas
- Múltiplas camadas protegem contra falhas isoladas
- Golden set detecta regressões antes de chegar ao usuário
- Usuário recebe recusa educada (não vê "erro")
- Conformidade com OS 002/2015 e LGPD

### Negativas
- Falsos positivos (rejeitar o que deveria aceitar) podem frustrar usuário
- Ajustes finos no prompt exigem iteração
- Golden set precisa ser mantido atualizado

### Mitigações
- "Amostra semanal" detecta over-blocking
- Botão "Não foi isso? Tente reformular" em caso de no-results
- Botão "Abrir consulta formal" em todos os cenários de recusa
- Revisão mensal do golden set
