/**
 * AgentWidget — componente principal do widget do Cofrito.
 *
 * Pode ser usado:
 * 1. Como Web Component (via widget-entry.tsx) — para embed em página externa
 * 2. Diretamente no portal admin — para desenvolvimento
 */
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, History, Plus } from 'lucide-react'
import { useChatStore } from '@/stores/chatStore'
import { useAuth } from '@/hooks/useAuth'
import { ChatPanel } from './ChatPanel'
import { AgentAvatar } from './AgentAvatar'
import cofritoImg from '@/assets/cofrito/cofrito.png'
import { t } from '@/i18n/config'

interface AgentWidgetProps {
  tenant?: string
  position?: 'bottom-right' | 'bottom-left' | 'bottom-center'
  locale?: string
  defaultOpen?: boolean
}

export function AgentWidget({
  tenant: _tenant = 'caocipp',
  position = 'bottom-right',
  locale: _locale = 'pt-BR',
  defaultOpen = false,
}: AgentWidgetProps) {
  const { isOpen, isInitialized, init, open, close, toggle } = useChatStore()
  const { user } = useAuth()
  const [hasAppeared, setHasAppeared] = useState(false)

  useEffect(() => {
    if (!isInitialized) init(defaultOpen)
  }, [isInitialized, init, defaultOpen])

  // Aparece 2s após carregar (animação suave)
  useEffect(() => {
    const timer = setTimeout(() => setHasAppeared(true), 2000)
    return () => clearTimeout(timer)
  }, [])

  // Eventos programáticos
  useEffect(() => {
    const onOpen = () => open()
    const onClose = () => close()
    window.addEventListener('cofrito:open', onOpen)
    window.addEventListener('cofrito:close', onClose)
    return () => {
      window.removeEventListener('cofrito:open', onOpen)
      window.removeEventListener('cofrito:close', onClose)
    }
  }, [open, close])

  if (!hasAppeared && !isOpen) return null

  return (
    <>
      {/* Botão flutuante */}
      <AnimatePresence>
        {!isOpen && hasAppeared && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
            onClick={toggle}
            aria-label={t('widget.open')}
            className="cofrito-fab"
          >
            <img src={cofritoImg} alt="Cofrito" className="cofrito-fab-img" />
            <span className="cofrito-fab-dot" aria-hidden="true" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Painel de chat */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ y: 20, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 20, opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={`cofrito-panel cofrito-panel--${position}`}
            role="dialog"
            aria-label={t('widget.title')}
            aria-modal="false"
          >
            <header className="cofrito-header">
              <AgentAvatar size="sm" />
              <div className="cofrito-header-info">
                <h3 className="cofrito-header-title">Cofrito</h3>
                <p className="cofrito-header-status">
                  <span className="cofrito-status-dot" aria-hidden="true" />
                  {user ? t('widget.online') : t('widget.guest')}
                </p>
              </div>
              <div className="cofrito-header-actions">
                <button
                  className="cofrito-icon-btn"
                  onClick={() => (window.location.hash = '#/historico')}
                  aria-label={t('widget.history')}
                  title={t('widget.history')}
                >
                  <History size={16} />
                </button>
                <button
                  className="cofrito-icon-btn"
                  onClick={() => useChatStore.getState().startNewConversation()}
                  aria-label={t('widget.newConversation')}
                  title={t('widget.newConversation')}
                >
                  <Plus size={16} />
                </button>
                <button
                  className="cofrito-icon-btn"
                  onClick={close}
                  aria-label={t('widget.close')}
                  title={t('widget.close')}
                >
                  <X size={16} />
                </button>
              </div>
            </header>
            <ChatPanel />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
