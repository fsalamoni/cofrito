/**
 * ChatPanel — janela de chat estilo agente de IA.
 *
 * Layout:
 *  - Mensagens com bolhas distintas (user à direita, agent à esquerda)
 *  - Avatares em cada mensagem
 *  - Markdown rendering
 *  - Citations clicáveis
 *  - Sugestões no estado vazio
 *  - Input com textarea auto-resize
 *  - Botão stop durante geração
 *  - Toggle de modo (corpus-only / informações externas)
 *  - Toggle "Análise jurídica" (solicita Redator Jurídico)
 *  - Toggle de esforço (rápido / padrão / profundo)
 *  - Atalho: Enter envia, Shift+Enter quebra linha
 */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Send, Square, Database, Globe, MessageSquarePlus, Scale } from 'lucide-react'
import { useChat } from '@/hooks/useChat'
import { useAuth } from '@/hooks/useAuth'
import { useChatStore } from '@/stores/chatStore'
import { useAuthStore } from '@/stores/authStore'
import { MessageBubble } from './MessageBubble'
import { Welcome } from './Welcome'
import { TypingIndicator } from './TypingIndicator'
import { LoginPrompt } from './LoginPrompt'

export function ChatPanel() {
  const { messages, isThinking, send, restart } = useChat()
  const { user } = useAuth()
  const userProfile = useAuthStore((s) => s.user)
  const allowExternal = useChatStore((s) => s.allowExternal)
  const setAllowExternal = useChatStore((s) => s.setAllowExternal)
  const requestLegalAnalysis = useChatStore((s) => s.requestLegalAnalysis)
  const setRequestLegalAnalysis = useChatStore((s) => s.setRequestLegalAnalysis)
  const effort = useChatStore((s) => s.effort)
  const setEffort = useChatStore((s) => s.setEffort)
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (!scrollRef.current) return
    const el = scrollRef.current
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100
    if (isAtBottom || isThinking) {
      el.scrollTo({ top: el.scrollHeight, behavior: isThinking ? 'smooth' : 'instant' as ScrollBehavior })
    }
  }, [messages, isThinking])

  // Auto-resize textarea
  useEffect(() => {
    if (!textareaRef.current) return
    const ta = textareaRef.current
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'
  }, [input])

  async function handleSend() {
    const text = input.trim()
    if (!text || isThinking) return
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    await send(text)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleStop() {
    // TODO: implementar cancel quando o backend suportar
    // Por enquanto apenas limpa o estado local
    console.warn('Stop não implementado no backend ainda')
  }

  if (!user) {
    return (
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <LoginPrompt />
      </div>
    )
  }

  return (
    <>
      <div ref={scrollRef} style={messagesStyle} role="log" aria-live="polite">
        {messages.length === 0 ? (
          <Welcome onSuggestion={(q) => send(q)} userName={userProfile?.displayName ?? undefined} />
        ) : (
          <>
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
            {isThinking && <TypingIndicator />}
          </>
        )}
      </div>

      <div style={inputAreaStyle}>
        {/* Toggles de modo */}
        <div style={modeToggleStyle} role="group" aria-label="Modo de resposta">
          <button
            type="button"
            onClick={() => setAllowExternal(false)}
            className={`cofrito-mode-btn ${!allowExternal ? 'active' : ''}`}
            aria-pressed={!allowExternal}
            title="Responde apenas com material do acervo (corpus + intranet MPRS)"
            style={{
              ...modeBtnStyle,
              ...(!allowExternal ? modeBtnActiveStyle : {}),
            }}
          >
            <Database size={13} />
            <span>Apenas acervo</span>
          </button>
          <button
            type="button"
            onClick={() => setAllowExternal(true)}
            className={`cofrito-mode-btn ${allowExternal ? 'active' : ''}`}
            aria-pressed={allowExternal}
            title="Permite complementar com fontes web externas (Tavily/Serper/Brave)"
            style={{
              ...modeBtnStyle,
              ...(allowExternal ? modeBtnActiveStyle : {}),
            }}
          >
            <Globe size={13} />
            <span>+ Web externa</span>
          </button>
        </div>

        {/* Toggle "Análise jurídica" (Redator Jurídico) */}
        <div style={modeToggleStyle} role="group" aria-label="Análise jurídica">
          <button
            type="button"
            onClick={() => setRequestLegalAnalysis(!requestLegalAnalysis)}
            className={`cofrito-mode-btn ${requestLegalAnalysis ? 'active' : ''}`}
            aria-pressed={requestLegalAnalysis}
            title={requestLegalAnalysis
              ? 'O Redator Jurídico vai produzir análise jurídica baseada SOMENTE nos documentos encontrados'
              : 'Sem análise jurídica — o Cofrito entrega apenas os documentos encontrados'}
            style={{
              ...modeBtnStyle,
              ...(requestLegalAnalysis ? modeBtnLegalActiveStyle : {}),
              flex: 1,
            }}
          >
            <Scale size={13} />
            <span>{requestLegalAnalysis ? 'Análise jurídica: ON' : 'Análise jurídica'}</span>
          </button>

          {/* Esforço do pipeline */}
          <select
            value={effort}
            onChange={(e) => setEffort(e.target.value as any)}
            title="Esforço do pipeline: rápido (3 iter, sem crítico), padrão (6 iter), profundo (10 iter + crítico)"
            style={effortSelectStyle}
            aria-label="Esforço do pipeline"
          >
            <option value="rapido">⚡ Rápido</option>
            <option value="padrao">● Padrão</option>
            <option value="profundo">🔬 Profundo</option>
          </select>
        </div>

        {/* Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleSend()
          }}
          style={formStyle}
        >
          {messages.length > 0 && (
            <button
              type="button"
              onClick={restart}
              style={newChatBtnStyle}
              title="Nova conversa"
              aria-label="Nova conversa"
            >
              <MessageSquarePlus size={16} />
            </button>
          )}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              allowExternal
                ? 'Pergunte algo (pode usar fontes externas)…'
                : 'Pergunte algo sobre o acervo do CAOCIPP…'
            }
            disabled={isThinking}
            rows={1}
            style={textareaStyle}
            aria-label="Mensagem"
            maxLength={2000}
          />
          {isThinking ? (
            <button
              type="button"
              onClick={handleStop}
              style={stopBtnStyle}
              title="Parar geração"
              aria-label="Parar"
            >
              <Square size={14} fill="currentColor" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              style={{
                ...sendBtnStyle,
                opacity: input.trim() ? 1 : 0.4,
                cursor: input.trim() ? 'pointer' : 'not-allowed',
              }}
              title="Enviar (Enter)"
              aria-label="Enviar"
            >
              <Send size={16} />
            </button>
          )}
        </form>

        <div style={footerHintStyle}>
          <kbd style={kbdStyle}>Enter</kbd> envia · <kbd style={kbdStyle}>Shift+Enter</kbd> quebra linha
        </div>
      </div>
    </>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────

const messagesStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '16px 16px 8px',
  display: 'flex',
  flexDirection: 'column',
  // Smooth scrolling
  scrollBehavior: 'smooth',
}

const inputAreaStyle: React.CSSProperties = {
  borderTop: '1px solid #e5e7eb',
  background: '#ffffff',
  padding: '8px 12px 10px',
  flexShrink: 0,
}

const modeToggleStyle: React.CSSProperties = {
  display: 'flex',
  gap: 4,
  padding: 3,
  background: '#f3f4f6',
  borderRadius: 8,
  marginBottom: 8,
}

const modeBtnStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 4,
  padding: '5px 8px',
  border: 'none',
  borderRadius: 6,
  background: 'transparent',
  color: '#6b7280',
  fontSize: 11,
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'all 0.15s',
  fontFamily: 'inherit',
}

const modeBtnActiveStyle: React.CSSProperties = {
  background: '#ffffff',
  color: '#1a4d8f',
  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
}

const modeBtnLegalActiveStyle: React.CSSProperties = {
  background: '#7c2d12',
  color: '#ffffff',
  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
}

const effortSelectStyle: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  background: '#ffffff',
  color: '#374151',
  borderRadius: 6,
  padding: '4px 8px',
  fontSize: 11,
  fontFamily: 'inherit',
  cursor: 'pointer',
  outline: 'none',
  minWidth: 100,
}

const formStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-end',
  gap: 6,
  background: '#f8fafc',
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  padding: 6,
  transition: 'border-color 0.15s',
}

const textareaStyle: React.CSSProperties = {
  flex: 1,
  border: 'none',
  background: 'transparent',
  resize: 'none',
  outline: 'none',
  fontSize: 14,
  fontFamily: 'inherit',
  lineHeight: 1.5,
  padding: '6px 8px',
  maxHeight: 120,
  color: '#1a1a1a',
  minHeight: 24,
}

const newChatBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  padding: 6,
  borderRadius: 6,
  color: '#6b7280',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
}

const sendBtnStyle: React.CSSProperties = {
  background: '#1a4d8f',
  color: '#ffffff',
  border: 'none',
  borderRadius: 8,
  width: 32,
  height: 32,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  transition: 'opacity 0.15s',
}

const stopBtnStyle: React.CSSProperties = {
  background: '#ef4444',
  color: '#ffffff',
  border: 'none',
  borderRadius: 8,
  width: 32,
  height: 32,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  cursor: 'pointer',
}

const footerHintStyle: React.CSSProperties = {
  fontSize: 10,
  color: '#9ca3af',
  textAlign: 'center',
  marginTop: 6,
}

const kbdStyle: React.CSSProperties = {
  background: '#f3f4f6',
  border: '1px solid #e5e7eb',
  borderRadius: 3,
  padding: '0 4px',
  fontSize: 9,
  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
}
