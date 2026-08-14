/**
 * UserAgentsConfig — modelos por-agente do PRÓPRIO usuário.
 *
 * Só faz sentido quando o admin NÃO força um LLM global. Permite ao usuário
 * escolher, por agente (Orquestrador, Pesquisador Externo), usar seu modelo
 * padrão pessoal ou um modelo dedicado (provider/model/apiKey próprios).
 */
import { useEffect, useState } from 'react'
import { Save, Loader2, CheckCircle2, AlertCircle, Bot, Globe2 } from 'lucide-react'
import { api } from '@/lib/api'
import { useLLMConfig } from '@/hooks/useLLMConfig'
import { PROVIDERS } from '@/lib/providers'

type UserAgentId = 'orchestrator' | 'web-researcher'

interface UserAgentModel {
  mode: 'global' | 'custom'
  provider?: string
  model?: string
  apiKey?: string
  baseUrl?: string
  hasApiKey?: boolean
  apiKeyMasked?: string
}

const AGENT_ORDER: UserAgentId[] = ['orchestrator', 'web-researcher']
const AGENT_META: Record<UserAgentId, { label: string; icon: React.ReactNode; hint: string }> = {
  orchestrator: {
    label: 'Agente do chat (orquestrador)',
    icon: <Bot size={16} color="#1a4d8f" />,
    hint: 'O agente que conversa e busca documentos para você.',
  },
  'web-researcher': {
    label: 'Pesquisador externo (web)',
    icon: <Globe2 size={16} color="#1a4d8f" />,
    hint: 'Usado quando a pesquisa web está habilitada.',
  },
}

export function UserAgentsConfig() {
  const { globalForcesConfig } = useLLMConfig()
  const [agents, setAgents] = useState<Record<UserAgentId, UserAgentModel> | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (globalForcesConfig) { setLoading(false); return }
    void load()
  }, [globalForcesConfig])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const r = await api.getUserAgentsConfig()
      setAgents((r.data as any)?.agents ?? null)
    } catch (err: any) {
      setError(err?.message || 'Erro ao carregar')
    } finally {
      setLoading(false)
    }
  }

  async function save() {
    if (!agents) return
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const r = await api.setUserAgentsConfig({ agents })
      if ((r.data as any)?.agents) setAgents((r.data as any).agents)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err: any) {
      setError(err?.message || 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  function update(id: UserAgentId, patch: Partial<UserAgentModel>) {
    setAgents((a) => a ? { ...a, [id]: { ...a[id], ...patch } } : a)
  }

  if (globalForcesConfig) {
    return (
      <div style={infoBoxStyle}>
        O administrador definiu um <strong>LLM global</strong> para todos os agentes.
        A configuração pessoal por agente fica desabilitada.
      </div>
    )
  }

  if (loading) {
    return <div style={{ padding: 16, color: '#6b7280' }}><Loader2 size={18} className="cofrito-spin" /> Carregando...</div>
  }

  if (!agents) {
    return (
      <div style={{ ...infoBoxStyle, background: '#fee2e2', color: '#991b1b' }}>
        {error || 'Não foi possível carregar.'}
        <button onClick={load} style={smallBtnStyle}>Tentar novamente</button>
      </div>
    )
  }

  return (
    <div>
      <p style={introStyle}>
        Opcional: escolha um modelo dedicado por agente. Por padrão, cada agente usa
        a sua <strong>configuração pessoal</strong> (definida acima).
      </p>

      {AGENT_ORDER.map((id) => {
        const a = agents[id]
        if (!a) return null
        return (
          <div key={id} style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              {AGENT_META[id].icon}
              <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{AGENT_META[id].label}</span>
            </div>
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8 }}>{AGENT_META[id].hint}</div>

            <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
              <label style={radioStyle}>
                <input type="radio" checked={a.mode !== 'custom'} onChange={() => update(id, { mode: 'global' })} />
                Usar meu modelo padrão
              </label>
              <label style={radioStyle}>
                <input type="radio" checked={a.mode === 'custom'} onChange={() => update(id, { mode: 'custom' })} />
                Modelo dedicado
              </label>
            </div>

            {a.mode === 'custom' && (
              <div style={boxStyle}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <label style={labelStyle}>Provedor</label>
                    <select value={a.provider || 'openrouter'} onChange={(e) => update(id, { provider: e.target.value })} style={inputStyle}>
                      {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Modelo</label>
                    <input type="text" value={a.model || ''} onChange={(e) => update(id, { model: e.target.value })} placeholder="ex: openai/gpt-4o-mini" style={inputStyle} />
                  </div>
                </div>
                <div style={{ marginTop: 8 }}>
                  <label style={labelStyle}>
                    API Key
                    {a.hasApiKey && <span style={{ color: '#16a34a', marginLeft: 6 }}>· salva ({a.apiKeyMasked})</span>}
                  </label>
                  <input
                    type="password"
                    value={a.apiKey || ''}
                    onChange={(e) => update(id, { apiKey: e.target.value })}
                    placeholder={a.hasApiKey ? '•••••• (deixe em branco para manter)' : 'sk-...'}
                    style={inputStyle}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
              </div>
            )}
          </div>
        )
      })}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
        <button onClick={save} disabled={saving} style={saveBtnStyle}>
          {saving ? <Loader2 size={13} className="cofrito-spin" /> : <Save size={13} />}
          Salvar modelos por agente
        </button>
        {saved && <span style={{ color: '#16a34a', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle2 size={14} /> Salvo!</span>}
        {error && <span style={{ color: '#dc2626', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}><AlertCircle size={14} /> {error}</span>}
      </div>
    </div>
  )
}

const introStyle: React.CSSProperties = { fontSize: 12, color: '#6b7280', margin: '0 0 12px', lineHeight: 1.5 }
const cardStyle: React.CSSProperties = { background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, marginBottom: 10 }
const radioStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', color: '#0f172a' }
const boxStyle: React.CSSProperties = { padding: 10, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6 }
const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }
const inputStyle: React.CSSProperties = { width: '100%', padding: '6px 8px', fontSize: 13, border: '1px solid #d1d5db', borderRadius: 6, fontFamily: 'inherit', background: '#ffffff', boxSizing: 'border-box', outline: 'none' }
const infoBoxStyle: React.CSSProperties = { fontSize: 12, color: '#78350f', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: 12 }
const smallBtnStyle: React.CSSProperties = { marginLeft: 8, background: '#eef2ff', color: '#1a4d8f', border: '1px solid #c7d2fe', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }
const saveBtnStyle: React.CSSProperties = { background: '#1a4d8f', color: '#ffffff', border: 'none', borderRadius: 6, padding: '8px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }
