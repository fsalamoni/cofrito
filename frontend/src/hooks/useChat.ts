/**
 * Hook principal do chat.
 */
import { useCallback } from 'react'
import { api } from '@/lib/api'
import { detectQuickReply } from '@/lib/self-detect'
import { useAuthStore } from '@/stores/authStore'
import { useChatStore } from '@/stores/chatStore'
import { useUIStore } from '@/stores/uiStore'
import type { ChatMessage, ChatResponse } from '@/types'

export function useChat() {
  const user = useAuthStore((s) => s.user)
  const {
    conversationId,
    messages,
    isThinking,
    allowExternal,
    requestLegalAnalysis,
    effort,
    addMessage,
    setThinking,
    setLivePipelineMessageId,
    setLiveEventChannel,
    setConversationId,
    startNewConversation,
  } = useChatStore()
  const pushToast = useUIStore((s) => s.pushToast)

  const send = useCallback(
    async (text: string) => {
      if (!user) {
        pushToast('Faça login para conversar com o Cofrito', 'warning')
        return
      }
      if (!text.trim()) return
      if (isThinking) return

      // 1. Adiciona mensagem do usuário
      const userMessage: ChatMessage = {
        id: `tmp-${Date.now()}`,
        conversationId: conversationId || '',
        role: 'user',
        content: text,
        createdAt: new Date().toISOString(),
      }
      addMessage(userMessage)
      setThinking(true)

      // Canal de eventos AO VIVO: gerado no cliente ANTES de enviar, para a
      // timeline se inscrever imediatamente (funciona já na 1ª mensagem).
      const liveId = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
        ? crypto.randomUUID()
        : `live-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
      setLiveEventChannel(liveId)
      setLivePipelineMessageId(liveId)

      // FAST-PATH CLIENT (padrão Lexio): detecta perguntas sobre o próprio agente
      // ou interações sociais e responde IMEDIATAMENTE no client, sem chamada de rede.
      // Categorias: identity, capabilities, how_it_works, how_to_use, social_*
      // Cada categoria tem resposta NATURAL específica.
      // Se não matchear nenhuma, vai pro backend (pipeline multi-agente).
      const quickReply = detectQuickReply(text)
      if (quickReply) {
        const assistantMessage: ChatMessage = {
          id: `msg-${Date.now()}-${quickReply.intent}`,
          conversationId: conversationId || '',
          role: 'assistant',
          content: quickReply.reply,
          sources: [],
          intent: quickReply.intent,
          latencyMs: 0,
          tokens: { prompt: 0, completion: 0, total: 0 },
          agentRuns: 0,
          iterations: 0,
          createdAt: new Date().toISOString(),
        }
        addMessage(assistantMessage)
        setThinking(false)
        setLiveEventChannel(null)
        setLivePipelineMessageId(null)
        return
      }

      try {
        // 2. Chama Cloud Function (passa o canal ao vivo para a timeline)
        const result = await api.chat({
          conversationId: conversationId || undefined,
          message: text,
          allowExternal,
          requestLegalAnalysis,
          effort,
          clientEventId: liveId,
        })

        // 3. Adiciona resposta
        const response = result.data as ChatResponse
        setConversationId(response.conversationId)
        if (response.pipelineMessageId) {
          setLivePipelineMessageId(response.pipelineMessageId)
        }

        const assistantMessage: ChatMessage = {
          id: response.messageId,
          conversationId: response.conversationId,
          role: 'assistant',
          content: response.reply,
          sources: response.sources,
          intent: response.intent,
          latencyMs: response.latencyMs,
          tokens: response.usage,
          agentRuns: response.agentRuns,
          iterations: response.iterations,
          criticScore: response.criticScore,
          createdAt: new Date().toISOString(),
        }
        addMessage(assistantMessage)
        // Mantém a timeline visível por um instante e então limpa o canal ao vivo.
        setTimeout(() => {
          setLivePipelineMessageId(null)
          setLiveEventChannel(null)
        }, 1500)
      } catch (err: any) {
        const code = err?.code as string | undefined
        if (code === 'functions/not-found' || code === 'functions/unavailable') {
          pushToast(
            'O serviço de chat ainda não está disponível neste deploy. ' +
              'A LLM precisa ser habilitada pelo administrador.',
            'warning',
          )
        } else {
          pushToast(err?.message || 'Erro ao enviar mensagem', 'error')
        }
        console.error('Chat error:', err)
        setLivePipelineMessageId(null)
        setLiveEventChannel(null)
      } finally {
        setThinking(false)
      }
    },
    [user, conversationId, isThinking, allowExternal, requestLegalAnalysis, effort, addMessage, setThinking,
    setLivePipelineMessageId, setLiveEventChannel, setConversationId, pushToast],
  )

  const restart = useCallback(() => {
    startNewConversation()
  }, [startNewConversation])

  return {
    messages,
    isThinking,
    conversationId,
    allowExternal,
    send,
    restart,
  }
}
