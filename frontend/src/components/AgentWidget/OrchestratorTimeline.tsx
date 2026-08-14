/**
 * OrchestratorTimeline — timeline em tempo real do pipeline multi-agente.
 *
 * Aparece ENQUANTO o chat esta processando (isThinking=true).
 * Ouve eventos de agentEvents/{conversationId} via Firestore onSnapshot.
 *
 * Tipos de evento (5 balanceados):
 *  - thinking: agente orquestrador analisando
 *  - planning: plano definido
 *  - searching-acervo: busca no corpus interno
 *  - searching-web: busca na web externa
 *  - answering: elaborando resposta final
 */
import { useEffect, useState } from 'react'
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore'
import { firestore as db } from '@/lib/firebase'
import { Brain, FileSearch, Globe, Sparkles, CheckCircle2, AlertCircle, Loader2, Search } from 'lucide-react'

export interface OrchestratorTimelineProps {
  conversationId: string | null
  pipelineMessageId: string | null
  isActive: boolean
}

interface NarrativeEvent {
  messageId?: string
  id: string
  ts: string
  type: 'thinking' | 'planning' | 'searching-acervo' | 'searching-web' | 'compiling' | 'answering' | 'complete' | 'error'
  details?: string
  durationMs?: number
  status?: 'success' | 'error' | 'skipped'
  count?: number
  titles?: string[]
}

const TYPE_META: Record<NarrativeEvent['type'], { icon: React.ReactNode; label: string; color: string }> = {
  'thinking':        { icon: <Brain size={14} />,           label: 'Pensando',         color: '#6366f1' },
  'planning':        { icon: <FileSearch size={14} />,      label: 'Planejando',       color: '#8b5cf6' },
  'searching-acervo':{ icon: <Search size={14} />,          label: 'Acervo interno',   color: '#0891b2' },
  'searching-web':   { icon: <Globe size={14} />,           label: 'Web externa',      color: '#0284c7' },
  'compiling':       { icon: <FileSearch size={14} />,      label: 'Compilando',       color: '#7c3aed' },
  'answering':       { icon: <Sparkles size={14} />,        label: 'Respondendo',      color: '#1a4d8f' },
  'complete':        { icon: <CheckCircle2 size={14} />,    label: 'Concluído',        color: '#16a34a' },
  'error':           { icon: <AlertCircle size={14} />,     label: 'Erro',             color: '#dc2626' },
}

export function OrchestratorTimeline({ conversationId, pipelineMessageId, isActive }: OrchestratorTimelineProps) {
  const [events, setEvents] = useState<NarrativeEvent[]>([])
  const [isListening, setIsListening] = useState(false)

  useEffect(() => {
    if (!conversationId || !pipelineMessageId || !isActive) {
      setEvents([])
      setIsListening(false)
      return
    }
    setIsListening(true)
    // Ouve eventos do Firestore em tempo real
    // IMPORTANTE: tambem faz getDocs() inicial para pegar eventos ja persistidos
    // (o pipeline pode ser mais rapido que o listener se inscrever)
    const colRef = collection(db, `agentEvents/${conversationId}/events`)
    const q = query(colRef, orderBy('ts', 'asc'))
    let cancelled = false  // evita race condition quando o user troca de conversa rapido
    // Query inicial
    const fetchInitial = async () => {
      try {
        const { getDocs } = await import('firebase/firestore')
        const snap = await getDocs(q)
        if (cancelled) return  // ignora se o effect foi limpo
        const initial = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as NarrativeEvent))
          .filter((e) => e.messageId === pipelineMessageId)
        setEvents(initial)
      } catch (err) {
        if (!cancelled) console.warn('Erro ao buscar eventos iniciais:', err)
      }
    }
    void fetchInitial()
    // Listener em tempo real
    const unsubscribe = onSnapshot(q, (snap) => {
      const filtered = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as NarrativeEvent))
        .filter((e) => e.messageId === pipelineMessageId)
      setEvents(filtered)
    }, (err) => {
      console.warn('Erro ao ouvir agentEvents:', err)
      setIsListening(false)
    })
    return () => { cancelled = true; unsubscribe() }
  }, [conversationId, pipelineMessageId, isActive])

  if (!isActive) return null

  return (
    <div style={wrapStyle}>
      <div style={headerStyle}>
        <Loader2 size={14} className="spin" color="#1a4d8f" />
        <span style={headerTitleStyle}>Cofrito trabalhando...</span>
        {isListening && events.length > 0 && (
          <span style={counterStyle}>{events.length} {events.length === 1 ? 'etapa' : 'etapas'}</span>
        )}
      </div>
      <div style={timelineStyle}>
        {events.length === 0 ? (
          <div style={emptyStyle}>
            <Brain size={14} color="#9ca3af" />
            <span>Aguardando primeiro evento...</span>
          </div>
        ) : (
          events.map((event, idx) => {
            const meta = TYPE_META[event.type] || TYPE_META.thinking
            const isLast = idx === events.length - 1
            const isError = event.status === 'error' || event.type === 'error'
            const isComplete = event.type === 'complete'
            return (
              <div key={event.id} style={eventRowStyle}>
                <div style={iconColStyle}>
                  <div style={{
                    ...iconStyle,
                    background: isError ? '#fee2e2' : (isComplete ? '#dcfce7' : '#eef2ff'),
                    color: isError ? '#991b1b' : (isComplete ? '#166534' : meta.color),
                  }}>
                    {meta.icon}
                  </div>
                  {!isLast && <div style={lineStyle} />}
                </div>
                <div style={contentColStyle}>
                  <div style={eventLabelStyle}>
                    {meta.label}
                    {event.durationMs !== undefined && (
                      <span style={durationStyle}>· {event.durationMs}ms</span>
                    )}
                  </div>
                  {event.details && <div style={eventDetailStyle}>{event.details}</div>}
                  {event.titles && event.titles.length > 0 && (
                    <div style={titlesWrapStyle}>
                      {event.titles.map((t, ti) => (
                        <span key={ti} style={titleChipStyle} title={t}>{t}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ── Estilos ────────────────────────────────────────────────────────────

const wrapStyle: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  padding: 12,
  marginTop: 8,
  marginBottom: 8,
  maxWidth: '100%',
}
const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  paddingBottom: 8,
  borderBottom: '1px solid #f3f4f6',
  marginBottom: 8,
}
const headerTitleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: '#1a4d8f',
  flex: 1,
}
const counterStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#6b7280',
  background: '#f3f4f6',
  padding: '2px 8px',
  borderRadius: 10,
}
const timelineStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 0,
}
const emptyStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 12,
  color: '#9ca3af',
  padding: '8px 4px',
}
const eventRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
}
const iconColStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  flexShrink: 0,
}
const iconStyle: React.CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
}
const lineStyle: React.CSSProperties = {
  width: 2,
  flex: 1,
  background: '#e5e7eb',
  minHeight: 8,
  margin: '2px 0',
}
const contentColStyle: React.CSSProperties = {
  flex: 1,
  paddingTop: 2,
  paddingBottom: 12,
}
const eventLabelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  color: '#0f172a',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
}
const durationStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#9ca3af',
  fontWeight: 400,
}
const eventDetailStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#6b7280',
  marginTop: 2,
  lineHeight: 1.4,
}
const titlesWrapStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 4,
  marginTop: 4,
}
const titleChipStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#0f172a',
  background: '#f1f5f9',
  border: '1px solid #e2e8f0',
  borderRadius: 4,
  padding: '1px 6px',
  maxWidth: 240,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}
