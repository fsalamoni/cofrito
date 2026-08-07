/**
 * AgentWidget — painel flutuante, arrastável, redimensionável.
 *
 * Estados:
 *  - FAB: apenas a imagem do Cofrito (128×128, sem moldura circular)
 *  - Painel: chat completo com header + histórico + mensagens
 *
 * Recursos:
 *  - Drag pelo header (pointer events)
 *  - Resize pelo canto inferior direito (alça SE)
 *  - Persistência de posição E tamanho em localStorage
 *  - Minimizar volta para FAB (mantém na posição atual)
 *  - Fechar também volta para FAB
 *  - Quando aberto, pode ser arrastado para qualquer canto
 */
import { useEffect, useRef, useState } from 'react'
import { X, GripVertical, History, MessageSquarePlus, Settings as SettingsIcon, ChevronLeft } from 'lucide-react'
import { useChatStore } from '@/stores/chatStore'
import { ChatPanel } from './ChatPanel'
import { AgentAvatar } from './AgentAvatar'
import { ConversationHistory } from './ConversationHistory'
import { LLMSettings } from './settings/LLMSettings'
import { AdminSettings } from './settings/AdminSettings'
import { useIsAdminMaster } from '@/hooks/useAdminStatus'

interface AgentWidgetProps {
  tenant?: string
  locale?: string
  defaultOpen?: boolean
}

interface Position { x: number; y: number }  // offset do canto direito / top
interface Size { w: number; h: number }

const POSITION_KEY = 'cofrito:widgetPosition'
const SIZE_KEY = 'cofrito:widgetSize'
const DEFAULT_POSITION: Position = { x: 32, y: 96 }
const DEFAULT_SIZE: Size = { w: 480, h: 680 }
const FAB_SIZE = 128
const MIN_W = 360
const MIN_H = 480
const MAX_W = 900
const MAX_H = 1100

