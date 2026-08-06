/**
 * LLM service — wrapper para Gemini.
 *
 * Suporta dois modos:
 *  - **Real**: quando GEMINI_API_KEY está configurada, usa Gemini 2.5 Flash.
 *  - **Stub**: quando não há API key, retorna mensagem amigável mantendo o
 *    restante do fluxo (sources, tokens) funcional. Útil para dev local e
 *    para validar a UI antes de configurar a LLM.
 */

import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai'
import type { RetrievedChunk } from './retrieval'
import { SYSTEM_PROMPT } from '../prompts/system'

export interface GenerateAnswerInput {
  userMessage: string
  history: Array<{ role: 'user' | 'assistant'; content: string }>
  chunks: RetrievedChunk[]
  profile: { displayName: string; inferredAreas: string[] }
  apiKey: string | undefined
}

export interface GenerateAnswerOutput {
  content: string
  sources: Array<{ docId: string; chunkId: string; section: string; title: string; relevance: number }>
  tokensUsed: { input: number; output: number; total: number }
}

const STUB_NO_KEY = (chunks: RetrievedChunk[]) => ({
  content:
    '⚠️ O serviço de geração de respostas (LLM) ainda não está configurado neste ambiente. ' +
    'A estrutura do agente está no ar, mas a LLM precisa ser habilitada pelo administrador. ' +
    'Enquanto isso, você pode navegar pelo material do CAOCIPP nos documentos abaixo ou abrir uma consulta formal.',
  sources: chunks.map((c) => ({
    docId: c.docId,
    chunkId: c.id,
    section: c.section,
    title: c.section || c.docId,
    relevance: c.similarity,
  })),
  tokensUsed: { input: 0, output: 0, total: 0 },
})

export async function generateAnswer(input: GenerateAnswerInput): Promise<GenerateAnswerOutput> {
  const { userMessage, history, chunks, profile, apiKey } = input

  // Modo stub: sem API key
  if (!apiKey) {
    return STUB_NO_KEY(chunks)
  }

  // Modo real: Gemini
  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: {
      temperature: 0.2,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 1024,
    },
    safetySettings: [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE },
    ],
  })

  const chunksText = chunks
    .map(
      (c, i) =>
        `[${i + 1}] (ref:${c.docId}#${c.id}, seção: "${c.section}", similaridade: ${c.similarity.toFixed(2)})\n${c.text}`,
    )
    .join('\n\n---\n\n')

  const historyText = history
    .map((h) => `${h.role === 'user' ? 'Usuário' : 'Assistente'}: ${h.content}`)
    .join('\n')

  const userContent = `
# PERFIL DO USUÁRIO
Nome: ${profile.displayName}
Áreas de interesse: ${profile.inferredAreas.join(', ') || '(nenhuma ainda)'}

# HISTÓRICO RECENTE
${historyText || '(início da conversa)'}

# MATERIAL DO CORPUS
${chunksText}

# PERGUNTA
${userMessage}

Responda de forma direta, cite fontes no formato [ref:docId#chunkId], termine perguntando se foi suficiente.
`.trim()

  try {
    const chat = model.startChat()
    const result = await chat.sendMessage(userContent)
    const response = result.response
    const text = response.text()

    return {
      content: text,
      sources: chunks.map((c) => ({
        docId: c.docId,
        chunkId: c.id,
        section: c.section,
        title: c.section || c.docId,
        relevance: c.similarity,
      })),
      tokensUsed: {
        input: response.usageMetadata?.promptTokenCount ?? 0,
        output: response.usageMetadata?.candidatesTokenCount ?? 0,
        total: response.usageMetadata?.totalTokenCount ?? 0,
      },
    }
  } catch (err) {
    // Se Gemini falhar, fallback para stub para não quebrar UX
    console.error('llm.error', err)
    return STUB_NO_KEY(chunks)
  }
}
