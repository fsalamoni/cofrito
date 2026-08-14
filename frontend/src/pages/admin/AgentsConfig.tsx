/**
 * AgentsConfig — configuração unificada dos agentes da plataforma.
 *
 * Para cada agente (Orquestrador, Criador de Acervo, Pesquisador Externo):
 *  - habilitar/desabilitar
 *  - escolher o modelo: usar o LLM global OU um modelo dedicado (provider/model/apiKey)
 *  - gerenciar skills/comandos (criar, editar, excluir)
 *
 * Persistido em admin-config/agents via Cloud Functions (apiKey nunca volta cru).
 */
import { useEffect, useState } from 'react'
import {
  Save, Loader2, CheckCircle2, AlertCircle, Plus, Trash2, Bot, Boxes, Globe2, ChevronDown, ChevronRight,
} from 'lucide-react'
import { api } from '@/lib/api'
import { PROVIDERS } from '@/lib/providers'

type AgentId = 'orchestrator' | 'acervo' | 'web-researcher'

interface AgentSkill {
  id: string
  name: string
  description: string
  prompt: string
  enabled: boolean
}

interface AgentModelConfig {
  mode: 'global' | 'custom'
  provider?: string
  model?: string
  apiKey?: string
  baseUrl?: string
  temperature?: number
  maxTokens?: number
  hasApiKey?: boolean
  apiKeyMasked?: string
}

interface AgentConfig {
  id: AgentId
  label: string
  enabled: boolean
  model: AgentModelConfig
  skills: AgentSkill[]
}

interface AgentsConfigState {
  agents: Record<AgentId, AgentConfig>
}

const AGENT_ORDER: AgentId[] = ['orchestrator', 'acervo', 'web-researcher']

const AGENT_META: Record<AgentId, { icon: React.ReactNode; hint: string }> = {
  orchestrator: {
    icon: <Bot size={16} color="#1a4d8f" />,
    hint: 'Conversa com o usuário, interpreta o pedido e busca/entrega documentos do acervo.',
  },
  acervo: {
    icon: <Boxes size={16} color="#1a4d8f" />,
    hint: 'No upload: classifica, extrai pontos relevantes, redige ementa e reconstrói o documento.',
  },
  'web-researcher': {
    icon: <Globe2 size={16} color="#1a4d8f" />,
    hint: 'Pesquisa fontes externas (web) quando habilitado, com links verificáveis.',
  },
}

