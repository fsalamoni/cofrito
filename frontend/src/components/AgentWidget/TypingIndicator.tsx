/**
 * TypingIndicator — indicador animado "está digitando".
 */
import { AgentAvatar } from './AgentAvatar'

export function TypingIndicator() {
  return (
    <div style={containerStyle}>
      <div style={avatarStyle}>
        <AgentAvatar size={32} state="thinking" />
      </div>
      <div style={bubbleStyle}>
        <div style={dotsStyle}>
          <span style={dotStyle} />
          <span style={{ ...dotStyle, animationDelay: '0.2s' }} />
          <span style={{ ...dotStyle, animationDelay: '0.4s' }} />
        </div>
      </div>
    </div>
  )
}

const containerStyle: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  marginBottom: 16,
  alignItems: 'flex-start',
}

const avatarStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: '50%',
  flexShrink: 0,
  overflow: 'hidden',
  background: '#ffffff',
  border: '1px solid #e5e7eb',
}

const bubbleStyle: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: '4px 16px 16px 16px',
  padding: '12px 16px',
  display: 'flex',
  alignItems: 'center',
  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
}

const dotsStyle: React.CSSProperties = {
  display: 'flex',
  gap: 4,
}

const dotStyle: React.CSSProperties = {
  width: 7,
  height: 7,
  background: '#9ca3af',
  borderRadius: '50%',
  animation: 'cofrito-pulse 1.4s ease-in-out infinite',
}
