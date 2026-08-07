/**
 * AgentAvatar — mascote do Cofrito com estados.
 */
import { motion } from 'framer-motion'
import cofritoImg from '@/assets/cofrito/cofrito.png'

export type AgentState = 'idle' | 'thinking' | 'error' | 'happy'

interface AgentAvatarProps {
  state?: AgentState
  /** Tamanho em pixels OU uma chave predefinida. */
  size?: number | 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const SIZES: Record<'sm' | 'md' | 'lg' | 'xl', number> = {
  sm: 40,
  md: 80,
  lg: 120,
  xl: 200,
}

export function AgentAvatar({ state = 'idle', size = 'md', className = '' }: AgentAvatarProps) {
  const px = typeof size === 'number' ? size : SIZES[size]
  return (
    <motion.img
      src={cofritoImg}
      alt="Cofrito"
      width={px}
      height={px}
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
      style={{ width: px, height: 'auto', maxWidth: 'none' }}
      draggable={false}
    />
  )
}
