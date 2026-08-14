/* eslint-disable react/no-unescaped-entities */
/**
 * AdminPage — painel administrativo para master admin.
 *
 * Rotas internas via hash:
 *  - #/admin             → este painel (tab LLM global)
 *  - #/admin/llm         → LLM global
 *  - #/admin/documents   → upload de documentos
 *  - #/admin/paths       → configuração de pastas
 *  - #/admin/users       → usuários com config pessoal
 *  - #/admin/admins      → gerenciar admins
 *  - #/admin/audit       → auditoria (placeholder)
 */
import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useIsAdminMaster } from '@/hooks/useAdminStatus'
import { AdminSettings } from '@/components/AgentWidget/settings/AdminSettings'
import { AgentAvatar } from '@/components/AgentWidget/AgentAvatar'
import { AgentWidget } from '@/components/AgentWidget'
import { useChatStore } from '@/stores/chatStore'
import { DocumentCatalog } from './admin/DocumentCatalog'
import { AcervoPipelineConfig } from './admin/AcervoPipelineConfig'
import { AgentsConfig } from './admin/AgentsConfig'
import { LegalTaxonomyConfig } from './admin/LegalTaxonomyConfig'
import { SourcePaths } from './admin/SourcePaths'
import { ResearchConfig } from './admin/ResearchConfig'
import { WebSearchConfig } from './admin/WebSearchConfig'
import { IntranetConfig } from './admin/IntranetConfig'
import { LogOut, MessageCircle, Shield, Globe, Users, FileText, Upload, FolderTree, Activity, Search, Globe2, Building2, Tags } from 'lucide-react'

