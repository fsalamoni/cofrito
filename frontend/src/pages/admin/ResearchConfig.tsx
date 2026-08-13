/* eslint-disable react/no-unescaped-entities */
/**
 * ResearchConfig — configurações GLOBAIS do pipeline de pesquisa.
 *
 * Estas configurações valem para TODOS os usuários e todos os meios de pesquisa
 * (corpus interno, intranet MPRS, pesquisa web, DataJud). São os "parâmetros
 * mestres" de como o Cofrito busca, filtra e apresenta documentos.
 *
 * Cada campo afeta um estágio diferente do pipeline multi-agente:
 *  - Cobertura → quantos documentos buscar
 *  - Atualidade → priorizar documentos recentes
 *  - Compilação → como organizar e formatar o resultado
 *  - Crítico → se deve iterar para melhorar a resposta
 */
import { useEffect, useState } from 'react'
import {
  Save, Loader2, CheckCircle2, AlertCircle, Info, BookOpen, Sliders,
} from 'lucide-react'
import { api } from '@/lib/api'

interface ResearchConfigState {
  maxSourcesPerPoint: number
  maxTotalSources: number
  preferRecentDays: number
  compilationMode: 'concise' | 'detailed' | 'raw'
  minRelevanceScore: number
  enableAutoLegalWriting: boolean
  intradayRecencyBoost: number
}

const PRESETS = {
  conservativo: {
    label: 'Conservador (somente documentos + análise crítica)',
    description: 'Respostas mais curtas, com filtragem rígida. Ideal para consultas pontuais.',
    config: {
      maxSourcesPerPoint: 4,
      maxTotalSources: 8,
      preferRecentDays: 180,
      compilationMode: 'concise' as const,
      minRelevanceScore: 0.55,
      enableAutoLegalWriting: false,
      intradayRecencyBoost: 0.3,
    },
  },
  padrao: {
    label: 'Padrão (recomendado)',
    description: 'Equilíbrio entre cobertura, atualidade e velocidade. Bom para uso geral.',
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
    label: 'Amplo (mais fontes, mais antigos)',
    description: 'Para pesquisa exploratória, exaustiva. Pode demorar mais.',
    config: {
      maxSourcesPerPoint: 8,
      maxTotalSources: 24,
      preferRecentDays: 1825,
      compilationMode: 'detailed' as const,
      minRelevanceScore: 0.3,
      enableAutoLegalWriting: false,
      intradayRecencyBoost: 0.1,
    },
  },
} as const

const DEFAULTS: ResearchConfigState = PRESETS.padrao.config as any

const FIELDS_INFO: Record<keyof ResearchConfigState, { label: string; help: string; impact: string }> = {
  maxSourcesPerPoint: {
    label: 'Máximo de fontes por ponto de pesquisa',
    help: 'Quantos documentos buscar para CADA ponto/pergunta individual que o Orquestrador extrai da consulta do usuário. Ex: se o user perguntar "O que é improbidade e quais as penas?", o orquestrador separa em 2 pontos (conceito + penas) e busca N docs para cada.',
    impact: '↑ mais = respostas mais completas, mas mais lento e mais custoso',
  },
  maxTotalSources: {
    label: 'Máximo total de fontes na resposta',
    help: 'Teto absoluto de documentos usados na resposta final. Nunca excede este número mesmo se maxSourcesPerPoint for maior.',
    impact: 'Acima de 20 pode confundir o usuário; abaixo de 5 pode ser pouco',
  },
  preferRecentDays: {
    label: 'Recência preferida (dias)',
    help: 'REGRAS PRIMORDIAIS: priorizar documentos mais recentes. Define uma "janela de preferência": documentos publicados nos últimos N dias ganham boost de relevância. 0 = sem filtro, 365 = 1 ano, 1825 = 5 anos.',
    impact: 'Quanto maior, mais antigo é aceito. Para MP, recomendado 365 (1 ano).',
  },
  minRelevanceScore: {
    label: 'Pontuação mínima de relevância (0-1)',
    help: 'Documentos abaixo deste score são descartados. Relevância = similaridade semântica (0-1) + boost de recência + peso da fonte. 0 = aceita qualquer match; 1 = somente match perfeito.',
    impact: 'Recomendado 0.4-0.6. Valores muito altos = poucas fontes. Muito baixos = fontes ruins.',
  },
  compilationMode: {
    label: 'Modo de compilação',
    help: 'Como o Compilador organiza os trechos antes de entregar ao Redator Jurídico.',
    impact: 'concise = texto enxuto; detailed = com contexto; raw = trechos literais puros',
  },
  enableAutoLegalWriting: {
    label: 'Análise jurídica automática',
    help: 'Se ON, o Redator Jurídico SEMPRE roda (mesmo sem o usuário pedir). Se OFF (padrão), o usuário precisa pedir explicitamente no chat (toggle "Análise jurídica") ou usar palavras como "analisar", "elaborar parecer", etc.',
    impact: 'ON = respostas sempre com análise (mais LLM = mais custo). OFF = user controla quando quer análise.',
  },
  intradayRecencyBoost: {
    label: 'Boost para publicação recente (0-1)',
    help: 'Boost EXTRA aplicado a documentos publicados nos últimos 30 dias. 0 = sem boost extra. 0.3 = boost moderado. Decai linearmente: 100% se hoje, 0% se 30+ dias.',
    impact: 'Para legislação/doutrina volátil, recomendado 0.2-0.3',
  },
}

