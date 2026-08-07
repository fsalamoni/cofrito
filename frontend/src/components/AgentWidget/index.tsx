/**
 * AgentWidget — painel flutuante e arrastável.
 *
 * - Aparece inicialmente como botão redondo (FAB) no canto inferior direito
 * - Ao abrir, vira um painel retangular (380×560) que pode ser arrastado
 *   pela barra de header para qualquer lugar da tela
 * - Posição é persistida em localStorage
 * - Pode ser minimizado (volta ao FAB) ou fechado (some)
 * - Funciona sobre qualquer página sem atrapalhar a navegação
 */
import { useEffect, useRef, useState } from 'react'
import { X, Plus, GripVertical } from 'lucide-react'
import { useChatStore } from '@/stores/chatStore'
import { ChatPanel } from './ChatPanel'
import { AgentAvatar } from './AgentAvatar'
import { t } from '@/i18n/config'

interface AgentWidgetProps {
  tenant?: string
  locale?: string
  defaultOpen?: boolean
}

interface Position {
  x: number  // offset from right (px)
  y: number  // offset from top (px)
}

const POSITION_STORAGE_KEY = 'cofrito:widgetPosition'
const DEFAULT_POSITION: Position = { x: 24, y: 24 }
const FAB_SIZE = 64
const PANEL_WIDTH = 400
const PANEL_HEIGHT = 600

export function AgentWidget({
  tenant,
  locale = 'pt-BR',
  defaultOpen = false,
}: AgentWidgetProps) {
  const isOpen = useChatStore((s) => s.isOpen)
  const open = useChatStore((s) => s.open)
  const close = useChatStore((s) => s.close)
  const restart = useChatStore((s) => s.startNewConversation)
  const conversationsCount = useChatStore((s) => s.conversations.length)

  const [pos, setPos] = useState<Position>(() => loadPosition())
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null)
  const widgetRef = useRef<HTMLDivElement>(null)

  // Inicializa se vier com defaultOpen
  useEffect(() => {
    if (defaultOpen && !isOpen) open()
  }, [defaultOpen, isOpen, open])

  // Persiste posição
  useEffect(() => {
    if (isOpen) {
      try {
        window.localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(pos))
      } catch { /* ignore */ }
    }
  }, [pos, isOpen])

  // Limites da tela
  function clampPosition(p: Position): Position {
    if (typeof window === 'undefined') return p
    const maxX = window.innerWidth - (isOpen ? PANEL_WIDTH : FAB_SIZE) - 8
    const maxY = window.innerHeight - (isOpen ? PANEL_HEIGHT : FAB_SIZE) - 8
    return {
      x: Math.max(8, Math.min(p.x, maxX)),
      y: Math.max(8, Math.min(p.y, maxY)),
    }
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (!isOpen) return
    e.preventDefault()
    setDragging(true)
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPosX: pos.x,
      startPosY: pos.y,
    }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragging || !dragRef.current) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    // Como pos.x é offset da direita, mover pra direita aumenta x
    const newX = dragRef.current.startPosX - dx
    const newY = dragRef.current.startPosY + dy
    setPos(clampPosition({ x: newX, y: newY }))
  }

  function handlePointerUp(e: React.PointerEvent) {
    if (!dragging) return
    setDragging(false)
    dragRef.current = null
    try {
      ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
    } catch { /* ignore */ }
  }

  // Quando a janela redimensiona, mantém dentro dos limites
  useEffect(() => {
    if (!isOpen) return
    const handler = () => setPos((p) => clampPosition(p))
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [isOpen])

  const widgetStyle: React.CSSProperties = isOpen
    ? {
        position: 'fixed',
        right: pos.x,
        top: pos.y,
        width: PANEL_WIDTH,
        height: PANEL_HEIGHT,
        zIndex: 9999,
        // Sombra generosa pra parecer "flutuante"
        boxShadow: '0 24px 48px -8px rgba(15, 23, 42, 0.25), 0 8px 16px -4px rgba(15, 23, 42, 0.15)',
        borderRadius: 16,
        background: '#ffffff',
        border: '1px solid rgba(15, 23, 42, 0.08)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        // Animação suave de entrada
        animation: 'cofrito-widget-in 200ms cubic-bezier(0.16, 1, 0.3, 1)',
      }
    : {
        position: 'fixed',
        right: pos.x,
        bottom: pos.y,
        width: FAB_SIZE,
        height: FAB_SIZE,
        zIndex: 9999,
        cursor: 'pointer',
        // Sombra circular característica de FAB
        boxShadow: '0 8px 24px -4px rgba(26, 77, 143, 0.4), 0 4px 8px -2px rgba(26, 77, 143, 0.2)',
        borderRadius: '50%',
        // Animação de pulse para chamar atenção
        animation: 'cofrito-fab-in 240ms cubic-bezier(0.16, 1, 0.3, 1)',
      }

  return (
    <div ref={widgetRef} style={widgetStyle} data-cofrito-widget data-tenant={tenant}>
      <style>{keyframesCss}</style>

      {isOpen ? (
        // Painel aberto
        <>
          {/* Header arrastável */}
          <div
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={{
              background: 'linear-gradient(135deg, #1a4d8f 0%, #5B7CFA 100%)',
              color: '#ffffff',
              padding: '14px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              cursor: dragging ? 'grabbing' : 'grab',
              userSelect: 'none',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
              <div style={{ flexShrink: 0 }}>
                <AgentAvatar size={36} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.2 }}>Cofrito</div>
                <div style={{ fontSize: 11, opacity: 0.85, lineHeight: 1.2, marginTop: 2 }}>
                  Assistente do CAOCIPP
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              <button
                onClick={(e) => { e.stopPropagation(); restart() }}
                title="Nova conversa"
                style={iconButtonStyle}
                aria-label="Nova conversa"
              >
                <Plus size={16} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); close() }}
                title="Minimizar"
                style={iconButtonStyle}
                aria-label="Fechar"
              >
                <X size={16} />
              </button>
              <div style={{ ...iconButtonStyle, cursor: 'grab', pointerEvents: 'none' }} aria-hidden>
                <GripVertical size={14} />
              </div>
            </div>
          </div>

          {/* Body */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#f8fafc' }}>
            <ChatPanel />
          </div>
        </>
      ) : (
        // FAB (botão flutuante)
        <button
          onClick={open}
          aria-label={t('widget.open' as any, locale) || 'Abrir Cofrito'}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            borderRadius: '50%',
            cursor: 'pointer',
            background: 'transparent',
            padding: 0,
            position: 'relative',
          }}
        >
          <AgentAvatar size={FAB_SIZE} />
          {conversationsCount > 0 && (
            <span
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                background: '#ef4444',
                color: '#ffffff',
                fontSize: 11,
                fontWeight: 600,
                minWidth: 20,
                height: 20,
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 5px',
                border: '2px solid #ffffff',
              }}
            >
              {conversationsCount}
            </span>
          )}
        </button>
      )}
    </div>
  )
}

