/**
 * SettingsPage — configurações pessoais do usuário.
 *
 * Acesso: #/settings
 */
import { useAuth } from '@/hooks/useAuth'
import { useAuthStore } from '@/stores/authStore'
import { LLMSettings } from '@/components/AgentWidget/settings/LLMSettings'
import { UserAgentsConfig } from '@/components/AgentWidget/settings/UserAgentsConfig'
import { AgentWidget } from '@/components/AgentWidget'
import { useChatStore } from '@/stores/chatStore'
import { LogOut, MessageCircle, User as UserIcon } from 'lucide-react'

export function SettingsPage() {
  const { user, signOut } = useAuth()
  const userProfile = useAuthStore((s) => s.user)
  const openChat = useChatStore((s) => s.open)

  if (!user) {
    return (
      <div style={emptyStateStyle}>
        <h1 style={{ fontSize: 24, color: '#0f172a' }}>Faça login</h1>
        <p style={{ color: '#6b7280' }}>Você precisa estar logado para acessar as configurações.</p>
        <a href="/" style={backLinkStyle}>← Voltar</a>
      </div>
    )
  }

  return (
    <div style={layoutStyle}>
      <AgentWidget />

      <header style={topBarStyle}>
        <div style={topBarLeftStyle}>
          <UserIcon size={28} color="#1a4d8f" />
          <div>
            <h1 style={topBarTitleStyle}>Configurações</h1>
            <p style={topBarSubtitleStyle}>
              {userProfile?.displayName || user.email}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={openChat} style={openChatBtnStyle}>
            <MessageCircle size={14} />
            <span>Abrir chat</span>
          </button>
          <a href="/" style={backLinkStyle}>← Voltar ao site</a>
          <button onClick={signOut} style={signOutBtnStyle}>
            <LogOut size={14} />
            <span>Sair</span>
          </button>
        </div>
      </header>

      <main style={mainStyle}>
        <h2 style={sectionTitleStyle}>Provedor de IA</h2>
        <p style={sectionDescStyle}>
          Escolha qual LLM o Cofrito vai usar para gerar respostas. Você pode usar
          o Google Gemini do projeto ou sua própria API key de qualquer provedor
          (OpenAI, Anthropic, OpenRouter, etc.).
        </p>
        <LLMSettings />

        <h2 style={{ ...sectionTitleStyle, marginTop: 32 }}>Modelos por agente (opcional)</h2>
        <p style={sectionDescStyle}>
          Se quiser, escolha um modelo diferente para cada agente. Caso contrário,
          todos usam a sua configuração pessoal acima.
        </p>
        <UserAgentsConfig />
      </main>
    </div>
  )
}

const layoutStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: '#f8fafc',
}

const emptyStateStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 12,
  textAlign: 'center',
}

const backLinkStyle: React.CSSProperties = {
  marginTop: 16,
  color: '#1a4d8f',
  textDecoration: 'none',
  fontSize: 14,
  fontWeight: 500,
}

const topBarStyle: React.CSSProperties = {
  background: '#ffffff',
  borderBottom: '1px solid #e5e7eb',
  padding: '12px 24px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  position: 'sticky',
  top: 0,
  zIndex: 100,
}

const topBarLeftStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
}

const topBarTitleStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  color: '#0f172a',
  margin: 0,
}

const topBarSubtitleStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#6b7280',
  margin: 0,
}

const openChatBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  background: '#1a4d8f',
  color: '#ffffff',
  border: 'none',
  borderRadius: 6,
  padding: '6px 10px',
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const signOutBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  background: 'transparent',
  color: '#6b7280',
  border: '1px solid #e5e7eb',
  borderRadius: 6,
  padding: '5px 10px',
  fontSize: 12,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const mainStyle: React.CSSProperties = {
  maxWidth: 720,
  margin: '0 auto',
  padding: 32,
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 700,
  color: '#0f172a',
  margin: '0 0 4px',
}

const sectionDescStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#6b7280',
  margin: '0 0 24px',
  lineHeight: 1.5,
}
