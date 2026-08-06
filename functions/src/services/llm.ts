/**
 * LLM service — stub.
 *
 * A integração com a LLM (Google Generative AI) foi deliberadamente
 * desativada neste deploy (decisão de 2026-08). Quando for reativada:
 *  - descomentar o bloco abaixo
 *  - reativar a leitura de API key
 *  - recolocar a string do model name
 *
 * O stub retorna uma resposta amigável explicando que a LLM ainda não
 * está habilitada, mantendo o restante do fluxo (sources, tokens) funcional.
 */

import type { RetrievedChunk } from './retrieval'
import { SYSTEM_PROMPT } from '../prompts/system'

export interface GenerateAnswerInput {
  userMessage: string
  history: Array<{ role: 'user' | 'assistant'; content: string }>
  chunks: RetrievedChunk[]
  profile: { displayName: string; inferredAreas: string[] }
  apiKey: string
}

export interface GenerateAnswerOutput {
  content: string
  sources: Array<{ docId: string; chunkId: string; section: string; title: string; relevance: number }>
  tokensUsed: { input: number; output: number; total: number }
}

export async function generateAnswer(input: GenerateAnswerInput): Promise<GenerateAnswerOutput> {
  const { chunks, apiKey } = input

  // Sem API key → resposta amigável (modo stub)
  if (!apiKey) {
    return {
      content:
        '⚠️ O serviço de geração de respostas (LLM) ainda não está configurado neste ambiente. ' +
        'A estrutura do agente está no ar, mas a LLM precisa ser habilitada pelo administrador. ' +
        'Enquanto isso, você pode navegar pelo material do CAOCIPP nos documentos abaixo ou abrir uma consulta formal.\n\n' +
        `System prompt ativo: ${SYSTEM_PROMPT ? 'sim' : 'não'}.`,
      sources: chunks.map((c) => ({
        docId: c.docId,
        chunkId: c.id,
        section: c.section,
        title: c.section || c.docId,
        relevance: c.similarity,
      })),
      tokensUsed: { input: 0, output: 0, total: 0 },
    }
  }

  // Modo LLM real — não implementado neste deploy.
  return {
    content:
      '⚠️ LLM key presente, mas o serviço de geração está em modo stub neste deploy. ' +
      'Reative a integração no código (ver comentário no topo deste arquivo).',
    sources: [],
    tokensUsed: { input: 0, output: 0, total: 0 },
  }
}
