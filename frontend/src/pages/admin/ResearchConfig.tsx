/**
 * ResearchConfig — painel admin para configurar o pipeline de pesquisa.
 *
 * Persiste em: admin-config/research
 */
import { useEffect, useState } from 'react'
import { Save, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'

const PRESETS = {
  conservativo: {
    label: 'Conservador (somente documentos, com análise crítica)',
    config: {
      maxSourcesPerPoint: 4,
      maxTotalSources: 8,
      preferRecentDays: 180,
      compilationMode: 'detailed' as const,
      minRelevanceScore: 0.55,
      enableAutoLegalWriting: false,
      intradayRecencyBoost: 0.3,
    },
  },
  padrao: {
    label: 'Padrão (equilíbrio entre cobertura e atualidade)',
    config: {
      maxSourcesPerPoint: 5,
      maxTotalSources: 12,
      preferRecentDays: 365,
      compilationMode: 'detailed' as const,
      minRelevanceScore: 0.5,
      enableAutoLegalWriting: false,
      intradayRecencyBoost: 0.2,
    },
  },
  amplo: {
    label: 'Amplo (mais fontes, mais antigos, sem filtro rígido)',
    config: {
      maxSourcesPerPoint: 8,
      maxTotalSources: 24,
      preferRecentDays: 1825, // 5 anos
      compilationMode: 'detailed' as const,
      minRelevanceScore: 0.3,
      enableAutoLegalWriting: false,
      intradayRecencyBoost: 0.1,
    },
  },
} as const

const DEFAULTS: any = PRESETS.padrao.config

export function ResearchConfig() {
  const [config, setConfig] = useState(DEFAULTS)
  const [original, setOriginal] = useState(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    try {
      const { api } = await import('@/lib/api')
      const cfg = await api.getResearchConfig()
      if (cfg) {
        setConfig(cfg as any)
        setOriginal(cfg as any)
      }
    } catch (err: any) {
      // Sem config — usa defaults
      console.warn('getResearchConfig:', err?.message)
    } finally {
      setLoading(false)
    }
  }

  async function save() {
    setSaving(true)
    setStatus(null)
    try {
      const { api } = await import('@/lib/api')
      const r: any = await api.saveResearchConfig(config)
      setOriginal(config)
      setStatus({ type: 'success', message: `Configuração salva às ${new Date(r.savedAt).toLocaleString('pt-BR')}` })
    } catch (err: any) {
      setStatus({ type: 'error', message: err?.message ?? 'Erro ao salvar' })
    } finally {
      setSaving(false)
    }
  }

  function applyPreset(key: keyof typeof PRESETS) {
    setConfig(PRESETS[key].config as any)
  }

  const dirty = JSON.stringify(config) !== JSON.stringify(original)

  if (loading) {
    return <div style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>Carregando…</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 720 }}>
      <Section title="Predefinições">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(Object.keys(PRESETS) as Array<keyof typeof PRESETS>).map((k) => (
            <button key={k} onClick={() => applyPreset(k)} style={presetBtnStyle}>
              {PRESETS[k].label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Cobertura">
        <Field label="Máximo de fontes por ponto" hint="Quantos documentos buscar para cada ponto de pesquisa individual">
          <input
            type="number"
            min={1}
            max={20}
            value={config.maxSourcesPerPoint}
            onChange={(e) => setConfig({ ...config, maxSourcesPerPoint: parseInt(e.target.value) || 1 })}
            style={inputStyle}
          />
        </Field>
        <Field label="Máximo total de fontes" hint="Teto absoluto de documentos usados na resposta">
          <input
            type="number"
            min={1}
            max={50}
            value={config.maxTotalSources}
            onChange={(e) => setConfig({ ...config, maxTotalSources: parseInt(e.target.value) || 1 })}
            style={inputStyle}
          />
        </Field>
        <Field label="Pontuação mínima de relevância" hint="0 = qualquer match; 1 = somente perfeito. Recomendado 0.4-0.6">
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={config.minRelevanceScore}
            onChange={(e) => setConfig({ ...config, minRelevanceScore: parseFloat(e.target.value) || 0 })}
            style={inputStyle}
          />
        </Field>
      </Section>

      <Section title="Atualidade (REGRAS PRIMORDIAIS: priorizar mais recentes)">
        <Field label="Recência preferida (dias)" hint="Documentos publicados nos últimos N dias ganham boost. 0 = sem filtro, 365 = 1 ano (padrão), 1825 = 5 anos">
          <input
            type="number"
            min={0}
            max={3650}
            value={config.preferRecentDays}
            onChange={(e) => setConfig({ ...config, preferRecentDays: parseInt(e.target.value) || 0 })}
            style={inputStyle}
          />
        </Field>
        <Field label="Boost para publicação recente" hint="0 = sem boost, 0.5 = boost moderado. Aplica-se a documentos dos últimos 30 dias">
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={config.intradayRecencyBoost}
            onChange={(e) => setConfig({ ...config, intradayRecencyBoost: parseFloat(e.target.value) || 0 })}
            style={inputStyle}
          />
        </Field>
      </Section>

      <Section title="Compilação">
        <Field label="Modo de compilação" hint="concise = texto enxuto; detailed = com contexto; raw = trechos literais">
          <select
            value={config.compilationMode}
            onChange={(e) => setConfig({ ...config, compilationMode: e.target.value as any })}
            style={inputStyle}
          >
            <option value="concise">Conciso (recomendado para consulta rápida)</option>
            <option value="detailed">Detalhado (recomendado para análise)</option>
            <option value="raw">Cru (apenas trechos literais)</option>
          </select>
        </Field>
        <Field
          label="Análise jurídica automática"
          hint="Se ligado, o Redator Jurídico sempre roda. Se desligado, roda só quando o usuário pedir explicitamente no chat"
        >
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={config.enableAutoLegalWriting}
              onChange={(e) => setConfig({ ...config, enableAutoLegalWriting: e.target.checked })}
            />
            <span style={{ fontSize: 13, color: '#374151' }}>Sempre gerar análise jurídica (sem precisar pedir)</span>
          </label>
        </Field>
      </Section>

      {status && (
        <div style={{
          padding: 12,
          borderRadius: 8,
          background: status.type === 'success' ? '#ecfdf5' : '#fef2f2',
          border: `1px solid ${status.type === 'success' ? '#a7f3d0' : '#fecaca'}`,
          color: status.type === 'success' ? '#065f46' : '#991b1b',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          {status.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {status.message}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={save} disabled={!dirty || saving} style={{
          ...primaryBtnStyle,
          opacity: !dirty || saving ? 0.5 : 1,
          cursor: !dirty || saving ? 'not-allowed' : 'pointer',
        }}>
          {saving ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
          {saving ? 'Salvando…' : dirty ? 'Salvar alterações' : 'Sem alterações'}
        </button>
        <button onClick={load} style={secondaryBtnStyle}>Recarregar</button>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      padding: 20,
      background: '#ffffff',
      border: '1px solid #e5e7eb',
      borderRadius: 8,
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    }}>
      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{title}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 4 }}>{label}</label>
      {hint && <p style={{ fontSize: 11, color: '#6b7280', margin: '0 0 6px' }}>{hint}</p>}
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  fontSize: 13,
  border: '1px solid #d1d5db',
  borderRadius: 6,
  fontFamily: 'inherit',
  background: '#ffffff',
  outline: 'none',
}

const primaryBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 16px',
  background: '#1a4d8f',
  color: '#ffffff',
  border: 'none',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const secondaryBtnStyle: React.CSSProperties = {
  padding: '8px 16px',
  background: '#ffffff',
  color: '#374151',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const presetBtnStyle: React.CSSProperties = {
  padding: '8px 14px',
  background: '#f3f4f6',
  color: '#0f172a',
  border: '1px solid #e5e7eb',
  borderRadius: 6,
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
}
