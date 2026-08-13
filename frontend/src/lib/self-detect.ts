/**
 * Detector de intenção + respostas rápidas para o Cofrito (fast-path do client).
 *
 * Inspirado no padrão Lexio: detecta no FRONTEND antes de chamar a function,
 * categorizando a pergunta em:
 *  - IDENTITY: "quem é você", "o que é o Cofrito" → resposta canônica completa
 *  - CAPABILITIES: "quais suas funções", "o que pode fazer" → lista de capacidades
 *  - HOW_IT_WORKS: "como funciona", "como você busca" → explicação técnica breve
 *  - HOW_TO_USE: "como faço para X", "como usar" → instruções de uso
 *  - SOCIAL: "oi", "obrigado", "tudo bem" → resposta social curta
 *  - NOT_ABOUT: pergunta sobre conteúdo → vai pro backend (pipeline)
 *
 * Cada categoria tem resposta NATURAL (não apenas copy-paste do IDENTITY).
 */

// ─── Respostas por categoria ─────────────────────────────────────────────

const RESPONSE_IDENTITY = `Sou o **Cofrito**, um agente de inteligência artificial criado no âmbito do **CAOCIPP** (Centro de Apoio Operacional Cível e do Patrimônio Público) do **Ministério Público do Estado do Rio Grande do Sul**.

Fui desenvolvido sob a coordenação do CAOCIPP, com implementação técnica da equipe de TI do MPRS, para auxiliar Promotores de Justiça, servidores e demais usuários autorizados a pesquisar no acervo institucional do Centro de Apoio.

Em que posso ajudar?`

const RESPONSE_CAPABILITIES = `Posso te ajudar com bastante coisa dentro do meu escopo:

- **Buscar no acervo do CAOCIPP**: atos normativos (Provimentos, Ordens de Serviço, Recomendações), teses, modelos de parecer, FAQ, legislação correlata
- **Identificar legislação** federal e estadual sobre matérias cíveis e patrimônio público
- **Resumir e organizar** documentos do acervo, apontando os trechos relevantes
- **Indicar se há material** sobre determinado tema — e quando não há, sugerir caminhos
- **Abrir uma consulta formal** ao CAOCIPP, se você preferir análise por um Promotor de Justiça
- **Conversar sobre o que faço e como faço** — perguntas sobre mim mesmo

O que **não** faço: pareceres jurídicos novos (as manifestações do CAOCIPP são feitas por Promotores, conforme OS nº 002/2015) nem análise de casos concretos. Sou uma ferramenta de localização e orientação, não de produção de conteúdo jurídico original.

Quer começar pelo acervo ou prefere explorar algo específico?`

const RESPONSE_HOW_IT_WORKS = `Tecnicamente, eu rodo como uma aplicação web multi-agente:

1. **Orquestrador** analisa sua pergunta e define o plano de pesquisa
2. **Pesquisadores** buscam fontes — um vasculha o acervo do CAOCIPP, outro (opcional) consulta a web
3. **Compilador** organiza tudo o que foi encontrado por ponto de pesquisa
4. **Redator jurídico** monta a resposta em markdown, citando as fontes
5. **Crítico** avalia a qualidade e pede refinamento se necessário

O acervo é indexado em 3 camadas: filtro por palavras-chave estruturadas, similaridade por embeddings, e rerank semântico com LLM (só quando há ambiguidade). Cada documento novo passa por análise automática — classificador, ementa e pontos relevantes.

Você acompanha tudo isso em tempo real na timeline que aparece no chat durante o processamento.

Tem alguma curiosidade mais específica?`

const RESPONSE_HOW_TO_USE = `Tranquilo, é simples. Algumas dicas práticas:

- **Pergunte direto**: "Quais teses do CAOCIPP sobre improbidade administrativa?" funciona melhor que "improbidade"
- **Use palavras-chave** do seu domínio: se você sabe que está procurando um "Provimento" ou uma "Recomendação", mencione
- **Toggles no chat**:
  - **Apenas acervo** (recomendado) — só busca no corpus do CAOCIPP
  - **+ Web externa** — complementa com fontes públicas
  - **Análise jurídica** — ativa o redator jurídico para pareceres formatados
  - **Rápido / padrão / profundo** — controla quantas iterações o pipeline faz
- **Quando eu não achar**, eu te falo abertamente. Não invento. Posso sugerir abrir uma consulta formal
- **Você pode pedir feedback** em qualquer resposta (👍 / 👎) — isso me ajuda a melhorar

Quer experimentar? Faz uma pergunta sobre o acervo ou sobre o CAOCIPP que eu te mostro como funciona.`

const RESPONSE_SOCIAL_GREETING = `Olá! Tudo bem? Sou o Cofrito, assistente do CAOCIPP/MPRS.

Posso te ajudar com pesquisas no acervo do Centro de Apoio, dúvidas sobre atos normativos, ou abrir uma consulta formal. É só me dizer o que você precisa.`

const RESPONSE_SOCIAL_THANKS = `Por nada! Se precisar de mais alguma coisa — busca no acervo, identificação de legislação, ou abrir uma consulta formal — é só chamar.`

