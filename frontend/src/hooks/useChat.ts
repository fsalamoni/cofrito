/**
 * Hook principal do chat.
 */
import { useCallback } from 'react'
import { api } from '@/lib/api'
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
    addMessage,
    setThinking,
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

      try {
        // 2. Chama Cloud Function
        const result = await api.chat({
          conversationId: conversationId || undefined,
          message: text,
          allowExternal,
        })

        // 3. Adiciona resposta
        const response = result.data as ChatResponse
        setConversationId(response.conversationId)

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
      } finally {
        setThinking(false)
      }
    },
    [user, conversationId, isThinking, allowExternal, addMessage, setThinking, setConversationId, pushToast],
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
