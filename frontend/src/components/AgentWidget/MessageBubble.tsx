/**
 * MessageBubble — bolha de mensagem estilo chat de IA moderno.
 *
 * Recursos:
 *  - Markdown rendering (negrito, listas, links)
 *  - Code blocks com syntax highlight
 *  - Citations extraídas e exibidas como chips clicáveis
 *  - Botão de copiar
 *  - Botões de feedback (👍/👎)
 *  - Avatares distintos (user / agent)
 *  - Timestamp
 */
import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { Check, Copy, ThumbsUp, ThumbsDown, Brain, ChevronRight, CheckCircle2, XCircle, MinusCircle } from 'lucide-react'
import type { ChatMessage, SourceRef, TrailStep } from '@/types'
import { AgentAvatar } from './AgentAvatar'
import { useAuthStore } from '@/stores/authStore'
import { AgentRunIndicatorCompact } from './AgentRunIndicator'

interface MessageBubbleProps {
  message: ChatMessage
  onFeedback?: (helpful: boolean) => void
}

export function MessageBubble({ message, onFeedback }: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const [copied, setCopied] = useState(false)
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(
    message.feedback ? (message.feedback.helpful ? 'up' : 'down') : null,
  )
  const user = useAuthStore((s) => s.user)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore */
    }
  }

  function handleFeedback(helpful: boolean) {
    const newFeedback = helpful ? 'up' : 'down'
    if (feedback === newFeedback) return
    setFeedback(newFeedback)
    onFeedback?.(helpful)
  }

  const time = new Date(message.createdAt).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })

  if (isUser) {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16, gap: 10, alignItems: 'flex-end' }}>
        <div style={userBubbleStyle}>
          <p style={userTextStyle}>{message.content}</p>
        </div>
        <div style={userAvatarStyle}>
          {user?.photoURL ? (
            <img src={user.photoURL} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%' }} />
          ) : (
            <div style={userAvatarPlaceholderStyle}>
              {(user?.displayName || user?.email || 'U')[0]?.toUpperCase()}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'flex-start' }}>
      <div style={agentAvatarStyle}>
        <AgentAvatar size={32} state={message.role === 'assistant' && !message.sources?.length ? 'idle' : 'idle'} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={agentHeaderStyle}>
          <span style={agentNameStyle}>Cofrito</span>
          <span style={agentTimeStyle}>{time}</span>
        </div>

        {/* Raciocínio + ações do orquestrador (colapsado, antes da resposta) */}
        {message.trail && message.trail.length > 0 && (
          <ThinkingTrail trail={message.trail} />
        )}

        <div style={agentBubbleStyle}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[[rehypeHighlight, { ignoreMissing: true }]]}
            components={{
              // Code blocks
              code(props: any) {
                const { inline, className, children } = props
                if (inline) {
                  return <code style={codeInlineStyle}>{children}</code>
                }
                return (
                  <pre style={codeBlockStyle}>
                    <code className={className}>{children}</code>
                  </pre>
                )
              },
              // Parágrafos
              p(props) {
                return <p style={paragraphStyle}>{props.children}</p>
              },
              // Listas
              ul(props) {
                return <ul style={listStyle}>{props.children}</ul>
              },
              ol(props) {
                return <ol style={listStyle}>{props.children}</ol>
              },
              li(props) {
                return <li style={listItemStyle}>{props.children}</li>
              },
              // Links
              a(props) {
                return <a {...props} style={linkStyle} target="_blank" rel="noopener noreferrer" />
              },
              // Negrito
              strong(props) {
                return <strong style={strongStyle}>{props.children}</strong>
              },
            }}
          >
            {message.content}
          </ReactMarkdown>
        </div>

        {/* Citations */}
        {message.sources && message.sources.length > 0 && (
          <div style={citationsStyle}>
            <div style={citationsLabelStyle}>Fontes consultadas</div>
            <div style={citationsChipsStyle}>
              {message.sources.slice(0, 5).map((src, i) => (
                <CitationChip key={i} index={i + 1} source={src} />
              ))}
              {message.sources.length > 5 && (
                <span style={citationMoreStyle}>+{message.sources.length - 5}</span>
              )}
            </div>
          </div>
        )}

        {/* Agent Run Indicator (multi-agente pipeline) */}
        {(message.agentRuns !== undefined || message.iterations !== undefined || message.criticScore !== undefined) && (
          <AgentRunIndicatorCompact
            agentRunsCount={message.agentRuns}
            iterations={message.iterations}
            criticScore={message.criticScore}
          />
        )}

        {/* Actions */}
        <div style={actionsStyle}>
          <button onClick={handleCopy} style={actionBtnStyle} title="Copiar resposta" aria-label="Copiar">
            {copied ? <Check size={14} color="#22c55e" /> : <Copy size={14} />}
          </button>
          <button
            onClick={() => handleFeedback(true)}
            style={{ ...actionBtnStyle, color: feedback === 'up' ? '#22c55e' : '#9ca3af' }}
            title="Útil"
            aria-label="Útil"
          >
            <ThumbsUp size={14} />
          </button>
          <button
            onClick={() => handleFeedback(false)}
            style={{ ...actionBtnStyle, color: feedback === 'down' ? '#ef4444' : '#9ca3af' }}
            title="Não útil"
            aria-label="Não útil"
          >
            <ThumbsDown size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * ThinkingTrail — seção COLAPSADA (nativa <details>) com o raciocínio e as ações
 * que o orquestrador executou antes da resposta final. Fica MINIMIZADA por padrão;
 * o usuário expande se quiser ver o passo a passo.
 */