function newSkillId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  } catch { /* noop */ }
  return `skill-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function AgentsConfig() {
  const [config, setConfig] = useState<AgentsConfigState | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Record<AgentId, boolean>>({
    orchestrator: true, acervo: true, 'web-researcher': false,
  })

  useEffect(() => { void load() }, [])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const r = await api.adminGetAgentsConfig()
      setConfig(r.data as AgentsConfigState)
    } catch (err: any) {
      setError(err?.message || 'Erro ao carregar configuração dos agentes')
    } finally {
      setLoading(false)
    }
  }

  async function save() {
    if (!config) return
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const r = await api.adminSaveAgentsConfig(config)
      // Recebe de volta a versão client-safe (apiKey mascarado)
      if (r?.data) setConfig(r.data as AgentsConfigState)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err: any) {
      setError(err?.message || 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  function updateAgent(id: AgentId, patch: Partial<AgentConfig>) {
    setConfig((c) => c ? { agents: { ...c.agents, [id]: { ...c.agents[id], ...patch } } } : c)
  }

  function updateModel(id: AgentId, patch: Partial<AgentModelConfig>) {
    setConfig((c) => c ? {
      agents: { ...c.agents, [id]: { ...c.agents[id], model: { ...c.agents[id].model, ...patch } } },
    } : c)
  }

  function updateSkill(id: AgentId, skillId: string, patch: Partial<AgentSkill>) {
    setConfig((c) => {
      if (!c) return c
      const skills = c.agents[id].skills.map((s) => s.id === skillId ? { ...s, ...patch } : s)
      return { agents: { ...c.agents, [id]: { ...c.agents[id], skills } } }
    })
  }

  function addSkill(id: AgentId) {
    setConfig((c) => {
      if (!c) return c
      const skills = [...c.agents[id].skills, {
        id: newSkillId(), name: 'Nova skill', description: '', prompt: '', enabled: true,
      }]
      return { agents: { ...c.agents, [id]: { ...c.agents[id], skills } } }
    })
  }

  function removeSkill(id: AgentId, skillId: string) {
    setConfig((c) => {
      if (!c) return c
      const skills = c.agents[id].skills.filter((s) => s.id !== skillId)
      return { agents: { ...c.agents, [id]: { ...c.agents[id], skills } } }
    })
  }

  if (loading) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: '#6b7280' }}>
        <Loader2 size={24} className="cofrito-spin" /> Carregando agentes...
      </div>
    )
  }

  if (!config) {
    return (
      <div style={{ padding: 16, background: '#fee2e2', color: '#991b1b', borderRadius: 8 }}>
        {error || 'Não foi possível carregar a configuração dos agentes.'}
        <button onClick={load} style={{ marginLeft: 8, ...smallBtnStyle }}>Tentar novamente</button>
      </div>
    )
  }

  return (
    <div>
      <p style={introStyle}>
        Configure cada agente da plataforma. Você pode usar <strong>um único provedor/modelo</strong> (o
        LLM global) para todos, <strong>um modelo diferente por agente</strong>, ou até
        <strong> provedores diferentes</strong> — total liberdade. As <em>skills</em> orientam como cada
        agente cumpre seu trabalho.
      </p>

      {AGENT_ORDER.map((id) => {
        const agent = config.agents[id]
        if (!agent) return null
        const isOpen = expanded[id]
        return (
          <div key={id} style={cardStyle}>
            {/* Header */}
            <div style={cardHeaderStyle}>
              <button
                onClick={() => setExpanded((e) => ({ ...e, [id]: !e[id] }))}
                style={collapseBtnStyle}
                aria-expanded={isOpen}
              >
                {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                {AGENT_META[id].icon}
                <span style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{agent.label}</span>
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  ...statusBadgeStyle,
                  background: agent.enabled ? '#dcfce7' : '#f3f4f6',
                  color: agent.enabled ? '#166534' : '#6b7280',
                }}>
                  {agent.enabled ? 'Ativo' : 'Inativo'}
                </span>
                <Switch value={agent.enabled} onChange={(v) => updateAgent(id, { enabled: v })} />
              </div>
            </div>

            <div style={{ fontSize: 12, color: '#6b7280', padding: '0 4px 8px' }}>{AGENT_META[id].hint}</div>

            {isOpen && (
              <>
                {/* Modelo */}
                <div style={subSectionStyle}>
                  <div style={subTitleStyle}>Modelo</div>
                  <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
                    <label style={radioLabelStyle}>
                      <input
                        type="radio"
                        checked={agent.model.mode !== 'custom'}
                        onChange={() => updateModel(id, { mode: 'global' })}
                      />
                      Usar o LLM global
                    </label>
                    <label style={radioLabelStyle}>
                      <input
                        type="radio"
                        checked={agent.model.mode === 'custom'}
                        onChange={() => updateModel(id, { mode: 'custom' })}
                      />
                      Modelo dedicado
                    </label>
                  </div>

                  {agent.model.mode === 'custom' && (
                    <div style={customModelBoxStyle}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div>
                          <label style={fieldLabelStyle}>Provedor</label>
                          <select
                            value={agent.model.provider || 'openrouter'}
                            onChange={(e) => updateModel(id, { provider: e.target.value })}
                            style={selectStyle}
                          >
                            {PROVIDERS.map((p) => (
                              <option key={p.id} value={p.id}>{p.label}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label style={fieldLabelStyle}>Modelo</label>
                          <input
                            type="text"
                            value={agent.model.model || ''}
                            onChange={(e) => updateModel(id, { model: e.target.value })}
                            placeholder="ex: openai/gpt-4o-mini"
                            style={inputStyle}
                          />
                        </div>
                      </div>
                      <div style={{ marginTop: 10 }}>
                        <label style={fieldLabelStyle}>
                          API Key
                          {agent.model.hasApiKey && (
                            <span style={{ color: '#16a34a', fontWeight: 500, marginLeft: 6 }}>
                              · chave salva ({agent.model.apiKeyMasked})
                            </span>
                          )}
                        </label>
                        <input
                          type="password"
                          value={agent.model.apiKey || ''}
                          onChange={(e) => updateModel(id, { apiKey: e.target.value })}
                          placeholder={agent.model.hasApiKey ? '•••••• (deixe em branco para manter)' : 'sk-...'}
                          style={inputStyle}
                          autoComplete="off"
                          spellCheck={false}
                        />
                      </div>
                      {agent.model.provider === 'custom' && (
                        <div style={{ marginTop: 10 }}>
                          <label style={fieldLabelStyle}>Base URL (endpoint)</label>
                          <input
                            type="text"
                            value={agent.model.baseUrl || ''}
                            onChange={(e) => updateModel(id, { baseUrl: e.target.value })}
                            placeholder="https://api.exemplo.com/v1"
                            style={inputStyle}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Skills */}
                <div style={subSectionStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={subTitleStyle}>Skills / Comandos ({agent.skills.length})</div>
                    <button onClick={() => addSkill(id)} style={smallBtnStyle}>
                      <Plus size={12} /> Adicionar skill
                    </button>
                  </div>

                  {agent.skills.length === 0 && (
                    <div style={{ fontSize: 12, color: '#9ca3af', padding: '8px 0' }}>
                      Nenhuma skill. O agente usará apenas suas instruções padrão.
                    </div>
                  )}

                  {agent.skills.map((skill) => (
                    <div key={skill.id} style={skillCardStyle}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                        <input
                          type="text"
                          value={skill.name}
                          onChange={(e) => updateSkill(id, skill.id, { name: e.target.value })}
                          placeholder="Nome da skill"
                          style={{ ...inputStyle, fontWeight: 600 }}
                        />
                        <Switch value={skill.enabled} onChange={(v) => updateSkill(id, skill.id, { enabled: v })} />
                        <button
                          onClick={() => removeSkill(id, skill.id)}
                          style={deleteBtnStyle}
                          title="Excluir skill"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <input
                        type="text"
                        value={skill.description}
                        onChange={(e) => updateSkill(id, skill.id, { description: e.target.value })}
                        placeholder="Descrição curta (para o admin)"
                        style={{ ...inputStyle, marginBottom: 6 }}
                      />
                      <textarea
                        value={skill.prompt}
                        onChange={(e) => updateSkill(id, skill.id, { prompt: e.target.value })}
                        placeholder="Instrução/prompt injetado no agente (o que a skill orienta o agente a fazer)"
                        style={textareaStyle}
                        rows={3}
                      />
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )
      })}

      {/* Save bar */}
      <div style={saveBarStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {error && (
            <div style={{ color: '#dc2626', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
              <AlertCircle size={14} /> {error}
            </div>
          )}
          {saved && (
            <div style={{ color: '#16a34a', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
              <CheckCircle2 size={14} /> Salvo!
            </div>
          )}
        </div>
        <button onClick={save} disabled={saving} style={saveBtnStyle}>
          {saving ? <Loader2 size={14} className="cofrito-spin" /> : <Save size={14} />}
          Salvar agentes
        </button>
      </div>
    </div>
  )
}

// ── Switch ───────────────────────────────────────────────────────────────

function Switch({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{ ...switchStyle, background: value ? '#1a4d8f' : '#d1d5db' }}
      aria-pressed={value}
      type="button"
    >
      <div style={{ ...switchKnobStyle, transform: value ? 'translateX(20px)' : 'translateX(0)' }} />
    </button>
  )
}

// ── Estilos ────────────────────────────────────────────────────────────

const introStyle: React.CSSProperties = {
  fontSize: 13, color: '#374151', lineHeight: 1.6, margin: '0 0 16px',
  padding: 12, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8,
}
const cardStyle: React.CSSProperties = {
  background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 14, marginBottom: 14,
}
const cardHeaderStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
}
const collapseBtnStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none',
  cursor: 'pointer', fontFamily: 'inherit', padding: 4,
}
const statusBadgeStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
}
const subSectionStyle: React.CSSProperties = {
  marginTop: 12, paddingTop: 12, borderTop: '1px dashed #e5e7eb',
}
const subTitleStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
  color: '#6b7280', marginBottom: 8,
}
const radioLabelStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#0f172a', cursor: 'pointer',
}
const customModelBoxStyle: React.CSSProperties = {
  padding: 12, background: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb',
}
const fieldLabelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4,
}
const selectStyle: React.CSSProperties = {
  width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #d1d5db',
  fontSize: 13, fontFamily: 'inherit', background: '#ffffff', boxSizing: 'border-box',
}
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db',
  fontSize: 13, fontFamily: 'inherit', background: '#ffffff', boxSizing: 'border-box', outline: 'none',
}
const textareaStyle: React.CSSProperties = {
  width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db',
  fontSize: 13, fontFamily: 'inherit', background: '#ffffff', boxSizing: 'border-box',
  outline: 'none', resize: 'vertical', lineHeight: 1.5,
}
const skillCardStyle: React.CSSProperties = {
  padding: 10, background: '#fafafa', border: '1px solid #eceef1', borderRadius: 8, marginBottom: 8,
}
const smallBtnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, background: '#eef2ff', color: '#1a4d8f',
  border: '1px solid #c7d2fe', borderRadius: 6, padding: '4px 10px', fontSize: 12,
  cursor: 'pointer', fontFamily: 'inherit',
}
const deleteBtnStyle: React.CSSProperties = {
  background: 'transparent', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: 6,
  padding: 6, cursor: 'pointer', display: 'flex', flexShrink: 0,
}
const switchStyle: React.CSSProperties = {
  width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
  position: 'relative', transition: 'background 0.15s', padding: 0, flexShrink: 0,
}
const switchKnobStyle: React.CSSProperties = {
  width: 18, height: 18, background: '#ffffff', borderRadius: '50%', position: 'absolute',
  top: 3, left: 3, transition: 'transform 0.15s', boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
}
const saveBarStyle: React.CSSProperties = {
  position: 'sticky', bottom: 0, background: '#ffffff', border: '1px solid #e5e7eb',
  borderRadius: 8, padding: 12, display: 'flex', justifyContent: 'space-between',
  alignItems: 'center', marginTop: 8,
}
const saveBtnStyle: React.CSSProperties = {
  background: '#1a4d8f', color: '#ffffff', border: 'none', borderRadius: 6, padding: '8px 16px',
  fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
  display: 'flex', alignItems: 'center', gap: 6,
}
