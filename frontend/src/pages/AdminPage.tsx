/**
 * AdminPage — painel administrativo para master admin.
 *
 * Rotas internas via hash:
 *  - #/admin          → este painel
 *  - #/admin/llm      → config de LLM global
 *  - #/admin/users    → usuários com config pessoal
 *  - #/admin/admins   → gerenciar admins
 *  - #/admin/audit    → auditoria (placeholder)
 */
import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useIsAdminMaster } from '@/hooks/useAdminStatus'
import { AdminSettings } from '@/components/AgentWidget/settings/AdminSettings'
import { AgentAvatar } from '@/components/AgentWidget/AgentAvatar'
import { AgentWidget } from '@/components/AgentWidget'
import { useChatStore } from '@/stores/chatStore'
import { LogOut, MessageCircle, Shield, Globe, Users, FileText } from 'lucide-react'

type AdminTab = 'llm' | 'users' | 'admins' | 'audit'

export function AdminPage() {
  const { user, signOut } = useAuth()
  const isAdminMaster = useIsAdminMaster()
  const openChat = useChatStore((s) => s.open)
  const [tab, setTab] = useState<AdminTab>('llm')
  const [hash, setHash] = useState(window.location.hash)

  useEffect(() => {
    const handler = () => setHash(window.location.hash)
    window.addEventListener('hashchange', handler)
    return () => window.removeEventListener('hashchange', handler)
  }, [])

  useEffect(() => {
    if (hash === '#/admin/users') setTab('users')
    else if (hash === '#/admin/admins') setTab('admins')
    else if (hash === '#/admin/audit') setTab('audit')
    else setTab('llm')
  }, [hash])

  if (!user) {
    return (
      <div style={containerStyle}>
        <div style={emptyStateStyle}>
          <h1 style={{ fontSize: 24, color: '#0f172a' }}>Acesso restrito</h1>
          <p style={{ color: '#6b7280' }}>Faça login para acessar o painel administrativo.</p>
          <a href="/" style={backLinkStyle}>← Voltar</a>
        </div>
      </div>
    )
  }

  if (!isAdminMaster) {
    return (
      <div style={containerStyle}>
        <div style={emptyStateStyle}>
          <Shield size={48} color="#9ca3af" />
          <h1 style={{ fontSize: 24, color: '#0f172a', marginTop: 16 }}>
            Acesso restrito a administradores master
          </h1>
          <p style={{ color: '#6b7280', maxWidth: 480, textAlign: 'center' }}>
            Este painel é exclusivo para usuários com permissão de <strong>master admin</strong>.
            Se você precisa de acesso, solicite ao administrador master da plataforma.
          </p>
          <a href="/" style={backLinkStyle}>← Voltar ao site</a>
        </div>
      </div>
    )
  }

  return (
    <div style={layoutStyle}>
      <AgentWidget />

      {/* Top bar */}
      <header style={topBarStyle}>
        <div style={topBarLeftStyle}>
          <AgentAvatar size={48} />
          <div>
            <h1 style={topBarTitleStyle}>Painel Administrativo</h1>
            <p style={topBarSubtitleStyle}>Cofrito · Master Admin</p>
          </div>
        </div>
        <div style={topBarRightStyle}>
          <button
            onClick={openChat}
            style={openChatBtnStyle}
            title="Abrir chat do Cofrito"
          >
            <MessageCircle size={14} />
            <span>Chat</span>
          </button>
          <a href="/" style={backToSiteLinkStyle}>← Voltar ao site</a>
          <button onClick={signOut} style={signOutBtnStyle} title="Sair">
            <LogOut size={14} />
            <span>Sair</span>
          </button>
        </div>
      </header>

      <div style={mainLayoutStyle}>
        {/* Sidebar */}
        <aside style={sidebarStyle}>
          <SidebarItem
            icon={<Globe size={16} />}
            label="LLM Global"
            active={tab === 'llm'}
            onClick={() => { window.location.hash = '#/admin'; setTab('llm') }}
            hint="Define a LLM padrão para todos os usuários"
          />
          <SidebarItem
            icon={<Users size={16} />}
            label="Usuários"
            active={tab === 'users'}
            onClick={() => { window.location.hash = '#/admin/users'; setTab('users') }}
            hint="Quem configurou LLM pessoal"
          />
          <SidebarItem
            icon={<Shield size={16} />}
            label="Administradores"
            active={tab === 'admins'}
            onClick={() => { window.location.hash = '#/admin/admins'; setTab('admins') }}
            hint="Gerenciar admins e masters"
          />
          <SidebarItem
            icon={<FileText size={16} />}
            label="Auditoria"
            active={tab === 'audit'}
            onClick={() => { window.location.hash = '#/admin/audit'; setTab('audit') }}
            hint="Logs de uso (em breve)"
            disabled
          />
        </aside>

        {/* Content */}
        <main style={contentStyle}>
          {tab === 'llm' && (
            <>
              <h2 style={pageTitleStyle}>Configuração de LLM Global</h2>
              <p style={pageDescStyle}>
                Quando definida, todos os usuários passam a usar esta LLM.
                A configuração pessoal fica oculta.
              </p>
              <AdminSettings />
            </>
          )}
          {tab === 'users' && <UsersWithLLM />}
          {tab === 'admins' && <AdminsTab />}
          {tab === 'audit' && <AuditPlaceholder />}
        </main>
      </div>
    </div>
  )
}

