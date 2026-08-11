/**
 * AcervoPipelineConfig — configuracao do pipeline de analise do acervo.
 *
 * Permite ao admin master:
 *  - Ativar/desativar cada agente (classificador, ementa, keyPoints)
 *  - Ativar/desativar rerank com LLM no researcher-internal
 *  - Ajustar o limiar de ambiguidade para ativar rerank
 *  - Override de modelo LLM (opcional, default: usa o LLM global)
 */
import { useEffect, useState } from 'react'
import {
  Save, Loader2, CheckCircle2, AlertCircle, Brain, FileText, ListChecks, RefreshCw, Settings, Sliders,
} from 'lucide-react'
import { api } from '@/lib/api'

interface AcervoPipelineConfigState {
  enableClassifier: boolean
  enableEmenta: boolean
  enableKeyPoints: boolean
  enableLlmRerank: boolean
  llmOverride: {
    provider?: string
    model?: string
    apiKey?: string
  } | null
  rerankAmbiguityThreshold: number
}

const DEFAULT_CONFIG: AcervoPipelineConfigState = {
  enableClassifier: true,
  enableEmenta: true,
  enableKeyPoints: true,
  enableLlmRerank: true,
  llmOverride: null,
  rerankAmbiguityThreshold: 0.15,
}

export function AcervoPipelineConfig() {
  const [config, setConfig] = useState<AcervoPipelineConfigState>(DEFAULT_CONFIG)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showOverride, setShowOverride] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)

  useEffect(() => {
    void load()
  }, [])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const r = await api.getAcervoPipelineConfig()
      const data = (r.data as any)?.data || r.data
      setConfig({ ...DEFAULT_CONFIG, ...data })
      setShowOverride(!!data?.llmOverride)
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar')
    } finally {
      setLoading(false)
    }
  }

  async function save() {
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      await api.saveAcervoPipelineConfig(config)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  function update<K extends keyof AcervoPipelineConfigState>(key: K, value: AcervoPipelineConfigState[K]) {
    setConfig((c) => ({ ...c, [key]: value }))
  }

  if (loading) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: '#6b7280' }}>
        <Loader2 size={24} className="spin" /> Carregando configuracoes...
      </div>
    )
  }

  return (
    <div>
      {/* Secao 1: Agentes de analise */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>
          <Brain size={16} /> Agentes de Analise
        </h3>
        <p style={sectionDescStyle}>
          Cada documento do acervo passa por 3 agentes (em uma UNICA chamada LLM).
          Voce pode desativar agentes especificos se nao precisar do output.
        </p>

        <Toggle
          icon={<Brain size={16} color="#1a4d8f" />}
          label="Classificador"
          description="Classifica o documento em natureza (consultivo/executorio/etc), area do direito, assuntos, tipo, contexto."
          value={config.enableClassifier}
          onChange={(v) => update('enableClassifier', v)}
        />

        <Toggle
          icon={<FileText size={16} color="#1a4d8f" />}
          label="Ementa"
          description="Gera ementa estruturada com tipo, assunto, sintese, areas, topicos, conclusao e keywords para busca."
          value={config.enableEmenta}
          onChange={(v) => update('enableEmenta', v)}
        />

        <Toggle
          icon={<ListChecks size={16} color="#1a4d8f" />}
          label="Pontos Relevantes"
          description="Extrai pontos relevantes e trecho citavel para reuso em outras analises."
          value={config.enableKeyPoints}
          onChange={(v) => update('enableKeyPoints', v)}
        />
      </div>

      {/* Secao 2: Rerank */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>
          <RefreshCw size={16} /> Rerank com LLM (Pesquisa 3 camadas)
        </h3>
        <p style={sectionDescStyle}>
          O pesquisador interno usa 3 camadas: keyword pre-filter (0 LLMs), embedding similarity (0 LLMs),
          e rerank com LLM (1 chamada) SE houver ambiguidade nos top-K.
        </p>

        <Toggle
          icon={<RefreshCw size={16} color="#1a4d8f" />}
          label="Ativar rerank com LLM"
          description="Quando ON: chama o LLM para re-ranquear candidatos ambiguos (mais preciso, +latencia). OFF: usa apenas keyword + embedding."
          value={config.enableLlmRerank}
          onChange={(v) => update('enableLlmRerank', v)}
        />

        <div style={{ marginTop: 16, padding: 12, background: '#f9fafb', borderRadius: 8 }}>
          <label style={labelStyle}>
            <Sliders size={12} /> Limiar de ambiguidade: {(config.rerankAmbiguityThreshold * 100).toFixed(0)}%
          </label>
          <input
            type="range"
            min="0.05"
            max="0.5"
            step="0.05"
            value={config.rerankAmbiguityThreshold}
            onChange={(e) => update('rerankAmbiguityThreshold', parseFloat(e.target.value))}
            style={{ width: '100%', marginTop: 8 }}
            disabled={!config.enableLlmRerank}
          />
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
            Valores menores = rerank mais frequente (mais preciso, mais custoso).
            Valores maiores = rerank mais raro (mais rapido, menos preciso).
          </div>
        </div>
      </div>

      {/* Secao 3: Override de modelo */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>
          <Settings size={16} /> Modelo LLM (opcional)
        </h3>
        <p style={sectionDescStyle}>
          Por padrao, o pipeline usa o LLM global configurado. Ative o override para usar
          um modelo dedicado para o acervo (pode ser diferente do chat).
        </p>

        <Toggle
          icon={<Settings size={16} color="#1a4d8f" />}
          label="Usar modelo dedicado"
          description="Se ON: usa o provider/model/apiKey abaixo. Se OFF: usa o LLM global."
          value={showOverride}
          onChange={(v) => {
            setShowOverride(v)
            if (!v) update('llmOverride', null)
          }}
        />

        {showOverride && (
          <div style={{ marginTop: 12, padding: 12, background: '#f9fafb', borderRadius: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>Provider</label>
                <select
                  value={config.llmOverride?.provider || 'openrouter'}
                  onChange={(e) => update('llmOverride', { ...config.llmOverride, provider: e.target.value })}
                  style={selectStyle}
                >
                  <option value="openrouter">OpenRouter</option>
                  <option value="google">Google (Gemini)</option>
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Modelo</label>
                <input
                  type="text"
                  value={config.llmOverride?.model || ''}
                  onChange={(e) => update('llmOverride', { ...config.llmOverride, model: e.target.value })}
                  placeholder="ex: openai/gpt-4o-mini"
                  style={inputStyle}
                />
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <label style={labelStyle}>API Key</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={config.llmOverride?.apiKey || ''}
                  onChange={(e) => update('llmOverride', { ...config.llmOverride, apiKey: e.target.value })}
                  placeholder="sk-..."
                  style={inputStyle}
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  style={{ position: 'absolute', right: 8, top: 6, background: 'transparent', border: 'none', cursor: 'pointer' }}
                >
                  {showApiKey ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

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
          {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
          Salvar configuracoes
        </button>
      </div>
    </div>
  )
}

// ── Sub-componentes ────────────────────────────────────────────────────

function Toggle({
  icon, label, description, value, onChange,
}: { icon: React.ReactNode; label: string; description: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={toggleRowStyle}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flex: 1 }}>
        <div style={{ marginTop: 2 }}>{icon}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: '#0f172a' }}>{label}</div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{description}</div>
        </div>
      </div>
      <button
        onClick={() => onChange(!value)}
        style={{
          ...toggleBtnStyle,
          background: value ? '#1a4d8f' : '#d1d5db',
        }}
        aria-pressed={value}
      >
        <div style={{
          ...toggleKnobStyle,
          transform: value ? 'translateX(20px)' : 'translateX(0)',
        }} />
      </button>
    </div>
  )
}

// ── Estilos ────────────────────────────────────────────────────────────

const sectionStyle: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  padding: 16,
  marginBottom: 16,
}
const sectionTitleStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: '#0f172a',
  marginBottom: 4,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
}
const sectionDescStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#6b7280',
  marginBottom: 12,
  lineHeight: 1.5,
}
const toggleRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: 12,
  borderRadius: 6,
  background: '#f9fafb',
  marginBottom: 8,
}
const toggleBtnStyle: React.CSSProperties = {
  width: 44,
  height: 24,
  borderRadius: 12,
  border: 'none',
  cursor: 'pointer',
  position: 'relative',
  transition: 'background 0.15s',
  padding: 0,
}
const toggleKnobStyle: React.CSSProperties = {
  width: 18,
  height: 18,
  background: '#ffffff',
  borderRadius: '50%',
  position: 'absolute',
  top: 3,
  left: 3,
  transition: 'transform 0.15s',
  boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
}
const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: '#6b7280',
  textTransform: 'uppercase',
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  marginBottom: 4,
}
const selectStyle: React.CSSProperties = {
  padding: '6px 8px',
  borderRadius: 6,
  border: '1px solid #d1d5db',
  fontSize: 13,
  fontFamily: 'inherit',
  background: '#ffffff',
  width: '100%',
}
const inputStyle: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 6,
  border: '1px solid #d1d5db',
  fontSize: 13,
  fontFamily: 'inherit',
  background: '#ffffff',
  width: '100%',
}
const saveBarStyle: React.CSSProperties = {
  position: 'sticky',
  bottom: 0,
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  padding: 12,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginTop: 16,
}
const saveBtnStyle: React.CSSProperties = {
  background: '#1a4d8f',
  color: '#ffffff',
  border: 'none',
  borderRadius: 6,
  padding: '8px 16px',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
}