export function ResearchConfig() {
  const [config, setConfig] = useState<ResearchConfigState>(DEFAULTS)
  const [original, setOriginal] = useState<ResearchConfigState>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const cfg: any = await api.getResearchConfig()
      if (cfg) {
        setConfig(cfg)
        setOriginal(cfg)
      }
    } catch (err: any) {
      console.warn('getResearchConfig:', err?.message)
    } finally {
      setLoading(false)
    }
  }

  async function save() {
    setSaving(true)
    setStatus(null)
    try {
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 800 }}>
      {/* Cabeçalho explicativo */}
      <div style={{ padding: 16, background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 8, fontSize: 12, color: '#3730a3', lineHeight: 1.6 }}>
        <Info size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
        Estas configurações são <strong>GLOBAIS</strong>: valem para todos os usuários e
        todos os meios (corpus interno, intranet MPRS, pesquisa web, DataJud).
        Definem como o pipeline multi-agente busca, filtra e apresenta documentos.
        <br /><br />
        <strong>REGRAS PRIMORDIAIS</strong> (sempre respeitadas, independente desta configuração):
        <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
          <li>Nunca inventar jurisprudência/doutrina/legislação</li>
          <li>Transcrição literal e integral dos documentos</li>
          <li>Todos os documentos vêm com link para a fonte</li>
          <li>Se nada for encontrado, o Cofrito diz literalmente "não foram encontrados materiais..."</li>
        </ul>
      </div>

      {/* Predefinições */}
      <Section title="Predefinições" icon={BookOpen}>
        <p style={{ fontSize: 11, color: '#6b7280', margin: '0 0 10px' }}>
          Comece com uma predefinição e ajuste fino se necessário.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(Object.keys(PRESETS) as Array<keyof typeof PRESETS>).map((k) => (
            <button
              key={k}
              onClick={() => applyPreset(k)}
              style={{
                textAlign: 'left',
                padding: 12,
                background: '#f8fafc',
                border: '1px solid #e5e7eb',
                borderRadius: 6,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{PRESETS[k].label}</div>
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{PRESETS[k].description}</div>
            </button>
          ))}
        </div>
      </Section>

      {/* Campos detalhados */}
      <Section title="Ajustes finos" icon={Sliders}>
        <p style={{ fontSize: 11, color: '#6b7280', margin: '0 0 10px' }}>
          Cada campo afeta um estágio do pipeline. Veja o impacto de cada um antes de alterar.
        </p>

        <Field
          label={FIELDS_INFO.maxSourcesPerPoint.label}
          help={FIELDS_INFO.maxSourcesPerPoint.help}
          impact={FIELDS_INFO.maxSourcesPerPoint.impact}
        >
          <input
            type="number"
            min={1}
            max={20}
            value={config.maxSourcesPerPoint}
            onChange={(e) => setConfig({ ...config, maxSourcesPerPoint: Math.max(1, Math.min(20, parseInt(e.target.value) || 1)) })}
            style={inputStyle}
          />
        </Field>

        <Field
          label={FIELDS_INFO.maxTotalSources.label}
          help={FIELDS_INFO.maxTotalSources.help}
          impact={FIELDS_INFO.maxTotalSources.impact}
        >
          <input
            type="number"
            min={1}
            max={50}
            value={config.maxTotalSources}
            onChange={(e) => setConfig({ ...config, maxTotalSources: Math.max(1, Math.min(50, parseInt(e.target.value) || 1)) })}
            style={inputStyle}
          />
        </Field>

        <Field
          label={FIELDS_INFO.minRelevanceScore.label}
          help={FIELDS_INFO.minRelevanceScore.help}
          impact={FIELDS_INFO.minRelevanceScore.impact}
        >
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={config.minRelevanceScore}
            onChange={(e) => setConfig({ ...config, minRelevanceScore: Math.max(0, Math.min(1, parseFloat(e.target.value) || 0)) })}
            style={inputStyle}
          />
        </Field>

        <Field
          label={FIELDS_INFO.preferRecentDays.label}
          help={FIELDS_INFO.preferRecentDays.help}
          impact={FIELDS_INFO.preferRecentDays.impact}
        >
          <input
            type="number"
            min={0}
            max={3650}
            value={config.preferRecentDays}
            onChange={(e) => setConfig({ ...config, preferRecentDays: Math.max(0, Math.min(3650, parseInt(e.target.value) || 0)) })}
            style={inputStyle}
          />
        </Field>

        <Field
          label={FIELDS_INFO.intradayRecencyBoost.label}
          help={FIELDS_INFO.intradayRecencyBoost.help}
          impact={FIELDS_INFO.intradayRecencyBoost.impact}
        >
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={config.intradayRecencyBoost}
            onChange={(e) => setConfig({ ...config, intradayRecencyBoost: Math.max(0, Math.min(1, parseFloat(e.target.value) || 0)) })}
            style={inputStyle}
          />
        </Field>

        <Field
          label={FIELDS_INFO.compilationMode.label}
          help={FIELDS_INFO.compilationMode.help}
          impact={FIELDS_INFO.compilationMode.impact}
        >
          <select
            value={config.compilationMode}
            onChange={(e) => setConfig({ ...config, compilationMode: e.target.value as any })}
            style={inputStyle}
          >
            <option value="concise">Conciso (consulta rápida)</option>
            <option value="detailed">Detalhado (recomendado para análise)</option>
            <option value="raw">Cru (apenas trechos literais, sem síntese)</option>
          </select>
        </Field>

        <Field
          label={FIELDS_INFO.enableAutoLegalWriting.label}
          help={FIELDS_INFO.enableAutoLegalWriting.help}
          impact={FIELDS_INFO.enableAutoLegalWriting.impact}
        >
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={config.enableAutoLegalWriting}
              onChange={(e) => setConfig({ ...config, enableAutoLegalWriting: e.target.checked })}
            />
            <span style={{ fontSize: 13, color: '#374151' }}>
              Sempre gerar análise jurídica automaticamente
            </span>
          </label>
        </Field>
      </Section>

      {status && (
        <div style={{
          padding: 12, borderRadius: 8,
          background: status.type === 'success' ? '#ecfdf5' : '#fef2f2',
          border: `1px solid ${status.type === 'success' ? '#a7f3d0' : '#fecaca'}`,
          color: status.type === 'success' ? '#065f46' : '#991b1b',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          {status.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {status.message}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={save}
          disabled={!dirty || saving}
          style={{
            ...primaryBtnStyle,
            opacity: !dirty || saving ? 0.5 : 1,
            cursor: !dirty || saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
          {saving ? 'Salvando…' : dirty ? 'Salvar alterações' : 'Sem alterações'}
        </button>
        <button onClick={load} style={secondaryBtnStyle}>Recarregar</button>
      </div>
    </div>
  )
}

function Section({ title, children, icon: Icon }: { title: string; children: React.ReactNode; icon?: any }) {
  return (
    <div style={{
      padding: 18,
      background: '#ffffff',
      border: '1px solid #e5e7eb',
      borderRadius: 8,
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
        {Icon && <Icon size={16} color="#1a4d8f" />}
        {title}
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>
    </div>
  )
}

function Field({ label, help, impact, children }: { label: string; help: string; impact: string; children: React.ReactNode }) {
  return (
    <div style={{ paddingBottom: 12, borderBottom: '1px dashed #e5e7eb' }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#0f172a', marginBottom: 4 }}>{label}</label>
      <p style={{ fontSize: 11, color: '#6b7280', margin: '0 0 4px', lineHeight: 1.5 }}>{help}</p>
      <p style={{ fontSize: 10, color: '#1a4d8f', margin: '0 0 8px', fontStyle: 'italic' }}>
        <strong>Impacto:</strong> {impact}
      </p>
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