function SidebarItem({ icon, label, active, onClick, hint, disabled }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void; hint?: string; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...sidebarItemStyle,
        ...(active ? sidebarItemActiveStyle : {}),
        ...(disabled ? sidebarItemDisabledStyle : {}),
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {icon}
        <span style={{ fontSize: 13, fontWeight: 500 }}>{label}</span>
      </div>
      {hint && <span style={sidebarItemHintStyle}>{hint}</span>}
    </button>
  )
}

function UsersWithLLM() {
  const [users, setUsers] = useState<Array<{ uid: string; displayName: string; email: string; config: any }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadUsers()
  }, [])

  async function loadUsers() {
    setLoading(true)
    setError(null)
    try {
      const { api } = await import('@/lib/api')
      const result = await api.adminListUserLLM()
      setUsers(result.data)
    } catch (err: any) {
      setError(err.message ?? 'Erro ao listar usuários')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <h2 style={pageTitleStyle}>Usuários com LLM pessoal</h2>
      <p style={pageDescStyle}>
        Lista de usuários que configuraram seu próprio provedor de IA.
        Quando a LLM global está setada, a config pessoal é ignorada.
      </p>
      {loading && <div style={{ padding: 24, textAlign: 'center' }}>Carregando...</div>}
      {error && (
        <div style={{ padding: 12, background: '#fee2e2', color: '#991b1b', borderRadius: 8 }}>
          {error}
          <button onClick={loadUsers} style={{ marginLeft: 8, padding: '4px 10px', background: '#dc2626', color: '#ffffff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
            Tentar
          </button>
        </div>
      )}
      {!loading && !error && users.length === 0 && (
        <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>
          Nenhum usuário configurou LLM pessoal ainda.
        </div>
      )}
      {!loading && users.length > 0 && (
        <div style={{ display: 'grid', gap: 8 }}>
          {users.map((u) => (
            <div key={u.uid} style={userCardStyle}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#0f172a' }}>
                  {u.displayName || u.email || u.uid.slice(0, 8)}
                </div>
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{u.email}</div>
              </div>
              <div style={userProviderBadgeStyle}>
                <strong>{u.config.provider}</strong>
                <span style={{ color: '#6b7280' }}>· {u.config.model}</span>
              </div>
              <div style={{ fontSize: 10, color: '#9ca3af', fontFamily: 'monospace' }}>
                {u.config.apiKey ? u.config.apiKey.slice(0, 4) + '••••' : 'sem key'}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

function AdminsTab() {
  return (
    <>
      <h2 style={pageTitleStyle}>Administradores</h2>
      <p style={pageDescStyle}>
        Gerencie quem tem acesso a áreas administrativas.
        Conceda ou revogue permissões de admin ou master.
      </p>
      <AdminSettings />
    </>
  )
}

function AuditPlaceholder() {
  return (
    <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>
      <FileText size={48} />
      <h2 style={{ ...pageTitleStyle, marginTop: 16 }}>Auditoria</h2>
      <p>Logs de uso e auditoria em desenvolvimento.</p>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────

const containerStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: '#f8fafc',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const layoutStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: '#f8fafc',
}

const emptyStateStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 12,
  padding: 32,
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

const topBarRightStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
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

const backToSiteLinkStyle: React.CSSProperties = {
  color: '#6b7280',
  textDecoration: 'none',
  fontSize: 12,
  fontWeight: 500,
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

const mainLayoutStyle: React.CSSProperties = {
  display: 'flex',
  maxWidth: 1280,
  margin: '0 auto',
  minHeight: 'calc(100vh - 73px)',
}

const sidebarStyle: React.CSSProperties = {
  width: 260,
  flexShrink: 0,
  background: '#ffffff',
  borderRight: '1px solid #e5e7eb',
  padding: 16,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
}

const sidebarItemStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  background: 'transparent',
  border: 'none',
  borderRadius: 8,
  padding: 10,
  cursor: 'pointer',
  textAlign: 'left',
  fontFamily: 'inherit',
  color: '#0f172a',
  transition: 'background 0.1s',
}

const sidebarItemActiveStyle: React.CSSProperties = {
  background: '#eef2ff',
  color: '#1a4d8f',
}

const sidebarItemDisabledStyle: React.CSSProperties = {
  opacity: 0.4,
  cursor: 'not-allowed',
}

const sidebarItemHintStyle: React.CSSProperties = {
  fontSize: 10,
  color: '#9ca3af',
  marginLeft: 24,
}

const contentStyle: React.CSSProperties = {
  flex: 1,
  padding: 32,
  overflow: 'auto',
  minWidth: 0,
}

const pageTitleStyle: React.CSSProperties = {
  fontSize: 24,
  fontWeight: 700,
  color: '#0f172a',
  margin: '0 0 4px',
}

const pageDescStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#6b7280',
  margin: '0 0 20px',
}

const userCardStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: 12,
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
}

const userProviderBadgeStyle: React.CSSProperties = {
  padding: '4px 10px',
  background: '#eef2ff',
  color: '#1a4d8f',
  borderRadius: 6,
  fontSize: 12,
}
