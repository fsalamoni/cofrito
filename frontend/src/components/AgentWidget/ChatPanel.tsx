/**
 * ChatPanel — janela de chat com lista de mensagens + input.
 */
import { useEffect, useRef, useState } from 'react'
import { Send } from 'lucide-react'
import { useChat } from '@/hooks/useChat'
import { useAuth } from '@/hooks/useAuth'
import { MessageBubble } from './MessageBubble'
import { Welcome } from './Welcome'
import { TypingIndicator } from './TypingIndicator'
import { LoginPrompt } from './LoginPrompt'

export function ChatPanel() {
  const { messages, isThinking, send, restart } = useChat()
  const { user } = useAuth()
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
            placeholder="Digite sua pergunta..."
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
