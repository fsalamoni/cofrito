/**
 * MessageBubble — bolha de mensagem.
 */
import { useState } from 'react'
import { ThumbsUp, ThumbsDown, ExternalLink } from 'lucide-react'
import { api } from '@/lib/api'
import { formatTime } from '@/lib/utils'
import type { ChatMessage, SourceRef } from '@/types'
import { AgentAvatar } from './AgentAvatar'
import { useUIStore } from '@/stores/uiStore'

interface MessageBubbleProps {
  message: ChatMessage
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(
    message.feedback?.helpful === true ? 'up' : message.feedback?.helpful === false ? 'down' : null,
  )
  const [comment, setComment] = useState(message.feedback?.comment || '')
  const pushToast = useUIStore((s) => s.pushToast)

  const handleFeedback = async (helpful: boolean) => {
    setFeedback(helpful ? 'up' : 'down')
    try {
      await api.submitFeedback({ messageId: message.id, helpful, comment })
    } catch (err) {
      pushToast('Erro ao enviar feedback', 'error')
    }
  }

  return (
    <div className={`cofrito-bubble cofrito-bubble--${message.role}`}>
      {!isUser && <AgentAvatar size="sm" />}
      <div className="cofrito-bubble-content">
        <div className="cofrito-bubble-text" dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }} />

        {message.sources && message.sources.length > 0 && (
          <div className="cofrito-sources">
            <p className="cofrito-sources-title">📄 Fontes consultadas:</p>
            {message.sources.slice(0, 3).map((src: SourceRef) => (
              <a
                key={src.docId + src.chunkId}
                href={src.url || `#/doc/${src.docId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="cofrito-source-link"
              >
                <ExternalLink size={12} />
                {src.title}
                {src.section && <span className="cofrito-source-section"> — {src.section}</span>}
              </a>
            ))}
          </div>
        )}

        {!isUser && (
          <div className="cofrito-feedback">
            <button
              className={`cofrito-feedback-btn ${feedback === 'up' ? 'active' : ''}`}
              onClick={() => handleFeedback(true)}
              aria-label="Resposta útil"
              aria-pressed={feedback === 'up'}
            >
              <ThumbsUp size={12} />
            </button>
            <button
              className={`cofrito-feedback-btn ${feedback === 'down' ? 'active' : ''}`}
              onClick={() => handleFeedback(false)}
              aria-label="Resposta não útil"
              aria-pressed={feedback === 'down'}
            >
              <ThumbsDown size={12} />
            </button>
            {feedback === 'down' && (
              <input
                type="text"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onBlur={() => handleFeedback(false)}
                placeholder="O que faltou? (opcional)"
                className="cofrito-feedback-input"
              />
            )}
          </div>
        )}

        <time className="cofrito-bubble-time">{formatTime(message.createdAt)}</time>
      </div>
    </div>
  )
}

/**
 * Renderizador de markdown simples.
 * Para HTML seguro, preferimos dangerouslySetInnerHTML com sanitização.
 */
function renderMarkdown(text: string): string {
  // Escapa HTML
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  return escaped
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>')
}
