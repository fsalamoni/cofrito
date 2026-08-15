/**
 * ProcessingProgressModal - Modal de visualizacao do processamento encadeado.
 *
 * Mostra em tempo real (onSnapshot) o estado da fila de processamento:
 *  - Doc atual + etapa + progresso
 *  - Lista de todos os docs da fila com status individual
 *  - Erros detalhados por doc
 *  - Botao para limpar/cancelar fila
 *
 * Persiste entre reloads (estado vem do Firestore).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore'
import { X, Check, AlertCircle, Clock, Trash2, RefreshCw } from 'lucide-react'
import { firestore } from '@/lib/firebase'
import { api } from '@/lib/api'

type Step = 'idle' | 'queued' | 'json_creating' | 'classifying' | 'key_points_extracting' | 'ementa_generating' | 'completed' | 'error'

interface ProcessingState {
  step: Step
  stepLabel: string
  stepStartedAt?: { toMillis?: () => number; seconds?: number } | null
  error?: string | null
  failedStep?: string | null
  retryCount?: number
  queuedAt?: { toMillis?: () => number; seconds?: number } | null
  completedAt?: { toMillis?: () => number; seconds?: number } | null
}

interface QueueState {
  docIds: string[]
  currentDocId: string | null
  currentStep: string | null
  status: 'idle' | 'running' | 'paused' | 'completed' | 'error'
  startedAt: { toMillis?: () => number; seconds?: number } | null
  finishedAt: { toMillis?: () => number; seconds?: number } | null
  lastTickAt: { toMillis?: () => number; seconds?: number } | null
  totalDocs: number
  doneCount: number
  errorCount: number
}

interface DocStatus {
  id: string
  fileName?: string
  processingState: ProcessingState
  hasTextContent: boolean
  hasClassification: boolean
  hasEmenta: boolean
  hasKeyPoints: boolean
}

function formatTime(t: { toMillis?: () => number; seconds?: number } | null | undefined): string {
  if (!t) return '-'
  const ms = t.toMillis ? t.toMillis() : (t.seconds ? t.seconds * 1000 : 0)
  if (!ms) return '-'
  const date = new Date(ms)
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatDuration(start: { toMillis?: () => number; seconds?: number } | null | undefined, now: number = Date.now()): string {
  if (!start) return ''
  const ms = start.toMillis ? start.toMillis() : (start.seconds ? start.seconds * 1000 : 0)
  if (!ms) return ''
  const seconds = Math.max(0, Math.floor((now - ms) / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m${seconds % 60}s`
}

const STEP_ORDER: Step[] = [
  'json_creating',
  'classifying',
  'key_points_extracting',
  'ementa_generating',
]

const STEP_LABELS: Record<Step, string> = {
  idle: 'Aguardando',
  queued: 'Na fila',
  json_creating: '1/4 Criando JSON',
  classifying: '2/4 Classificação',
  key_points_extracting: '3/4 Pontos',
  ementa_generating: '4/4 Ementa',
  completed: 'Concluído',
  error: 'Erro',
}

export function ProcessingProgressModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [queue, setQueue] = useState<QueueState | null>(null)
  const [docs, setDocs] = useState<DocStatus[]>([])
  const [now, setNow] = useState(Date.now())
  const [clearing, setClearing] = useState(false)
  const [forcing, setForcing] = useState(false)
  // Refs para o auto-driver (evita stale closure)
  const statusRef = useRef<string>('idle')
  const tickInFlightRef = useRef(false)

  // AUTO-DRIVER (rede de segurança): o trigger do Firestore e o agendador (1 min)
  // fazem o trabalho pesado. Aqui só cutucamos o backend a cada ~20s enquanto a
  // fila estiver 'running', para recuperar locks travados / dar um empurrão. O
  // backend deduplica via lock (chamadas concorrentes retornam na hora), e só UMA
  // chamada fica em voo por vez. Intervalo alto evita contenção no doc da fila.
  useEffect(() => {
    if (!open) return
    let stopped = false
    const drive = async () => {
      if (stopped || tickInFlightRef.current) return
      if (statusRef.current !== 'running') return
      tickInFlightRef.current = true
      try {
        await api.adminForceQueueTick()
      } catch {
        /* silencioso: o onSnapshot mostra o estado real */
      } finally {
        tickInFlightRef.current = false
      }
    }
    // dispara logo ao abrir (se estiver running) e depois a cada ~20s
    void drive()
    const iv = setInterval(() => { void drive() }, 20000)
    return () => { stopped = true; clearInterval(iv) }
  }, [open])

  useEffect(() => {
    if (!open) return
    const queueRef = doc(firestore, 'admin-config/processing-queue')
    let unsubQueue: Unsubscribe | null = null
    let unsubDocs: Unsubscribe[] = []
    let interval: ReturnType<typeof setInterval> | null = null

    unsubQueue = onSnapshot(queueRef, (snap) => {
      if (!snap.exists) {
        statusRef.current = 'idle'
        setQueue(null)
        setDocs([])
        return
      }
      const newQueue = snap.data() as QueueState
      statusRef.current = newQueue.status
      setQueue(newQueue)

      // Atualizar listeners dos docs (se mudou o conjunto)
      unsubDocs.forEach((u) => { try { u() } catch { /* ignore */ } })
      unsubDocs = []
      if (newQueue.docIds.length > 0) {
        const docIds = newQueue.docIds.slice(0, 50)
        docIds.forEach((id) => {
          const docRef = doc(firestore, 'corpus', id)
          const u = onSnapshot(docRef, (docSnap) => {
            if (!docSnap.exists) return
            const data = docSnap.data()
            setDocs((prev) => {
              const idx = prev.findIndex((d) => d.id === id)
              const next: DocStatus = {
                id,
                fileName: data?.fileName as string | undefined,
                processingState: (data?.processingState as ProcessingState) || {
                  step: 'queued',
                  stepLabel: 'Na fila',
                },
                hasTextContent: !!data?.textContent,
                hasClassification: !!data?.classification,
                hasEmenta: !!data?.ementa,
                hasKeyPoints: !!data?.keyPoints,
              }
              if (idx === -1) return [...prev, next]
              const updated = [...prev]
              updated[idx] = next
              return updated
            })
          })
          unsubDocs.push(u)
        })
      }
    })

    interval = setInterval(() => setNow(Date.now()), 1000)

    return () => {
      try { unsubQueue?.() } catch { /* ignore */ }
      unsubDocs.forEach((u) => { try { u() } catch { /* ignore */ } })
      if (interval) clearInterval(interval)
    }
  }, [open])

  if (!open) return null

  const isOpen = !!queue && queue.status === 'running'
  const isCompleted = !!queue && queue.status === 'completed'
  const isPaused = !!queue && queue.status === 'paused'
  const totalDocs = queue?.totalDocs || queue?.docIds.length || 0
  const done = queue?.doneCount || 0
  const errors = queue?.errorCount || 0
  const progress = totalDocs > 0 ? Math.round((done / totalDocs) * 100) : 0

  const currentDoc = docs.find((d) => d.id === queue?.currentDocId)

  async function handleClear() {
    if (!window.confirm('Limpar fila de processamento? Docs com status "Processando" serao perdidos.')) return
    setClearing(true)
    try {
      await api.adminClearQueue()
    } catch (err) {
      console.error('Erro ao limpar fila:', err)
      alert('Erro: ' + (err as Error).message)
    } finally {
      setClearing(false)
    }
  }

  async function handleForceTick() {
    setForcing(true)
    try {
      await api.adminForceQueueTick()  // progresso aparece via onSnapshot
    } catch (err) {
      console.error('Erro no force tick:', err)
      alert('Erro: ' + (err as Error).message)
    } finally {
      setForcing(false)
    }
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {isOpen ? (
              <span className="spin" style={spinnerDotStyle} />
            ) : isCompleted ? (
              <Check size={20} color="#16a34a" />
            ) : (
              <Clock size={20} color="#6b7280" />
            )}
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
                {isOpen ? 'Processamento em andamento' : isCompleted ? 'Processamento concluido' : isPaused ? 'Fila pausada' : 'Fila de processamento'}
              </div>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                {queue ? `${done} de ${totalDocs} concluidos - ${errors} erros` : 'Nenhuma fila ativa'}
              </div>
            </div>
          </div>
          <button onClick={onClose} style={closeBtnStyle} title="Fechar (processamento continua em background)">
            <X size={18} />
          </button>
        </div>

        {queue && (
          <>
            <div style={progressBarOuterStyle}>
              <div style={{ ...progressBarInnerStyle, width: `${progress}%` }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6b7280', margin: '4px 16px 0' }}>
              <span>{progress}% completo</span>
              <span>Iniciado: {formatTime(queue.startedAt)} - Ultima atualizacao: {formatTime(queue.lastTickAt)}</span>
            </div>

            {currentDoc && (
              <div style={currentDocStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#1e40af', textTransform: 'uppercase' }}>
                    Processando agora
                  </span>
                  {currentDoc.processingState.step === 'error' ? (
                    <AlertCircle size={14} color="#dc2626" />
                  ) : (
                    <span className="spin" style={spinnerDotStyle} />
                  )}
                </div>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {currentDoc.fileName || currentDoc.id}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                  <span style={stepBadgeStyle(currentDoc.processingState.step)}>
                    {currentDoc.processingState.stepLabel}
                  </span>
                  {currentDoc.processingState.stepStartedAt && currentDoc.processingState.step !== 'completed' && currentDoc.processingState.step !== 'error' && currentDoc.processingState.step !== 'queued' && (
                    <span style={{ fontSize: 11, color: '#6b7280' }}>
                      ha {formatDuration(currentDoc.processingState.stepStartedAt, now)}
                    </span>
                  )}
                </div>
                {currentDoc.processingState.error && (
                  <div style={errorBoxStyle}>
                    <strong>Erro no step {currentDoc.processingState.failedStep}:</strong> {currentDoc.processingState.error}
                  </div>
                )}
              </div>
            )}

            <div style={pipelineStyle}>
              {STEP_ORDER.map((step, idx) => (
                <div key={step} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                  <PipelineStep step={step} doc={currentDoc} label={STEP_LABELS[step]} />
                  {idx < STEP_ORDER.length - 1 && <div style={pipelineArrowStyle}>-</div>}
                </div>
              ))}
            </div>

            <div style={{ margin: '16px 16px 0' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', marginBottom: 8 }}>
                Fila ({docs.length} docs visiveis)
              </div>
              <div style={queueListStyle}>
                {docs.length === 0 ? (
                  <div style={{ padding: 12, fontSize: 13, color: '#6b7280', textAlign: 'center' }}>
                    Nenhum documento na fila.
                  </div>
                ) : (
                  docs.map((d) => {
                    const isCurrent = d.id === queue.currentDocId
                    const idxCurrent = queue.docIds.indexOf(queue.currentDocId || '')
                    const idxThis = queue.docIds.indexOf(d.id)
                    const isPast = idxThis < idxCurrent
                    return (
                      <div key={d.id} style={queueItemStyle(isCurrent)}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                          {d.processingState.step === 'completed' ? (
                            <Check size={14} color="#16a34a" />
                          ) : d.processingState.step === 'error' ? (
                            <AlertCircle size={14} color="#dc2626" />
                          ) : isCurrent ? (
                            <span className="spin" style={spinnerDotStyle} />
                          ) : (
                            <Clock size={14} color="#9ca3af" />
                          )}
                          <span style={{ fontSize: 12, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {d.fileName || d.id}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={stepBadgeStyle(d.processingState.step)}>
                            {d.processingState.step === 'completed' ? 'OK' :
                             d.processingState.step === 'error' ? 'Erro' :
                             isCurrent ? 'Processando' :
                             isPast ? 'Aguardando' : 'Na fila'}
                          </span>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            <div style={actionsStyle}>
              <button onClick={handleForceTick} disabled={forcing} style={{ ...btnStyle, color: '#1a4d8f', borderColor: '#1a4d8f' }}>
                <RefreshCw size={14} className={forcing ? 'spin' : ''} />
                {forcing ? 'Forcando...' : 'Forcar proxima etapa'}
              </button>
              <button onClick={handleClear} disabled={clearing} style={{ ...btnStyle, color: '#dc2626', borderColor: '#dc2626' }}>
                <Trash2 size={14} />
                {clearing ? 'Limpando...' : 'Limpar fila'}
              </button>
              <div style={{ fontSize: 11, color: '#9ca3af', marginLeft: 'auto' }}>
                O processamento continua mesmo se você fechar esta janela.
              </div>
            </div>
          </>
        )}

        {!queue && (
          <div style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>
            Nenhum documento esta sendo processado. Use o botao &ldquo;Re-analisar&rdquo; acima para iniciar.
          </div>
        )}
      </div>
    </div>
  )
}

function PipelineStep({ step, doc, label }: { step: Step; doc?: DocStatus; label: string }) {
  if (!doc) return null
  const currentStep = doc.processingState.step
  const currentIdx = currentStep === 'completed' ? STEP_ORDER.length : STEP_ORDER.indexOf(currentStep as Step)
  const thisIdx = STEP_ORDER.indexOf(step)

  let bg: string, fg: string, border: string, content: ReactNode
  if (currentStep === 'completed' || currentIdx > thisIdx) {
    bg = '#dcfce7'; fg = '#166534'; border = '#86efac'
    content = <Check size={14} />
  } else if (currentStep === 'error' && doc.processingState.failedStep === step) {
    bg = '#fee2e2'; fg = '#991b1b'; border = '#fca5a5'
    content = <AlertCircle size={14} />
  } else if (currentIdx === thisIdx && currentStep !== 'error' && currentStep !== 'queued') {
    bg = '#dbeafe'; fg = '#1e40af'; border = '#93c5fd'
    content = <span className="spin" style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%' }} />
  } else {
    bg = '#f3f4f6'; fg = '#9ca3af'; border = '#e5e7eb'
    content = <Clock size={14} />
  }
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', background: bg, color: fg, border: `2px solid ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {content}
      </div>
      <div style={{ fontSize: 11, color: '#374151', fontWeight: 500, textAlign: 'center' }}>{label}</div>
    </div>
  )
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
}
const modalStyle: React.CSSProperties = {
  background: '#ffffff', borderRadius: 12, width: 'min(720px, 96vw)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden',
}
const headerStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottom: '1px solid #e5e7eb',
}
const closeBtnStyle: React.CSSProperties = {
  background: 'transparent', border: 'none', padding: 8, cursor: 'pointer', color: '#6b7280', borderRadius: 4,
}
const spinnerDotStyle: React.CSSProperties = {
  display: 'inline-block', width: 14, height: 14, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%',
}
const progressBarOuterStyle: React.CSSProperties = {
  width: 'calc(100% - 32px)', height: 8, background: '#f1f5f9', borderRadius: 4, margin: '12px 16px 0', overflow: 'hidden',
}
const progressBarInnerStyle: React.CSSProperties = {
  height: '100%', background: 'linear-gradient(90deg, #1a4d8f, #16a34a)', transition: 'width 0.3s ease',
}
const currentDocStyle: React.CSSProperties = {
  margin: '16px 16px 0', padding: 12, background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8,
}
const errorBoxStyle: React.CSSProperties = {
  marginTop: 8, padding: 8, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, color: '#991b1b',
}
const pipelineStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '20px 16px 0', padding: 12, background: '#f8fafc', borderRadius: 8, gap: 8,
}
const pipelineArrowStyle: React.CSSProperties = {
  fontSize: 18, color: '#9ca3af', fontWeight: 700,
}
const queueListStyle: React.CSSProperties = {
  border: '1px solid #e5e7eb', borderRadius: 8, maxHeight: 240, overflowY: 'auto',
}
const queueItemStyle = (isCurrent: boolean): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid #f3f4f6', background: isCurrent ? '#eff6ff' : 'transparent', fontSize: 12,
})
const stepBadgeStyle = (step: Step): React.CSSProperties => {
  const colors: Record<Step, { bg: string; fg: string; border: string }> = {
    idle: { bg: '#f3f4f6', fg: '#6b7280', border: '#e5e7eb' },
    queued: { bg: '#fef3c7', fg: '#92400e', border: '#fcd34d' },
    json_creating: { bg: '#dbeafe', fg: '#1e40af', border: '#93c5fd' },
    classifying: { bg: '#e0e7ff', fg: '#3730a3', border: '#a5b4fc' },
    key_points_extracting: { bg: '#f3e8ff', fg: '#6b21a8', border: '#c4b5fd' },
    ementa_generating: { bg: '#fae8ff', fg: '#86198f', border: '#e9d5ff' },
    completed: { bg: '#dcfce7', fg: '#166534', border: '#86efac' },
    error: { bg: '#fee2e2', fg: '#991b1b', border: '#fca5a5' },
  }
  const c = colors[step] || colors.queued
  return {
    display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 12, fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap',
    background: c.bg, color: c.fg, border: `1px solid ${c.border}`,
  }
}
const actionsStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, padding: 16, borderTop: '1px solid #e5e7eb', flexWrap: 'wrap', marginTop: 16,
}
const btnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer', background: 'transparent', border: '1px solid', fontFamily: 'inherit',
}