const RESPONSE_SOCIAL_BYE = `Até logo! Se precisar de ajuda com o acervo do CAOCIPP, é só voltar. Bom trabalho!`

// ─── Detectores por categoria ─────────────────────────────────────────────

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[áàãâä]/g, 'a')
    .replace(/[éèêë]/g, 'e')
    .replace(/[íìîï]/g, 'i')
    .replace(/[óòõôö]/g, 'o')
    .replace(/[úùûü]/g, 'u')
    .replace(/ç/g, 'c')
}

const IDENTITY_PATTERNS: RegExp[] = [
  /\bquem\s+(?:e|voce|vc|o\s+cofrito|esse\s+agente|este\s+agente)\b/i,
  /\bvoce\s+e\b/i,
  /\bvc\s+e\b/i,
  /\bo\s+que\s+(?:e|voce|vc|significa)\b/i,
  /\bo\s+q\s+(?:e|voce|vc|significa)\b/i,
  /\bo\s+que\s+e\s+o\s+cofrito\b/i,
  /\bo\s+cofrito\s+e\b/i,
  /\bquem\s+criou\s+(?:o|este|esse|voce|vc|cofrito)\b/i,
  /\bquem\s+(?:te|desenvolveu|construiu|programou|fez)\b/i,
  /\bpara\s+que\s+(?:serve|voce\s+serve|vc\s+serve)\s+(?:voce|vc|isso|a\s+ia)\b/i,
  /\bqual\s+e\s+(?:seu|o\s+seu)\s+(?:nome|papel|objetivo|proposito)\b/i,
  /\bme\s+(?:fale|conte|diga|explique)\s+sobre\s+(?:voce|vc|o\s+cofrito)\b/i,
  /\bfale\s+(?:sobre|um\s+pouco\s+de)\s+(?:voce|vc|o\s+cofrito)\b/i,
  /\bsobre\s+(?:voce|vc|o\s+cofrito|este\s+assistente|esse\s+assistente)\b/i,
  /\bvoce\s+e\s+(?:humano|humana|pessoa|real)\b/i,
]

const CAPABILITY_PATTERNS: RegExp[] = [
  /\bquais?\s+(?:sao\s+)?(?:as\s+suas|suas|tuas)\s+(?:principais\s+)?(?:funcoes|habilidades|funcionalidades|capacidades|tarefas)\b/i,
  /\bo\s+que\s+(?:voce|vc)\s+(?:faz|sabe|pode\s+fazer|consegu[eia]\s+fazer|faz\s+de\s+util)\b/i,
  /\bo\s+q\s+(?:voce|vc)\s+(?:faz|sabe|pode\s+fazer|consegu[eia])\b/i,
  /\bo\s+q\s+vc\s+faz\b/i,
  /\bo\s+que\s+(?:voce|vc)\s+sabe\s+fazer\b/i,
  /\bquais?\s+(?:sao\s+)?(?:as\s+)?(?:coisas|atividades)\s+(?:que\s+)?(?:voce|vc)\s+(?:faz|pode\s+fazer|sabe)\b/i,
  /\b(?:voce|vc)\s+(?:faz|sabe|pode)\s+(?:o\s+que|quais\s+coisas)\b/i,
  /\b(?:voce|vc)\s+(?:consegue|pode|sabe)\s+(?:me\s+)?(?:ajudar|auxiliar|auxiliar-me)\b/i,
  /\bcomo\s+(?:voce|vc)\s+pode\s+me\s+ajudar\b/i,
  /\b(?:em\s+que|como)\s+(?:voce|vc)\s+pode\s+me\s+ajudar\b/i,
  /\bquais\s+(?:sao\s+)?(?:as\s+)?suas\s+habilidades\b/i,
  /\bde\s+que\s+(?:voce|vc)\s+e\s+capaz\b/i,
  /\bpara\s+que\s+(?:voce|vc)\s+sirve\b/i,
  /\bserve\s+para\s+que\b/i,
  /\bquais\s+temas\s+(?:voce|vc)\s+(?:cobre|aborda|atende)\b/i,
  /\bque\s+tipo\s+de\s+(?:perguntas|duvidas)\s+(?:voce|vc)\s+(?:responde|aceita|entende)\b/i,
]

const HOW_IT_WORKS_PATTERNS: RegExp[] = [
  /\bcomo\s+(?:voce|vc)\s+funciona\b/i,
  /\bcomo\s+(?:e\s+que\s+)?(?:voce|vc)\s+(?:funciona|trabalha|opera|pesquisa)\b/i,
  /\bcomo\s+(?:e\s+que\s+)?funciona\b/i,
  /\bme\s+(?:explica|explica\s+como)\s+(?:funciona|trabalha)\b/i,
  /\bcomo\s+(?:e\s+feita|e\s+realizada|e\s+feita\s+a)\s+(?:busca|pesquisa|analise)\b/i,
  /\btecnicamente\s+(?:como|o\s+que)\b/i,
  /\bcomo\s+(?:voce|vc)\s+(?:busca|pesquisa|encontra)\b/i,
  /\bqual\s+e\s+(?:a\s+)?(?:tecnologia|arquitetura|stack)\b/i,
  /\bcomo\s+(?:voce|vc)\s+(?:foi\s+)?(?:treinado|construido|desenvolvido)\b/i,
]

