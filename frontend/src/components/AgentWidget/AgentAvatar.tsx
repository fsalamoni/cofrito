/**
 * AgentAvatar — mascote do Cofrito.
 *
 * Sem moldura circular: imagem em quadrado transparente.
 * Suporta tamanhos grandes (até 320px).
 */
import { motion } from 'framer-motion'
import cofritoImg from '@/assets/cofrito/cofrito.png'

export type AgentState = 'idle' | 'thinking' | 'error' | 'happy'

interface AgentAvatarProps {
  state?: AgentState
  /** Tamanho em pixels. */
  size?: number
  className?: string
  /** Quando true, aplica fundo transparente (sem nada ao redor). */
  transparent?: boolean
}

export function AgentAvatar({
  state = 'idle',
  size = 120,
  className = '',
  transparent = true,
}: AgentAvatarProps) {
  return (
    <motion.img
      src={cofritoImg}
      alt="Cofrito"
      width={size}
      height={size}
      animate={
        state === 'thinking'
          ? { y: [0, -4, 0] }
          : state === 'happy'
            ? { rotate: [0, -5, 5, 0] }
            : { y: 0, rotate: 0 }
      }
      transition={
        state === 'thinking'
          ? { duration: 1.2, repeat: Infinity }
          : { duration: 0.5 }
      }
      className={`cofrito-avatar-img ${className}`}
      style={{
        width: size,
        height: size,
        maxWidth: 'none',
        display: 'block',
        // Sem background, sem border, sem border-radius
        // Imagem flutua limpa com fundo transparente
        background: transparent ? 'transparent' : undefined,
        border: 'none',
        borderRadius: 0,
      }}
      draggable={false}
    />
  )
}