function loadPosition(): Position {
  if (typeof window === 'undefined') return DEFAULT_POSITION
  try {
    const raw = window.localStorage.getItem(POSITION_STORAGE_KEY)
    if (!raw) return DEFAULT_POSITION
    const parsed = JSON.parse(raw)
    if (
      typeof parsed.x === 'number' &&
      typeof parsed.y === 'number' &&
      Number.isFinite(parsed.x) &&
      Number.isFinite(parsed.y)
    ) {
      return parsed
    }
  } catch { /* ignore */ }
  return DEFAULT_POSITION
}

const iconButtonStyle: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.15)',
  border: 'none',
  color: '#ffffff',
  width: 30,
  height: 30,
  borderRadius: 6,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
}

const keyframesCss = `
@keyframes cofrito-widget-in {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes cofrito-fab-in {
  from {
    opacity: 0;
    transform: scale(0.6);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes cofrito-fab-pulse {
  0%, 100% { box-shadow: 0 8px 24px -4px rgba(26, 77, 143, 0.4), 0 4px 8px -2px rgba(26, 77, 143, 0.2), 0 0 0 0 rgba(91, 124, 250, 0.5); }
  50% { box-shadow: 0 8px 24px -4px rgba(26, 77, 143, 0.4), 0 4px 8px -2px rgba(26, 77, 143, 0.2), 0 0 0 16px rgba(91, 124, 250, 0); }
}
`
