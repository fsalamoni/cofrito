/**
 * ChatPanel — janela de chat com lista de mensagens + input + toggle de modo.
 */
import { useEffect, useRef, useState } from 'react'
import { Send, Globe, Database } from 'lucide-react'
import { useChat } from '@/hooks/useChat'
import { useAuth } from '@/hooks/useAuth'
import { useChatStore } from '@/stores/chatStore'
import { MessageBubble } from './MessageBubble'
import { Welcome } from './Welcome'
import { TypingIndicator } from './TypingIndicator'
import { LoginPrompt } from './LoginPrompt'

export function ChatPanel() {
  const { messages, isThinking, send, restart } = useChat()
  const { user } = useAuth()
  const allowExternal = useChatStore((s) => s.allowExternal)
  const setAllowExternal = useChatStore((s) => s.setAllowExternal)
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, isThinking])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || isThinking) return
    setInput('')
    await send(text)
  }

  if (!user) {
    return (
      <div className="cofrito-panel-body">
        <LoginPrompt />
      </div>
    )
  }

  return (
    <>
      <div ref={scrollRef} className="cofrito-messages" role="log" aria-live="polite">
        {messages.length === 0 ? (
          <Welcome onSuggestion={(q) => send(q)} />
        ) : (
          messages.map((m) => <MessageBubble key={m.id} message={m} />)
        )}
        {isThinking && <TypingIndicator />}
      </div>

      <div className="cofrito-input-area">
        {/* Toggle de modo: corpus-only (padrão) vs permite informações externas */}
        <div className="cofrito-mode-toggle" role="group" aria-label="Modo de resposta">
          <button
            type="button"
            onClick={() => setAllowExternal(false)}
            className={`cofrito-mode-btn ${!allowExternal ? 'active' : ''}`}
            aria-pressed={!allowExternal}
            title="Responde apenas com material do acervo do CAOCIPP"
          >
            <Database size={14} />
            <span>Apenas acervo</span>
          </button>
          <button
            type="button"
            onClick={() => setAllowExternal(true)}
            className={`cofrito-mode-btn ${allowExternal ? 'active' : ''}`}
            aria-pressed={allowExternal}
            title="Permite complementar com fontes externas (regras primordiais continuam)"
          >
            <Globe size={14} />
            <span>Permitir informações externas</span>
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleSend()
          }}
          className="cofrito-input-form"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={allowExternal ? 'Pergunte algo (com fontes externas)…' : 'Pergunte algo sobre o acervo do CAOCIPP…'}
            disabled={isThinking}
            className="cofrito-input"
            aria-label="Mensagem"
            maxLength={2000}
          />
          <button
            type="submit"
            disabled={!input.trim() || isThinking}
            className="cofrito-send-btn"
            aria-label="Enviar"
          >
            <Send size={18} />
          </button>
        </form>
        {messages.length > 0 && (
          <button onClick={restart} className="cofrito-restart-btn">
            Nova conversa
          </button>
        )}
      </div>
    </>
  )
}