const HOW_TO_USE_PATTERNS: RegExp[] = [
  /\bcomo\s+(?:eu\s+)?(?:faco|uso|utilizo|devo)\s+(?:para\s+)?(?:usar|utilizar|pesquisar|buscar|abrir|fazer)\b/i,
  /\bcomo\s+(?:usar|utilizar|funciona)\s+(?:o\s+)?(?:cofrito|chat|sistema)\b/i,
  /\bcomo\s+(?:eu\s+)?uso\s+(?:o\s+)?(?:cofrito|chat)\b/i,
  /\b(?:tutorial|instrucoes|dicas|ajuda)\b/i,
  /\bcomo\s+(?:eu\s+)?faco\s+uma\s+pesquisa\b/i,
  /\bcomo\s+(?:eu\s+)?abro\s+(?:uma\s+)?consulta\b/i,
  /\bcomo\s+funciona\s+a\s+pesquisa\b/i,
  /\bcomo\s+(?:eu\s+)?posso\s+pesquisar\b/i,
  /\bcomo\s+(?:eu\s+)?posso\s+buscar\b/i,
  /\b(?:pode|podes|consegue|poderia)\s+me\s+(?:ajudar|ensinar|explicar)\b/i,
]

const SOCIAL_GREETING_PATTERNS: RegExp[] = [
  /^\s*(?:oi|ola|hello|hi|hey|bom\s+dia|boa\s+tarde|boa\s+noite|td\s+bem|tudo\s+bem|e\s+a|e\s+aí|eaí)\s*[!.?]*\s*$/i,
]

const SOCIAL_THANKS_PATTERNS: RegExp[] = [
  /^\s*(?:obrigad[oa]|valeu|thanks|vlw|brigado|brigada)\s*[!.?]*\s*$/i,
  /^\s*(?:muito\s+obrigad[oa]|mt\s+obrigad[oa])\s*[!.?]*\s*$/i,
]

const SOCIAL_BYE_PATTERNS: RegExp[] = [
  /^\s*(?:tchau|adeus|ate\s+(?:logo|mais|depois)|fui|bye|flw|falous|fala\s+galera)\s*[!.?]*\s*$/i,
]

// ─── Tipos de intenção ────────────────────────────────────────────────────

export type Intent =
  | 'identity'
  | 'capabilities'
  | 'how_it_works'
  | 'how_to_use'
  | 'social_greeting'
  | 'social_thanks'
  | 'social_bye'

export interface QuickReply {
  intent: Intent
  reply: string
}

function matchesAny(patterns: RegExp[], text: string): boolean {
  for (const re of patterns) {
    if (re.test(text)) return true
  }
  return false
}

/**
 * Detecta intenção e retorna resposta rápida se for sobre o agente ou social.
 * Retorna null se a pergunta deve ir para o backend (pipeline).
 */
export function detectQuickReply(question: string): QuickReply | null {
  if (!question) return null
  const q = question.trim()
  if (q.length > 300) return null  // perguntas longas vão pro pipeline

  const normalized = normalize(q)

  // Ordem importa: social primeiro (mais específico), depois identity, capabilities, etc.
  if (matchesAny(SOCIAL_GREETING_PATTERNS, q)) {
    return { intent: 'social_greeting', reply: RESPONSE_SOCIAL_GREETING }
  }
  if (matchesAny(SOCIAL_THANKS_PATTERNS, q)) {
    return { intent: 'social_thanks', reply: RESPONSE_SOCIAL_THANKS }
  }
  if (matchesAny(SOCIAL_BYE_PATTERNS, q)) {
    return { intent: 'social_bye', reply: RESPONSE_SOCIAL_BYE }
  }
  if (matchesAny(CAPABILITY_PATTERNS, normalized)) {
    return { intent: 'capabilities', reply: RESPONSE_CAPABILITIES }
  }
  if (matchesAny(HOW_TO_USE_PATTERNS, normalized)) {
    return { intent: 'how_to_use', reply: RESPONSE_HOW_TO_USE }
  }
  if (matchesAny(HOW_IT_WORKS_PATTERNS, normalized)) {
    return { intent: 'how_it_works', reply: RESPONSE_HOW_IT_WORKS }
  }
  if (matchesAny(IDENTITY_PATTERNS, normalized)) {
    return { intent: 'identity', reply: RESPONSE_IDENTITY }
  }
  return null
}

/**
 * Mantido para compatibilidade com o backend (paridade).
 * Retorna true se a pergunta é sobre o próprio agente (qualquer categoria acima).
 */
export function isAboutItselfClient(question: string): boolean {
  const result = detectQuickReply(question)
  return result !== null
}

/**
 * Mantido para compatibilidade. Retorna a resposta canônica de identidade.
 */
export function getIdentityResponseClient(short = false): string {
  return short ? RESPONSE_IDENTITY : RESPONSE_IDENTITY
}
