/**
 * InfoModal — botão "i" que abre um modal explicando o que é uma configuração.
 *
 * Usado em campos como "Temperatura" e "Max tokens" para que o usuário
 * não precise sair da tela pra lembrar o que cada coisa significa.
 */

import { useState, useEffect, useRef } from 'react'
import { Info, X } from 'lucide-react'

export interface InfoModalProps {
  title: string
  children: React.ReactNode
  /** Tamanho do ícone. Default 12. */
  iconSize?: number
}

export function InfoModal({ title, children, iconSize = 12 }: InfoModalProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [open])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={iconBtnStyle}
        title={`O que é ${title}?`}
        aria-label={`Informações sobre ${title}`}
      >
        <Info size={iconSize} />
      </button>
      {open && (
        <div style={overlayStyle} role="dialog" aria-modal="true" aria-label={title}>
          <div ref={ref} style={modalStyle}>
            <div style={headerStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Info size={14} color="#1a4d8f" />
                <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{title}</span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={closeBtnStyle}
                title="Fechar"
                aria-label="Fechar"
              >
                <X size={14} />
              </button>
            </div>
            <div style={bodyStyle}>{children}</div>
          </div>
        </div>
      )}
    </>
  )
}

const iconBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'transparent',
  border: '1px solid #d1d5db',
  borderRadius: '50%',
  width: 16,
  height: 16,
  color: '#6b7280',
  cursor: 'pointer',
  padding: 0,
  marginLeft: 4,
  fontFamily: 'inherit',
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15, 23, 42, 0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9999,
  padding: 16,
}

const modalStyle: React.CSSProperties = {
  background: '#ffffff',
  borderRadius: 12,
  maxWidth: 480,
  width: '100%',
  maxHeight: '85vh',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 25px 50px rgba(0, 0, 0, 0.25)',
  border: '1px solid #e5e7eb',
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 16px',
  borderBottom: '1px solid #e5e7eb',
  background: '#f8fafc',
  borderTopLeftRadius: 12,
  borderTopRightRadius: 12,
}

const closeBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  padding: 4,
  color: '#6b7280',
  display: 'flex',
  borderRadius: 4,
}

const bodyStyle: React.CSSProperties = {
  padding: 16,
  fontSize: 12,
  lineHeight: 1.6,
  color: '#374151',
  overflowY: 'auto',
}
