/**
 * LLM service — wrapper para Gemini.
 */

import { GoogleGenerativeAI } from '@google/generative-ai'
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
  const { userMessage, history, chunks, profile, apiKey } = input

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
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_LOW_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_LOW_AND_ABOVE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_LOW_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_LOW_AND_ABOVE' },
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
}