function ThinkingTrail({ trail }: { trail: TrailStep[] }) {
  const n = trail.length
  return (
    <details style={trailDetailsStyle}>
      <summary style={trailSummaryStyle}>
        <Brain size={13} color="#6366f1" />
        <span style={{ flex: 1 }}>Ver raciocínio do Cofrito</span>
        <span style={trailCountStyle}>{n} {n === 1 ? 'etapa' : 'etapas'}</span>
        <ChevronRight size={14} className="trail-chevron" />
      </summary>
      <div style={trailBodyStyle}>
        {trail.map((step, i) => {
          const color =
            step.status === 'error' ? '#dc2626'
            : step.status === 'skipped' ? '#9ca3af'
            : step.status === 'success' ? '#16a34a'
            : '#6366f1'
          const Icon =
            step.status === 'error' ? XCircle
            : step.status === 'skipped' ? MinusCircle
            : CheckCircle2
          return (
            <div key={i} style={trailStepStyle}>
              <Icon size={13} color={color} style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={trailStepLabelStyle}>
                  {step.label}
                  {typeof step.durationMs === 'number' && step.durationMs > 0 && (
                    <span style={trailDurationStyle}> · {(step.durationMs / 1000).toFixed(1)}s</span>
                  )}
                </div>
                {step.detail && <div style={trailStepDetailStyle}>{step.detail}</div>}
              </div>
            </div>
          )
        })}
      </div>
    </details>
  )
}

function CitationChip({ index, source }: { index: number; source: SourceRef }) {
  const title = source.title || source.docId
  return (
    <a
      href={`#/corpus/${source.docId}`}
      onClick={(e) => e.preventDefault()}
      style={citationChipStyle}
      title={`${title} (relevância: ${(source.relevance * 100).toFixed(0)}%)`}
    >
      <span style={citationIndexStyle}>{index}</span>
      <span style={citationTitleStyle}>{title}</span>
    </a>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────

const userBubbleStyle: React.CSSProperties = {
  background: '#1a4d8f',
  color: '#ffffff',
  borderRadius: '16px 16px 4px 16px',
  padding: '10px 14px',
  maxWidth: '78%',
  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
}

const userTextStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  lineHeight: 1.55,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
}

const userAvatarStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: '50%',
  flexShrink: 0,
  overflow: 'hidden',
}

const userAvatarPlaceholderStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  background: '#5B7CFA',
  color: '#ffffff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 14,
  fontWeight: 600,
}

