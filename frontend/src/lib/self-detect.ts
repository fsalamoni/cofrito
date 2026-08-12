/**
 * Detector de perguntas sobre o próprio agente (fast-path do client).
 *
 * Inspirado no padrão Lexio: detecta no FRONTEND antes de chamar a function,
 * respondendo IMEDIATAMENTE sem latência, sem chamada de rede, sem custo de LLM.
 *
 * Espelha o self-detect.ts do backend (functions/src/agents/self-detect.ts)
 * para garantir paridade. Se o cliente detectar, responde direto.
 * Se nao detectar, chama a function (que tem o fast-path como safety net).
 */

const IDENTITY_RESPONSE = `Sou o **Cofrito**, um agente de inteligência artificial criado no âmbito do **CAOCIPP** (Centro de Apoio Operacional Cível e do Patrimônio Público) do **Ministério Público do Estado do Rio Grande do Sul**.

**Minha função:** auxiliar Promotores de Justiça, servidores e demais usuários autorizados a localizar e compreender o material institucional do CAOCIPP — atos normativos, teses, modelos de parecer, legislação e doutrina — e a formular consultas formais quando o material disponível não for suficiente.

**O que eu faço:**
- Busco no acervo do CAOCIPP atos normativos, teses, modelos e FAQ
- Identifico legislação federal/estadual sobre matérias cíveis e patrimônio público
- Abro uma consulta formal ao CAOCIPP, se preferir análise humana

**O que eu NÃO faço (limites importantes):**
- NÃO emito pareceres jurídicos novos: as manifestações do CAOCIPP são feitas por Promotores de Justiça (Ordem de Serviço nº 002/2015, art. 2º, IV)
- NÃO analiso casos concretos — apenas identifico e transcrevo material do acervo
- NÃO substituo a análise humana do Promotor de Justiça

**Quem me desenvolveu:** coordenação do CAOCIPP, com implementação técnica da TI do MPRS a partir de 2026.

**Como funciona tecnicamente:**
- Aplicação web em cofrito.web.app, hospedada no Firebase (Functions Gen 2 + Firestore)
- Multi-agente: orquestrador planeja, pesquisadores internos/externos buscam, compilador organiza, redator jurídico formata, crítico avalia
- Acervo indexado em 3 camadas: filtro por palavras-chave, similaridade por embeddings, rerank semântico (só se ambíguo)
- Você pode acompanhar o raciocínio em tempo real pela timeline do chat

**Em que posso ajudar agora?**`

const IDENTITY_SHORT = `Sou o **Cofrito**, agente de IA do **CAOCIPP/MPRS**, criado para ajudar Promotores e servidores a localizar material no acervo do Centro de Apoio e a formular consultas formais. Em que posso ajudar?`

const SELF_PATTERNS: RegExp[] = [
  /\bquem\s+(?:e|voce|vc|o\s+cofrito|esse\s+agente|este\s+agente)\b/i,
  /\bvoce\s+e\b/i,
  /\bvc\s+e\b/i,
  /\bo\s+que\s+(?:e|voce|vc|faz|significa)\b/i,
  /\bo\s+que\s+vc\s+faz\b/i,
  /\bo\s+q\s+(?:e|voce|vc|faz|significa)\b/i,
  /\bo\s+q\s+vc\s+faz\b/i,
  /\bcomo\s+(?:funciona|voce\s+funciona|vc\s+funciona|trabalha)\b/i,
  /\bquem\s+(?:te|criou|fez|desenvolveu|construiu|programou)\b/i,
  /\bquem\s+criou\s+(?:o|este|esse|voce|vc|cofrito)\b/i,
  /\bpara\s+que\s+(?:serve|voce\s+serve|vc\s+serve)\b/i,
  /\bo\s+que\s+(?:posso|faz)\s+(?:fazer|perguntar)\b/i,
  /\bquais\s+(?:suas|as\s+suas)\s+(?:funcoes|habilidades|funcionalidades|capacidades)\b/i,
  /\bme\s+(?:fale|conte|diga|explique)\s+(?:sobre|voce|vc|o\s+cofrito)\b/i,
  /\bfale\s+(?:sobre|voce|vc|o\s+cofrito)\b/i,
  /\bsobre\s+(?:voce|vc|o\s+cofrito|este\s+assistente|esse\s+assistente)\b/i,
  /\bme\s+ajud[ae]?\b/i,
  /\bposso\s+te\s+(?:conhecer|ajudar|perguntar)\b/i,
  /\bqual\s+e\s+(?:seu|o\s+seu)\s+(?:nome|papel|objetivo|proposito)\b/i,
  /\bvoce\s+(?:e|pode|fala|consegue|sabe|faz)\b/i,
  /\bcofrito\b/i,
]

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

export function isAboutItselfClient(question: string): boolean {
  if (!question) return false
  const q = question.trim()
  if (q.length > 200) return false
  const normalized = normalize(q)
  for (const re of SELF_PATTERNS) {
    if (re.test(normalized)) return true
  }
  return false
}

export function getIdentityResponseClient(short = false): string {
  return short ? IDENTITY_SHORT : IDENTITY_RESPONSE
}
