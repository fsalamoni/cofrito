/**
 * AdminSettings — configurações de ADMIN MASTER.
 *
 * Tabs:
 *  1. LLM Global — define o LLM padrão para todos os usuários
 *  2. Administradores — lista, concede e revoga admins
 */
import { useState, useEffect, useMemo } from 'react'
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore'
import { firestore } from '@/lib/firebase'
import { useAuth } from '@/hooks/useAuth'
import { useLLMConfig } from '@/hooks/useLLMConfig'
import { useLastProvider } from '@/hooks/useLastProvider'
import { PROVIDERS, getProviderInfo, getEnrichedModelsForProvider } from '@/lib/providers'
import { Users, Globe, Shield, Trash2, Plus, AlertCircle, Check, X, Loader2, Database } from 'lucide-react'
import type { LLMProvider, LLMConfig } from '@/types'
import { ModelSelectorTable } from './ModelSelectorTable'
import { InfoModal } from '@/components/InfoModal'
import { TemperatureInfo, MaxTokensInfo } from '@/components/llm-info-content'
import { ActiveConfigPanel } from '@/components/ActiveConfigPanel'

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

          {/* PAINEL DE CONFIGURAÇÃO ATIVA */}
          <div style={{ margin: '0 12px 8px' }}>
            <ActiveConfigPanel config={globalConfig} source={globalConfig ? 'global' : 'fallback'} />
          </div>

          {globalConfig && (
            <div style={currentConfigStyle}>
              <div style={labelStyle}>Configuração global ativa</div>
              <div style={{ fontSize: 13, fontWeight: 500, marginTop: 4 }}>
                {globalConfig.provider} / {globalConfig.model}
              </div>
              <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>
                Atualizado: {globalConfig.updatedAt ? new Date(globalConfig.updatedAt).toLocaleString('pt-BR') : '-'}
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
            </div>
          )}

          <div style={dividerStyle} />

          <div style={{ padding: '0 12px 12px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
              {globalConfig ? 'Atualizar configuração global' : 'Definir configuração global'}
            </div>
            <GlobalLLMFormWithSelect
              initial={globalConfig}
              onSave={async (cfg) => {
                await saveGlobalConfig({ ...cfg, scope: 'global' })
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

/**
 * GlobalLLMFormWithSelect — Formulário com seletor de PROVEDOR e LISTA de modelos.
 * Usa o catálogo completo de PROVIDERS (988 modelos em 17 provedores).
 */
function GlobalLLMFormWithSelect({
  initial,
  onSave,
}: {
  initial: Partial<LLMConfig> | null
  onSave: (cfg: LLMConfig) => Promise<void>
}) {
  const { provider: persistedProvider, setProvider: persistProvider } = useLastProvider()
  const [provider, setProviderState] = useState<LLMProvider>((initial?.provider as LLMProvider) ?? persistedProvider ?? 'openrouter')
  const [model, setModel] = useState<string>(initial?.model ?? 'openai/gpt-4o-mini')
  const [apiKey, setApiKey] = useState<string>(initial?.apiKey ?? '')
  const [baseUrl, setBaseUrl] = useState<string>(initial?.baseUrl ?? '')
  const [temperature, setTemperature] = useState<number>(initial?.temperature ?? 0.3)
  const [maxTokens, setMaxTokens] = useState<number>(initial?.maxTokens ?? 2000)
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null)

  const providerInfo = getProviderInfo(provider)

  // Modelos enriquecidos do provider selecionado (com tier, scores, custos, etc.)
  const enrichedModels = useMemo(
    () => getEnrichedModelsForProvider(provider),
    [provider],
  )

  function setProvider(p: LLMProvider) {
    setProviderState(p)
    persistProvider(p)
  }

  async function handleSave() {
    // Ao EDITAR uma config já existente, a chave pode ficar em branco (o backend
    // preserva a chave salva no doc secreto). Só é obrigatória em config nova.
    if (!apiKey && !initial && provider !== 'ollama') {
      setFeedback({ ok: false, msg: 'API key é obrigatória' })
      return
    }
    if (!model) {
      setFeedback({ ok: false, msg: 'Selecione um modelo' })
      return
    }
    setSaving(true)
    setFeedback(null)
    try {
      await onSave({
        provider,
        model,
        apiKey,
        baseUrl: baseUrl || undefined,
        temperature,
        maxTokens,
        scope: 'global',
      } as LLMConfig)
      setFeedback({ ok: true, msg: 'Configuração global salva!' })
    } catch (err: any) {
      setFeedback({ ok: false, msg: err.message ?? 'Erro' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      {/* PROVEDOR */}
      <div style={formFieldStyle}>
        <label style={formLabelStyle}>
          Provedor
          {providerInfo?.apiKeyUrl && (
            <a
              href={providerInfo.apiKeyUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={extLinkStyle}
            >
              Obter key <Database size={9} style={{ verticalAlign: 'middle' }} />
            </a>
          )}
        </label>
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value as LLMProvider)}
          style={formSelectStyle}
        >
          {PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label} ({p.models.length || '∞'} modelos)
            </option>
          ))}
        </select>
        {providerInfo && (
          <div style={formHintStyle}>{providerInfo.description}</div>
        )}
      </div>

      {/* API KEY */}
      <div style={formFieldStyle}>
        <label style={formLabelStyle}>API Key</label>
        <div style={{ position: 'relative' }}>
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={provider === 'ollama'
              ? '(não necessária para Ollama local)'
              : (initial ? '•••••• (deixe em branco para manter a chave salva)' : 'sk-...')}
            style={{ ...formInputStyle, paddingRight: 36 }}
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            style={eyeBtnStyle}
            tabIndex={-1}
          >
            {showKey ? '🙈' : '👁'}
          </button>
        </div>
      </div>

      {/* BASE URL */}
      {(provider === 'custom' || providerInfo?.defaultBaseUrl) && (
        <div style={formFieldStyle}>
          <label style={formLabelStyle}>
            Endpoint (Base URL)
            {providerInfo?.defaultBaseUrl && (
              <span style={{ color: '#9ca3af', fontWeight: 400, marginLeft: 4 }}>
                · padrão: {providerInfo.defaultBaseUrl}
              </span>
            )}
          </label>
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={providerInfo?.defaultBaseUrl ?? 'https://api.example.com/v1'}
            style={formInputStyle}
            spellCheck={false}
          />
        </div>
      )}

      {/* TABELA RICA DE MODELOS — clique em uma linha para selecionar */}
      <div style={formFieldStyle}>
        <label style={formLabelStyle}>
          Modelo
          {enrichedModels.length > 0 && (
            <span style={{ color: '#9ca3af', fontWeight: 400, marginLeft: 4 }}>
              · {enrichedModels.length} modelos com notas e custos
            </span>
          )}
        </label>
        {enrichedModels.length > 0 ? (
          <ModelSelectorTable
            models={enrichedModels}
            selectedId={model}
            onSelect={(m) => setModel(m.id)}
            showProvider={false}
            maxHeight={360}
            compact
            providerId={provider}
          />
        ) : (
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="gemini-2.5-flash"
            style={formInputStyle}
            spellCheck={false}
          />
        )}
        {model && (
          <div style={formHintStyle}>
            Modelo selecionado: <code style={{ background: '#f1f5f9', padding: '0 4px', borderRadius: 3 }}>{model}</code>
          </div>
        )}
      </div>

      {/* TEMPERATURE */}
      <div style={formFieldStyle}>
        <label style={formLabelStyle}>
          Temperatura: {temperature.toFixed(2)}
          <InfoModal title="Temperatura"><TemperatureInfo /></InfoModal>
        </label>
        <input
          type="range"
          min="0"
          max="2"
          step="0.05"
          value={temperature}
          onChange={(e) => setTemperature(parseFloat(e.target.value))}
          style={{ width: '100%' }}
        />
        <div style={formHintStyle}>0 = determinístico · 2 = caótico. <strong>Recomendado: 0.1–0.3</strong> para peças jurídicas.</div>
      </div>

      {/* MAX TOKENS */}
      <div style={formFieldStyle}>
        <label style={formLabelStyle}>
          Max tokens
          <InfoModal title="Max tokens (tamanho da resposta)"><MaxTokensInfo /></InfoModal>
        </label>
        <input
          type="number"
          min="100"
          max="32000"
          step="100"
          value={maxTokens}
          onChange={(e) => setMaxTokens(parseInt(e.target.value) || 2000)}
          style={formInputStyle}
        />
        <div style={formHintStyle}>≈ {Math.round(maxTokens * 0.75).toLocaleString('pt-BR')} palavras. <strong>Padrão: 2.000</strong> (cabe a maioria das respostas).</div>
      </div>

      {/* FEEDBACK */}
      {feedback && (
        <div style={{
          ...feedbackStyle,
          background: feedback.ok ? '#d1fae5' : '#fee2e2',
          color: feedback.ok ? '#065f46' : '#991b1b',
        }}>
          {feedback.ok ? <Check size={12} /> : <AlertCircle size={12} />}
          <span style={{ fontSize: 11 }}>{feedback.msg}</span>
        </div>
      )}

      {/* ACTIONS */}
      <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
        <button onClick={handleSave} disabled={saving} style={saveBtnStyle}>
          {saving ? <Loader2 size={12} className="cofrito-spin" /> : <Shield size={12} />}
          {saving ? 'Salvando...' : 'Salvar como global'}
        </button>
      </div>

      <div style={providerSummaryStyle}>
        <strong style={{ fontSize: 11 }}>📋 {providerInfo?.label}</strong>
        <div style={{ fontSize: 10, color: '#6b7280', marginTop: 4 }}>
          {enrichedModels.length} modelos com notas de capacidade normalizadas (top do provider = 10).
          {providerInfo?.supportsModelListing && ' Suporta listagem dinâmica via API.'}
        </div>
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

// ── Styles do form com seletor de provider ──────────────────────────────

const formFieldStyle: React.CSSProperties = {
  marginBottom: 10,
}

const formLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  fontSize: 11,
  fontWeight: 600,
  color: '#374151',
  marginBottom: 4,
}

const formInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 10px',
  fontSize: 12,
  border: '1px solid #d1d5db',
  borderRadius: 6,
  fontFamily: 'inherit',
  background: '#ffffff',
  color: '#0f172a',
  outline: 'none',
  boxSizing: 'border-box',
}

const formSelectStyle: React.CSSProperties = {
  ...formInputStyle,
  cursor: 'pointer',
}

const formHintStyle: React.CSSProperties = {
  fontSize: 10,
  color: '#6b7280',
  marginTop: 4,
  lineHeight: 1.4,
}

const extLinkStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 500,
  color: '#1a4d8f',
  textDecoration: 'none',
  textTransform: 'none',
  letterSpacing: 0,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 2,
}

const eyeBtnStyle: React.CSSProperties = {
  position: 'absolute',
  right: 6,
  top: '50%',
  transform: 'translateY(-50%)',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  padding: 4,
  fontSize: 14,
  lineHeight: 1,
}

const saveBtnStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  background: '#1a4d8f',
  color: '#ffffff',
  border: 'none',
  borderRadius: 6,
  padding: '8px 12px',
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const feedbackStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: 8,
  borderRadius: 6,
  marginBottom: 8,
}

const providerSummaryStyle: React.CSSProperties = {
  marginTop: 12,
  padding: 10,
  background: '#f9fafb',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
}