const agentAvatarStyle: React.CSSProperties = {
  width: 40,
  height: 40,
  // QUADRADO com fundo TRANSPARENTE — respeita todos os cantos do PNG original
  // (sem borderRadius, sem background, sem border, sem overflow:hidden)
  borderRadius: 0,
  background: 'transparent',
  border: 'none',
  flexShrink: 0,
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'flex-start',
}

const agentHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBottom: 6,
}

const agentNameStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: '#1a4d8f',
}

const agentTimeStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#9ca3af',
}

const agentBubbleStyle: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: '4px 16px 16px 16px',
  padding: '12px 14px',
  fontSize: 14,
  lineHeight: 1.6,
  color: '#1a1a1a',
  wordBreak: 'break-word',
  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
}

const paragraphStyle: React.CSSProperties = {
  margin: '0 0 8px',
}

const listStyle: React.CSSProperties = {
  margin: '4px 0 8px',
  paddingLeft: 20,
}

const listItemStyle: React.CSSProperties = {
  marginBottom: 4,
}

const linkStyle: React.CSSProperties = {
  color: '#1a4d8f',
  textDecoration: 'underline',
}

const strongStyle: React.CSSProperties = {
  fontWeight: 600,
  color: '#0f172a',
}

const codeInlineStyle: React.CSSProperties = {
  background: '#f1f5f9',
  border: '1px solid #e2e8f0',
  borderRadius: 4,
  padding: '1px 5px',
  fontSize: 12,
  fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
  color: '#0f172a',
}

const codeBlockStyle: React.CSSProperties = {
  background: '#0f172a',
  color: '#e2e8f0',
  borderRadius: 8,
  padding: 12,
  fontSize: 12,
  fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
  overflowX: 'auto',
  margin: '8px 0',
  lineHeight: 1.5,
}

const citationsStyle: React.CSSProperties = {
  marginTop: 10,
  paddingTop: 10,
  borderTop: '1px solid #f1f5f9',
}

const citationsLabelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  color: '#6b7280',
  marginBottom: 6,
}

const citationsChipsStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 4,
}

const citationChipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  background: '#eef2ff',
  border: '1px solid #c7d2fe',
  color: '#1a4d8f',
  borderRadius: 12,
  padding: '3px 8px 3px 4px',
  fontSize: 11,
  textDecoration: 'none',
  cursor: 'pointer',
  maxWidth: 200,
  fontWeight: 500,
}

const citationIndexStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 16,
  height: 16,
  borderRadius: '50%',
  background: '#1a4d8f',
  color: '#ffffff',
  fontSize: 10,
  fontWeight: 700,
  flexShrink: 0,
}

const citationTitleStyle: React.CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const citationMoreStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#6b7280',
  padding: '3px 6px',
}

const actionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: 4,
  marginTop: 8,
  opacity: 0.7,
  transition: 'opacity 0.15s',
}

const actionBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  padding: 4,
  borderRadius: 4,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#9ca3af',
}

// ── Thinking trail (colapsável) ────────────────────────────────────────────

const trailDetailsStyle: React.CSSProperties = {
  marginBottom: 8,
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  background: '#fafafe',
  overflow: 'hidden',
}

const trailSummaryStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '7px 10px',
  fontSize: 12,
  fontWeight: 500,
  color: '#4b5563',
  cursor: 'pointer',
  userSelect: 'none',
  listStyle: 'none',
}

const trailCountStyle: React.CSSProperties = {
  fontSize: 10,
  color: '#6b7280',
  background: '#eef2ff',
  padding: '1px 7px',
  borderRadius: 10,
}

const trailBodyStyle: React.CSSProperties = {
  padding: '4px 10px 10px',
  borderTop: '1px solid #f1f5f9',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

const trailStepStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'flex-start',
}

const trailStepLabelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: '#0f172a',
}

const trailDurationStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 400,
  color: '#9ca3af',
}

const trailStepDetailStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#6b7280',
  marginTop: 1,
  lineHeight: 1.4,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
}