type AdminTab = 'llm' | 'documents' | 'taxonomy' | 'paths' | 'research' | 'websearch' | 'intranet' | 'users' | 'admins' | 'audit'

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
    if (hash === '#/admin/documents') setTab('documents')
    else if (hash === '#/admin/taxonomy') setTab('taxonomy')
    else if (hash === '#/admin/paths') setTab('paths')
    else if (hash === '#/admin/research') setTab('research')
    else if (hash === '#/admin/websearch') setTab('websearch')
    else if (hash === '#/admin/intranet') setTab('intranet')
    else if (hash === '#/admin/users') setTab('users')
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
          <p style={{ color: '#6b7280', maxWidth: 480, textAlign: 'center', marginTop: 8 }}>
            Este painel é exclusivo para usuários com permissão de <strong>master admin</strong>.
          </p>
          <ManualAdminGuide uid={user.uid} email={user.email ?? ''} />
          <BootstrapButton />
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
          <SidebarSection title="Modelo de IA">
            <SidebarItem
              icon={<Globe size={16} />}
              label="Configurações de LLM"
              active={tab === 'llm'}
              onClick={() => { window.location.hash = '#/admin'; setTab('llm') }}
              hint="LLM global, agentes (modelo próprio) e skills"
            />
          </SidebarSection>

          <SidebarSection title="Base de Conhecimento">
            <SidebarItem
              icon={<Upload size={16} />}
              label="Upload de Documentos"
              active={tab === 'documents'}
              onClick={() => { window.location.hash = '#/admin/documents'; setTab('documents') }}
              hint="Enviar PDFs, DOCX, MD para o corpus"
            />
            <SidebarItem
              icon={<Tags size={16} />}
              label="Tipos Jurídicos"
              active={tab === 'taxonomy'}
              onClick={() => { window.location.hash = '#/admin/taxonomy'; setTab('taxonomy') }}
              hint="Mapa de tipos, áreas e assuntos"
            />
            <SidebarItem
              icon={<FolderTree size={16} />}
              label="Pastas de Pesquisa"
              active={tab === 'paths'}
              onClick={() => { window.location.hash = '#/admin/paths'; setTab('paths') }}
              hint="Configurar paths local / WebDAV / rede"
            />
          </SidebarSection>

          <SidebarSection title="Pipeline de Pesquisa">
            <SidebarItem
              icon={<Search size={16} />}
              label="Configurações de Pesquisa"
              active={tab === 'research'}
              onClick={() => { window.location.hash = '#/admin/research'; setTab('research') }}
              hint="Recência, cobertura, análise jurídica"
            />
            <SidebarItem
              icon={<Globe2 size={16} />}
              label="Pesquisa Web (externa)"
              active={tab === 'websearch'}
              onClick={() => { window.location.hash = '#/admin/websearch'; setTab('websearch') }}
              hint="Tavily/Serper/Brave/Perplexity + chaves"
            />
            <SidebarItem
              icon={<Building2 size={16} />}
              label="Intranet MPRS"
              active={tab === 'intranet'}
              onClick={() => { window.location.hash = '#/admin/intranet'; setTab('intranet') }}
              hint="Login, paths de busca e docs"
            />
          </SidebarSection>

          <SidebarSection title="Administração">
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
            icon={<Activity size={16} />}
            label="Auditoria"
            active={tab === 'audit'}
            onClick={() => { window.location.hash = '#/admin/audit'; setTab('audit') }}
            hint="Logs de uso (em breve)"
            disabled
          />
          </SidebarSection>
        </aside>

        {/* Content */}
        <main style={contentStyle}>
          {tab === 'llm' && (
            <>
              <h2 style={pageTitleStyle}>Configurações de LLM</h2>
              <p style={pageDescStyle}>
                Defina o modelo global do agente orquestrador e, se quiser, um modelo
                dedicado + skills para cada agente da plataforma.
              </p>

              <h3 style={subHeadingStyle}>1 · LLM Global (agente orquestrador)</h3>
              <p style={pageDescStyle}>
                Quando definida, todos os usuários passam a usar esta LLM no chat.
                A configuração pessoal fica oculta. Os valores salvos reaparecem nos campos.
              </p>
              <AdminSettings />

              <h3 style={subHeadingStyle}>2 · Agentes e Skills</h3>
              <p style={pageDescStyle}>
                Cada agente pode usar o LLM global ou um modelo próprio, e tem suas próprias
                skills/comandos (criar, editar, excluir).
              </p>
              <AgentsConfig />

              <h3 style={subHeadingStyle}>3 · Análise do Acervo (agentes de leitura)</h3>
              <p style={pageDescStyle}>
                Liga/desliga cada etapa da análise automática no upload (classificação,
                ementa, pontos relevantes) e o rerank com LLM na pesquisa.
              </p>
              <AcervoPipelineConfig />
            </>
          )}
          {tab === 'documents' && (
            <>
              <h2 style={pageTitleStyle}>Upload de Documentos</h2>
              <p style={pageDescStyle}>
                Envie documentos (PDF, DOCX, TXT, MD, HTML) para o corpus do Cofrito.
                Após o upload, os documentos ficam disponíveis para consulta pela LLM.
              </p>
              <DocumentCatalog />
            </>
          )}
          {tab === 'taxonomy' && (
            <>
              <h2 style={pageTitleStyle}>Tipos Jurídicos</h2>
              <p style={pageDescStyle}>
                Mapa editável de tipos de documento, áreas do direito e assuntos.
                Orienta o Criador de Acervo na classificação de cada documento.
              </p>
              <LegalTaxonomyConfig />
            </>
          )}
          {tab === 'paths' && (
            <>
              <h2 style={pageTitleStyle}>Pastas de Pesquisa</h2>
              <p style={pageDescStyle}>
                Configure os locais onde o Cofrito deve procurar documentos:
                pastas locais, WebDAV, SMB/rede, Google Drive ou OneDrive.
              </p>
              <SourcePaths />
            </>
          )}
          {tab === 'research' && (
            <>
              <h2 style={pageTitleStyle}>Configurações Globais de Pesquisa</h2>
              <p style={pageDescStyle}>
                Define como o pipeline multi-agente busca, filtra e apresenta os documentos.
                As REGRAS PRIMORDIAIS (não inventar, transcrição literal, links) são sempre respeitadas.
              </p>
              <ResearchConfig />
            </>
          )}
          {tab === 'websearch' && (
            <>
              <h2 style={pageTitleStyle}>Pesquisa Web (externa)</h2>
              <p style={pageDescStyle}>
                Configure o provedor de pesquisa externa. Por padrão a pesquisa web está
                <strong> desabilitada</strong> — o Cofrito usa apenas o corpus interno.
                Quando habilitada, o toggle "Pesquisa web" no chat fica disponível.
              </p>
              <WebSearchConfig />
            </>
          )}
          {tab === 'intranet' && (
            <>
              <h2 style={pageTitleStyle}>Intranet MPRS</h2>
              <p style={pageDescStyle}>
                Configure o acesso à intranet do MP/RS (com login/senha). A intranet faz parte
                do <strong>corpus interno</strong> e é consultada automaticamente, sem precisar
                do toggle "Pesquisa web".
              </p>
              <IntranetConfig />
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

function SidebarSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={sectionTitleStyle}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>{children}</div>
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

function ManualAdminGuide({ uid, email }: { uid: string; email: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ marginTop: 24, maxWidth: 560, width: '100%' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          background: 'transparent',
          border: '1px dashed #d1d5db',
          color: '#6b7280',
          padding: '8px 14px',
          borderRadius: 6,
          fontSize: 12,
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        {open ? '▼' : '▶'} Como criar o admin manualmente (Firestore Console)
      </button>
      {open && (
        <div style={{
          marginTop: 8,
          padding: 14,
          background: '#f9fafb',
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          textAlign: 'left',
          fontSize: 12,
          color: '#374151',
          lineHeight: 1.6,
        }}>
          <p style={{ margin: '0 0 10px', fontWeight: 600, color: '#dc2626' }}>
            ⚠️ O doc correto é <code>admins/{uid}</code> (NÃO <code>users/{uid}</code>).
          </p>
          <ol style={{ margin: '0 0 10px', paddingLeft: 18 }}>
            <li>Vá em <strong>Firestore Console → admins</strong> (crie a collection se não existir)</li>
            <li>Clique em <strong>+ Adicionar documento</strong></li>
            <li>ID do documento: <code style={codeStyle}>{uid}</code></li>
            <li>Adicione estes campos:</li>
          </ol>
          <pre style={jsonStyle}>
{`{
  "uid": "${uid}",
  "email": "${email}",
  "displayName": "Seu nome",
  "role": "master",
  "active": true,
  "grantedAt": <timestamp atual>,
  "grantedBy": "manual"
}`}
          </pre>
          <p style={{ margin: '0 0 8px' }}>
            <strong>Importante</strong>: reverta o <code>role</code> em <code>users/{uid.slice(0, 12)}…</code> para
            <code> &quot;externo&quot;</code> (o que estava antes). Apenas o doc em <code>admins</code> define master.
          </p>
          <p style={{ margin: '0', fontSize: 11, color: '#6b7280' }}>
            Após criar, faça <strong>hard refresh</strong> (Ctrl+Shift+R) na página.
          </p>
        </div>
      )}
    </div>
  )
}

function BootstrapButton() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [showCurl, setShowCurl] = useState(false)
  const [email, setEmail] = useState('')
  const [secret, setSecret] = useState('')
  const [curlResult, setCurlResult] = useState<string | null>(null)

  async function handleBootstrap() {
    if (!confirm('Tornar-se master admin? (Disponível apenas se nenhum master existir ainda)')) return
    setLoading(true)
    setError(null)
    try {
      const { api } = await import('@/lib/api')
      await api.bootstrapAdminMaster()
      setSuccess(true)
      setTimeout(() => window.location.reload(), 1500)
    } catch (err: any) {
      setError(err.message ?? 'Erro')
    } finally {
      setLoading(false)
    }
  }

  async function handleCurl() {
    if (!email || !secret) {
      setCurlResult('Preencha email e secret')
      return
    }
    setCurlResult('Enviando...')
    try {
      const res = await fetch('https://southamerica-east1-cofrito.cloudfunctions.net/grantAdminByEmail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, secret, role: 'master' }),
      })
      const data = await res.json()
      if (res.ok) {
        setCurlResult(`✓ ${data.message}\nUID: ${data.uid}`)
      } else {
        setCurlResult(`✗ ${data.error || 'Erro'}`)
      }
    } catch (err: any) {
      setCurlResult(`✗ ${err.message}`)
    }
  }

  if (success) {
    return <p style={{ color: '#059669', fontWeight: 500, marginTop: 16 }}>✓ Pronto! Recarregando...</p>
  }

  return (
    <div style={{ marginTop: 16, textAlign: 'center', maxWidth: 480, width: '100%' }}>
      <button onClick={handleBootstrap} disabled={loading} style={bootstrapBtnStyle}>
        {loading ? 'Verificando...' : '👑 Tornar-me o primeiro master admin'}
      </button>
      {error && <p style={{ color: '#dc2626', fontSize: 12, marginTop: 8 }}>{error}</p>}

      <div style={{ marginTop: 24, padding: 12, background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, textAlign: 'left' }}>
        <button
          onClick={() => setShowCurl((v) => !v)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#92400e', fontSize: 12, fontWeight: 600 }}
        >
          {showCurl ? '▼' : '▶'} Alternativa: promover por email (caso o botão falhe)
        </button>
        {showCurl && (
          <div style={{ marginTop: 8 }}>
            <p style={{ fontSize: 11, color: '#78350f', lineHeight: 1.5, margin: '0 0 8px' }}>
              Se você não consegue usar o botão acima, preencha seu email e peça o
              <code> MASTER_BOOTSTRAP_SECRET</code> ao admin (ou use o secret configurado no deploy).
            </p>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              style={{ ...inputInlineStyle, width: '100%', marginBottom: 6 }}
            />
            <input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="MASTER_BOOTSTRAP_SECRET"
              style={{ ...inputInlineStyle, width: '100%', marginBottom: 6 }}
            />
            <button onClick={handleCurl} style={{ ...bootstrapBtnStyle, width: '100%', justifyContent: 'center' }}>
              Promover como master
            </button>
            {curlResult && (
              <pre style={{ marginTop: 8, padding: 8, background: '#fffbeb', borderRadius: 4, fontSize: 11, color: '#78350f', textAlign: 'left', whiteSpace: 'pre-wrap' }}>
                {curlResult}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const inputInlineStyle: React.CSSProperties = {
  padding: '6px 8px',
  fontSize: 12,
  border: '1px solid #d1d5db',
  borderRadius: 4,
  fontFamily: 'inherit',
  outline: 'none',
}

const codeStyle: React.CSSProperties = {
  background: '#e5e7eb',
  padding: '1px 5px',
  borderRadius: 3,
  fontSize: 11,
  fontFamily: 'ui-monospace, monospace',
}

const jsonStyle: React.CSSProperties = {
  background: '#1a4d8f',
  color: '#e0e7ff',
  padding: 10,
  borderRadius: 6,
  fontSize: 11,
  fontFamily: 'ui-monospace, monospace',
  overflow: 'auto',
  margin: '0 0 10px',
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
  maxWidth: 1800,
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

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  color: '#6b7280',
  padding: '0 10px 6px',
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

const subHeadingStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  color: '#0f172a',
  margin: '28px 0 4px',
  paddingTop: 20,
  borderTop: '1px solid #e5e7eb',
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

const bootstrapBtnStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, #1a4d8f 0%, #5B7CFA 100%)',
  color: '#ffffff',
  border: 'none',
  borderRadius: 8,
  padding: '10px 20px',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
  boxShadow: '0 4px 12px rgba(26, 77, 143, 0.3)',
}