export function AgentWidget({
  tenant,
  locale: _locale = 'pt-BR',
  defaultOpen = false,
}: AgentWidgetProps) {
  const isOpen = useChatStore((s) => s.isOpen)
  const open = useChatStore((s) => s.open)
  const close = useChatStore((s) => s.close)
  const restart = useChatStore((s) => s.startNewConversation)
  const isAdminMaster = useIsAdminMaster()

  const [pos, setPos] = useState<Position>(() => loadPos())
  const [size, setSize] = useState<Size>(() => loadSize())
  const [showHistory, setShowHistory] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [resizing, setResizing] = useState(false)
  const dragRef = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null)
  const resizeRef = useRef<{ sx: number; sy: number; sw: number; sh: number } | null>(null)
  const widgetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (defaultOpen && !isOpen) open()
  }, [defaultOpen, isOpen, open])

  useEffect(() => {
    if (isOpen) {
      try {
        window.localStorage.setItem(POSITION_KEY, JSON.stringify(pos))
      } catch { /* */ }
    }
  }, [pos, isOpen])

  useEffect(() => {
    if (isOpen) {
      try {
        window.localStorage.setItem(SIZE_KEY, JSON.stringify(size))
      } catch { /* */ }
    }
  }, [size, isOpen])

  function clampPos(p: Position, w: number, h: number): Position {
    if (typeof window === 'undefined') return p
    const maxX = window.innerWidth - w - 8
    const maxY = window.innerHeight - h - 8
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
      sx: e.clientX, sy: e.clientY,
      px: pos.x, py: pos.y,
    }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (dragging && dragRef.current) {
      const dx = e.clientX - dragRef.current.sx
      const dy = e.clientY - dragRef.current.sy
      setPos(clampPos({
        x: dragRef.current.px - dx,
        y: dragRef.current.py + dy,
      }, size.w, size.h))
    } else if (resizing && resizeRef.current) {
      const dx = e.clientX - resizeRef.current.sx
      const dy = e.clientY - resizeRef.current.sy
      setSize({
        w: Math.max(MIN_W, Math.min(resizeRef.current.sw + dx, MAX_W)),
        h: Math.max(MIN_H, Math.min(resizeRef.current.sh + dy, MAX_H)),
      })
    }
  }

  function handlePointerUp(e: React.PointerEvent) {
    if (dragging) {
      setDragging(false)
      dragRef.current = null
    }
    if (resizing) {
      setResizing(false)
      resizeRef.current = null
    }
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId)
    } catch { /* */ }
  }

  function handleResizeDown(e: React.PointerEvent) {
    e.preventDefault()
    e.stopPropagation()
    setResizing(true)
    resizeRef.current = { sx: e.clientX, sy: e.clientY, sw: size.w, sh: size.h }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  useEffect(() => {
    if (!isOpen) return
    const handler = () => setPos((p) => clampPos(p, size.w, size.h))
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [isOpen, size])

  // FAB: imagem do cofrito grande
  if (!isOpen) {
    return (
      <div
        ref={widgetRef}
        style={{
          position: 'fixed',
          right: pos.x,
          top: pos.y,
          width: FAB_SIZE,
          height: FAB_SIZE,
          zIndex: 9999,
          cursor: 'pointer',
        }}
        onClick={open}
        role="button"
        aria-label="Abrir Cofrito"
        data-cofrito-widget
        data-tenant={tenant}
      >
        <style>{keyframesCss}</style>
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            animation: 'cofrito-fab-in 240ms cubic-bezier(0.16, 1, 0.3, 1)',
            transition: 'transform 0.2s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.05)' }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
        >
          <AgentAvatar size={FAB_SIZE} />
        </div>
      </div>
    )
  }

  // Painel aberto (com histórico opcional)
  const showSidebar = showHistory || showSettings
  const panelWidth = showSidebar ? Math.max(size.w, 700) : size.w

  return (
    <div
      ref={widgetRef}
      style={{
        position: 'fixed',
        right: pos.x,
        top: pos.y,
        width: panelWidth,
        height: size.h,
        zIndex: 9999,
        boxShadow: '0 24px 48px -8px rgba(15, 23, 42, 0.25), 0 8px 16px -4px rgba(15, 23, 42, 0.15)',
        borderRadius: 16,
        background: '#ffffff',
        border: '1px solid rgba(15, 23, 42, 0.08)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        animation: 'cofrito-widget-in 200ms cubic-bezier(0.16, 1, 0.3, 1)',
      }}
      data-cofrito-widget
      data-tenant={tenant}
    >
      <style>{keyframesCss}</style>

      {/* Header arrastável */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          background: 'linear-gradient(135deg, #1a4d8f 0%, #5B7CFA 100%)',
          color: '#ffffff',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          cursor: dragging ? 'grabbing' : 'grab',
          userSelect: 'none',
          flexShrink: 0,
        }}
      >
        <div style={{ flexShrink: 0, marginRight: 4 }}>
          <AgentAvatar size={56} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.2 }}>Cofrito</div>
          <div style={{ fontSize: 11, opacity: 0.85, lineHeight: 1.2, marginTop: 2 }}>
            Assistente do CAOCIPP
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <button
            onClick={(e) => { e.stopPropagation(); setShowHistory((v) => !v); setShowSettings(false) }}
            title="Histórico de conversas"
            aria-label="Histórico"
            style={{ ...iconButtonStyle, ...(showHistory ? iconButtonActiveStyle : {}) }}
          >
            <History size={16} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setShowSettings((v) => !v); setShowHistory(false) }}
            title="Configurações"
            aria-label="Configurações"
            style={{ ...iconButtonStyle, ...(showSettings ? iconButtonActiveStyle : {}) }}
          >
            <SettingsIcon size={16} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); restart() }}
            title="Nova conversa"
            aria-label="Nova conversa"
            style={iconButtonStyle}
          >
            <MessageSquarePlus size={16} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); close() }}
            title="Minimizar (volta para o ícone)"
            aria-label="Minimizar"
            style={iconButtonStyle}
          >
            <X size={16} />
          </button>
          <div
            style={{ ...iconButtonStyle, cursor: 'grab', pointerEvents: 'none', opacity: 0.6 }}
            aria-hidden
          >
            <GripVertical size={14} />
          </div>
        </div>
      </div>

      {/* Body: 2 colunas (sidebar + chat) */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', background: '#f8fafc' }}>
        {/* Sidebar condicional */}
        {showSidebar && (
          <div style={{
            width: 280,
            flexShrink: 0,
            borderRight: '1px solid #e5e7eb',
            background: '#ffffff',
            display: 'flex',
            flexDirection: 'column',
          }}>
            <div style={{
              padding: '10px 12px',
              borderBottom: '1px solid #e5e7eb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <strong style={{ fontSize: 13, color: '#0f172a' }}>
                {showHistory
                  ? 'Conversas'
                  : isAdminMaster
                    ? 'Administração'
                    : 'Configurações'}
              </strong>
              <button
                onClick={() => { setShowHistory(false); setShowSettings(false) }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  padding: 4, color: '#6b7280', display: 'flex',
                }}
                title="Fechar sidebar"
              >
                <ChevronLeft size={14} />
              </button>
            </div>
            <div style={{ flex: 1, overflow: 'auto' }}>
              {showHistory ? (
                <ConversationHistory onClose={() => setShowHistory(false)} />
              ) : showSettings ? (
                isAdminMaster ? <AdminSettings /> : <LLMSettings />
              ) : null}
            </div>
          </div>
        )}

        {/* Chat principal */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <ChatPanel />
        </div>
      </div>

      {/* Resize handle (canto inferior direito) */}
      <div
        onPointerDown={handleResizeDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          position: 'absolute',
          right: 0,
          bottom: 0,
          width: 16,
          height: 16,
          cursor: 'nwse-resize',
          background: 'linear-gradient(135deg, transparent 50%, rgba(26, 77, 143, 0.3) 50%)',
        }}
        title="Arraste para redimensionar"
      />
    </div>
  )
}

function loadPos(): Position {
  if (typeof window === 'undefined') return DEFAULT_POSITION
  try {
    const raw = window.localStorage.getItem(POSITION_KEY)
    if (raw) {
      const p = JSON.parse(raw)
      if (typeof p.x === 'number' && typeof p.y === 'number') return p
    }
  } catch { /* */ }
  return DEFAULT_POSITION
}

function loadSize(): Size {
  if (typeof window === 'undefined') return DEFAULT_SIZE
  try {
    const raw = window.localStorage.getItem(SIZE_KEY)
    if (raw) {
      const s = JSON.parse(raw)
      if (typeof s.w === 'number' && typeof s.h === 'number') return s
    }
  } catch { /* */ }
  return DEFAULT_SIZE
}

const iconButtonStyle: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.15)',
  border: 'none',
  color: '#ffffff',
  width: 32,
  height: 32,
  borderRadius: 6,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
}

const iconButtonActiveStyle: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.35)',
}

const keyframesCss = `
@keyframes cofrito-widget-in {
  from { opacity: 0; transform: translateY(8px) scale(0.96); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes cofrito-fab-in {
  from { opacity: 0; transform: scale(0.6); }
  to { opacity: 1; transform: scale(1); }
}
`
