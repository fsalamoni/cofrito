/**
 * AdminSettings — configurações de ADMIN MASTER.
 *
 * Tabs:
 *  1. LLM Global — define o LLM padrão para todos os usuários
 *  2. Administradores — lista, concede e revoga admins
 *  3. Auditoria — acesso a logs (placeholder)
 */
import { useState, useEffect } from 'react'
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore'
import { firestore } from '@/lib/firebase'
import { useAuth } from '@/hooks/useAuth'
import { useLLMConfig } from '@/hooks/useLLMConfig'
import { Users, Globe, Shield, Trash2, Plus, AlertCircle, Check, X, Loader2 } from 'lucide-react'

type Tab = 'llm' | 'admins'

export function AdminSettings() {
  const { user } = useAuth()
  const { globalConfig, saveGlobalConfig } = useLLMConfig()
  const [tab, setTab] = useState<Tab>('llm')

  // Admin state
  const [admins, setAdmins] = useState<Array<{ uid: string; displayName?: string; email?: string; role: string; active?: boolean }>>([])
  const [loadingAdmins, setLoadingAdmins] = useState(false)
  const [grantEmail, setGrantEmail] = useState('')
  const [grantRole, setGrantRole] = useState<'admin' | 'master'>('admin')
  const [grantFeedback, setGrantFeedback] = useState<{ ok: boolean; msg: string } | null>(null)
  const [granting, setGranting] = useState(false)

  useEffect(() => {
    if (tab !== 'admins') return
    setLoadingAdmins(true)
    const q = query(collection(firestore, 'admins'), orderBy('grantedAt', 'desc'))
    const unsub = onSnapshot(
      q,
      (snap) => {
        const items: typeof admins = []
        snap.forEach((d) => {
          const data = d.data() as any
          items.push({
            uid: d.id,
            displayName: data.displayName,
            email: data.email,
            role: data.role,
            active: data.active,
          })
        })
        setAdmins(items)
        setLoadingAdmins(false)
      },
      (err) => {
        console.warn('Erro ao listar admins:', err)
        setLoadingAdmins(false)
      },
    )
    return unsub
  }, [tab])

  async function handleGrant() {
    if (!grantEmail.includes('@')) {
      setGrantFeedback({ ok: false, msg: 'E-mail inválido' })
      return
    }
    setGranting(true)
    setGrantFeedback(null)
    try {
      const { api } = await import('@/lib/api')
      await api.adminGrantAdmin({ email: grantEmail, role: grantRole })
      setGrantFeedback({ ok: true, msg: `${grantRole === 'master' ? 'Master admin' : 'Admin'} concedido` })
      setGrantEmail('')
    } catch (err: any) {
      setGrantFeedback({ ok: false, msg: err.message ?? 'Erro ao conceder' })
    } finally {
      setGranting(false)
    }
  }

  async function handleRevoke(uid: string) {
    if (!confirm('Revogar este admin?')) return
    if (uid === user?.uid) {
      alert('Você não pode revogar seu próprio acesso')
      return
    }
    try {
      const { api } = await import('@/lib/api')
      await api.adminRevokeAdmin(uid)
    } catch (err: any) {
      alert('Erro: ' + err.message)
    }
  }

  return (
    <div>
      <div style={tabBarStyle}>
        <TabButton active={tab === 'llm'} onClick={() => setTab('llm')} icon={<Globe size={12} />}>
          LLM Global
        </TabButton>
        <TabButton active={tab === 'admins'} onClick={() => setTab('admins')} icon={<Users size={12} />}>
          Admins
        </TabButton>
      </div>

      {tab === 'llm' && (
        <div>
          <div style={infoBannerStyle}>
            <Shield size={14} color="#1a4d8f" />
            <span style={{ fontSize: 11, color: '#0f172a' }}>
              Quando você define um LLM global, todos os usuários passam a usá-lo.
              A configuração pessoal fica oculta.
            </span>
          </div>

          {globalConfig ? (
            <>
              <div style={currentConfigStyle}>
                <div style={labelStyle}>Configuração global ativa</div>
                <div style={{ fontSize: 13, fontWeight: 500, marginTop: 4 }}>
                  {globalConfig.provider} / {globalConfig.model}
                </div>
                <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>
                  Atualizado: {globalConfig.updatedAt ? new Date(globalConfig.updatedAt).toLocaleString('pt-BR') : '-'}
                </div>
              </div>
              <button
                onClick={() => {
                  if (confirm('Remover configuração global? Usuários voltam a poder configurar individualmente.')) {
                    saveGlobalConfig(null)
                  }
                }}
                style={removeGlobalBtnStyle}
              >
                <Trash2 size={12} />
                Remover global
              </button>
            </>
          ) : (
            <div style={noGlobalStyle}>
              <span style={{ fontSize: 11, color: '#6b7280' }}>
                Nenhuma configuração global. Usuários podem configurar seu próprio LLM.
              </span>
            </div>
          )}

          <div style={dividerStyle} />

          <div style={{ padding: '0 12px 12px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
              {globalConfig ? 'Atualizar configuração global' : 'Definir configuração global'}
            </div>
            <GlobalLLMForm
              initial={globalConfig}
              onSave={async (cfg) => {
                await saveGlobalConfig(cfg)
              }}
            />
          </div>
        </div>
      )}

      {tab === 'admins' && (
        <div style={{ padding: 12 }}>
          <div style={grantBoxStyle}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Conceder admin</div>
            <div style={{ display: 'flex', gap: 4 }}>
              <input
                type="email"
                value={grantEmail}
                onChange={(e) => setGrantEmail(e.target.value)}
                placeholder="email@exemplo.com"
                style={inputStyle}
              />
              <select
                value={grantRole}
                onChange={(e) => setGrantRole(e.target.value as 'admin' | 'master')}
                style={{ ...inputStyle, width: 80 }}
              >
                <option value="admin">Admin</option>
                <option value="master">Master</option>
              </select>
              <button onClick={handleGrant} disabled={granting} style={grantBtnStyle}>
                {granting ? <Loader2 size={12} className="cofrito-spin" /> : <Plus size={12} />}
              </button>
            </div>
            {grantFeedback && (
              <div style={{
                marginTop: 6,
                fontSize: 11,
                color: grantFeedback.ok ? '#065f46' : '#991b1b',
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                {grantFeedback.ok ? <Check size={11} /> : <AlertCircle size={11} />}
                {grantFeedback.msg}
              </div>
            )}
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
              Administradores atuais ({admins.length})
            </div>
            {loadingAdmins ? (
              <div style={{ textAlign: 'center', padding: 12 }}>
                <Loader2 size={16} className="cofrito-spin" />
              </div>
            ) : admins.length === 0 ? (
              <div style={{ fontSize: 11, color: '#9ca3af', padding: 12, textAlign: 'center' }}>
                Nenhum admin cadastrado
              </div>
            ) : (
              <div>
                {admins.map((a) => (
                  <div key={a.uid} style={adminRowStyle}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500 }}>
                        {a.displayName || a.email || a.uid.slice(0, 8)}
                      </div>
                      <div style={{ fontSize: 10, color: '#6b7280' }}>
                        {a.email} · {a.role === 'master' ? '⭐ Master' : 'Admin'} · {a.active === false ? '❌ Inativo' : '✓ Ativo'}
                      </div>
                    </div>
                    {a.uid !== user?.uid && (
                      <button onClick={() => handleRevoke(a.uid)} style={revokeBtnStyle} title="Revogar">
                        <X size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function TabButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{ ...tabBtnStyle, ...(active ? tabBtnActiveStyle : {}) }}>
      {icon}
      {children}
    </button>
  )
}

function GlobalLLMForm({
  initial,
  onSave,
}: {
  initial: { provider: string; model: string; apiKey: string; baseUrl?: string; temperature?: number; maxTokens?: number } | null
  onSave: (cfg: any) => Promise<void>
}) {
  const [provider, setProvider] = useState<string>(initial?.provider ?? 'google')
  const [model, setModel] = useState<string>(initial?.model ?? 'gemini-2.5-flash')
  const [apiKey, setApiKey] = useState<string>(initial?.apiKey ?? '')
  const [baseUrl, setBaseUrl] = useState<string>(initial?.baseUrl ?? '')
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null)

  async function handleSave() {
    if (!apiKey) {
      setFeedback({ ok: false, msg: 'API key obrigatória' })
      return
    }
    setSaving(true)
    try {
      await onSave({ provider, model, apiKey, baseUrl: baseUrl || undefined })
      setFeedback({ ok: true, msg: 'Config global salva' })
    } catch (err: any) {
      setFeedback({ ok: false, msg: err.message ?? 'Erro' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          placeholder="provider (google, openai...)"
          style={inputStyle}
        />
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="modelo (gemini-2.5-flash...)"
          style={inputStyle}
        />
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="API key (será criptografada)"
          style={inputStyle}
        />
        <input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="baseUrl (opcional)"
          style={inputStyle}
        />
        <button onClick={handleSave} disabled={saving} style={{ ...grantBtnStyle, justifyContent: 'center' }}>
          {saving ? <Loader2 size={12} className="cofrito-spin" /> : <Shield size={12} />}
          Salvar como global
        </button>
        {feedback && (
          <div style={{ fontSize: 11, color: feedback.ok ? '#065f46' : '#991b1b' }}>
            {feedback.msg}
          </div>
        )}
      </div>
    </div>
  )
}

const tabBarStyle: React.CSSProperties = {
  display: 'flex',
  borderBottom: '1px solid #e5e7eb',
  background: '#f9fafb',
}

const tabBtnStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 4,
  background: 'transparent',
  border: 'none',
  borderBottom: '2px solid transparent',
  padding: '10px 8px',
  fontSize: 11,
  fontWeight: 500,
  color: '#6b7280',
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const tabBtnActiveStyle: React.CSSProperties = {
  background: '#ffffff',
  color: '#1a4d8f',
  borderBottomColor: '#1a4d8f',
}

const infoBannerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 6,
  background: '#eef2ff',
  border: '1px solid #c7d2fe',
  borderRadius: 6,
  padding: 8,
  margin: 12,
}

const currentConfigStyle: React.CSSProperties = {
  margin: '0 12px 8px',
  padding: 10,
  background: '#f0fdf4',
  border: '1px solid #bbf7d0',
  borderRadius: 8,
}

const noGlobalStyle: React.CSSProperties = {
  margin: '0 12px 8px',
  padding: 10,
  background: '#f9fafb',
  border: '1px dashed #d1d5db',
  borderRadius: 8,
  textAlign: 'center',
}

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  textTransform: 'uppercase',
  color: '#065f46',
  letterSpacing: 0.5,
}

const removeGlobalBtnStyle: React.CSSProperties = {
  margin: '0 12px 12px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 4,
  background: 'transparent',
  border: '1px solid #fca5a5',
  color: '#dc2626',
  borderRadius: 6,
  padding: '6px 10px',
  fontSize: 11,
  cursor: 'pointer',
}

const dividerStyle: React.CSSProperties = {
  height: 1,
  background: '#e5e7eb',
  margin: '8px 0',
}

const grantBoxStyle: React.CSSProperties = {
  background: '#f9fafb',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  padding: 10,
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: '6px 8px',
  fontSize: 12,
  border: '1px solid #d1d5db',
  borderRadius: 4,
  fontFamily: 'inherit',
  background: '#ffffff',
  outline: 'none',
}

const grantBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#1a4d8f',
  color: '#ffffff',
  border: 'none',
  borderRadius: 4,
  padding: '6px 10px',
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const adminRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: 8,
  border: '1px solid #e5e7eb',
  borderRadius: 6,
  marginBottom: 4,
  background: '#ffffff',
}

const revokeBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid #fca5a5',
  color: '#dc2626',
  borderRadius: 4,
  padding: 4,
  cursor: 'pointer',
  display: 'flex',
}
