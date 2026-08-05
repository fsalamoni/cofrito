/**
 * TypingIndicator — indicador de "digitando...".
 */
import { AgentAvatar } from './AgentAvatar'

export function TypingIndicator() {
  return (
    <div className="cofrito-typing" role="status" aria-label="Cofrito está digitando">
      <AgentAvatar size="sm" state="thinking" />
      <div className="cofrito-typing-bubble">
        <span />
        <span />
        <span />
      </div>
    </div>
  )
}
