/**
 * WebSearchConfig — configurações de pesquisa web externa.
 *
 * Estrutura em 3 sub-abas:
 *  1. **Busca web** — provedores clássicos (Tavily, Serper, Brave, Perplexity)
 *  2. **Deep search** — pesquisa profunda via LLM (OpenRouter)
 *  3. **Bases específicas** — DataJud (CNJ), MPRS Intranet
 *
 * A pesquisa SÓ é executada se:
 *  1. Admin master HABILITAR aqui
 *  2. Usuário ativar o toggle "+ Web externa" no chat
 */
import { useEffect, useState } from 'react'
import {
  Save, Loader2, CheckCircle2, AlertCircle, Eye, EyeOff, TestTube,
  Info, Search, Database, Sparkles,
} from 'lucide-react'
import { api } from '@/lib/api'

// ── Tipos ────────────────────────────────────────────────────────────────

type WebSearchProvider = 'tavily' | 'serper' | 'brave' | 'perplexity' | 'datajud' | 'mprs-intranet'

interface WebSearchConfigState {
  provider: WebSearchProvider
  apiKey: string
  enabled: boolean
  maxResultsPerQuery: number
  restrictToBR: boolean
  safeSearch: boolean
  recencyDays: number
  restrictDomains: string[]
  datajudTribunals: string[]
  searchModel?: string
}

interface DeepSearchConfigState {
  enabled: boolean
  useGlobalModel: boolean
  provider?: string
  model?: string
  apiKey: string
  maxTokens: number
  temperature: number
  maxSearchQueries: number
  restrictToBR: boolean
  recencyDays: number
}

type SubTab = 'web' | 'deep' | 'bases'

// ── Provedores de busca web ─────────────────────────────────────────────

const WEB_PROVIDERS = [
  {
    id: 'tavily' as const,
    name: 'Tavily',
    tagline: 'Busca otimizada para LLMs (recomendado)',
    origin: 'Empresa americana focada em retrieval para IA (Y Combinator 2023).',
    what: 'Faz busca na web e retorna resultados COM CONTEÚDO EXTRAÍDO (texto completo da página).',
    cost: 'Grátis: 1000 buscas/mês | Pro: US$ 30/mês (5.000)',
    signup: 'https://tavily.com',
    needsKey: true,
    keyPlaceholder: 'tvly-...',
    icon: '🔍',
  },
  {
    id: 'serper' as const,
    name: 'Serper (Google)',
    tagline: 'API de busca do Google',
    what: 'Acessa o índice do Google e devolve resultados SERP (links + snippets).',
    cost: 'Grátis: 2.500 queries | Depois: ~US$ 0,30/1k queries',
    signup: 'https://serper.dev',
    needsKey: true,
    keyPlaceholder: 'sua-api-key-serper',
    icon: '🔎',
  },
  {
    id: 'brave' as const,
    name: 'Brave Search',
    tagline: 'Busca com privacidade, índice próprio',
    what: 'Busca web genérica com bom índice brasileiro.',
    cost: 'Grátis: 2.000 queries/mês | Pro: US$ 3-9 por mil queries',
    signup: 'https://brave.com/search/api/',
    needsKey: true,
    keyPlaceholder: 'BSA...',
    icon: '🦁',
  },
  {
    id: 'perplexity' as const,
    name: 'Perplexity (Sonar)',
    tagline: 'Busca + IA — resposta sintetizada com citações',
    what: 'Em vez de devolver lista de links, faz busca + síntese e devolve TEXTO pronto com citações.',
    cost: 'sonar: ~US$ 1/M tokens | sonar-pro: ~US$ 3-15/M tokens',
    signup: 'https://docs.perplexity.ai',
    needsKey: true,
    keyPlaceholder: 'pplx-...',
    supportsModel: true,
    models: [
      { id: 'sonar', label: 'Sonar (rápido, ~$1/M tokens)' },
      { id: 'sonar-pro', label: 'Sonar Pro (qualidade, ~$3-15/M tokens)' },
    ],
    icon: '🧠',
  },
] as const

// ── Bases específicas ───────────────────────────────────────────────────

const BASE_PROVIDERS = [
  {
    id: 'datajud' as const,
    name: 'DataJud (CNJ)',
    tagline: 'Jurisprudência oficial de todos os tribunais brasileiros',
    origin: 'API pública do Conselho Nacional de Justiça (CNJ).',
    what: 'Pesquisa diretamente no Elasticsearch do CNJ. Cobre STF*, STJ, TST, TSE, TRFs (1-6), TJs estaduais.',
    cost: 'TOTALMENTE GRATUITO. Chave pública compartilhada já inclusa.',
    needsKey: false,
    keyPlaceholder: '(chave pública do CNJ já configurada — opcional substituir)',
    icon: '⚖️',
    special: 'datajud',
  },
  {
    id: 'mprs-intranet' as const,
    name: 'MPRS Intranet',
    tagline: 'Acesso à intranet do MP/RS (parte do corpus interno)',
    what: 'Acessa a intranet do MP/RS. A URL e credenciais ficam na aba dedicada.',
    cost: 'Sem custo (acesso institucional do MP/RS).',
    signup: 'Ver aba "Intranet MPRS"',
    needsKey: false,
    keyPlaceholder: '(configurado na aba "Intranet MPRS")',
    icon: '🏛️',
    special: 'mprs',
  },
] as const

// ── Tribunais DataJud ───────────────────────────────────────────────────

// TRIBUNAIS movido para a Fase 2 (config unificada)

const DEFAULTS_WEB: WebSearchConfigState = {
  provider: 'datajud',
  apiKey: '',
  enabled: false,
  maxResultsPerQuery: 5,
  restrictToBR: true,
  safeSearch: true,
  recencyDays: 365,
  restrictDomains: [],
  datajudTribunals: ['stj', 'trf4', 'tjrs'],
  searchModel: '',
}

const DEFAULTS_DEEP: DeepSearchConfigState = {
  enabled: false,
  useGlobalModel: true,        // default: usa o LLM global carregado
  provider: 'openrouter',
  model: '',
  apiKey: '',
  maxTokens: 2000,
  temperature: 0.3,
  maxSearchQueries: 3,
  restrictToBR: true,
  recencyDays: 365,
}

// ── Componente principal ───────────────────────────────────────────────

export function WebSearchConfig() {
  const [subTab, setSubTab] = useState<SubTab>('web')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <header>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a' }}>
          Pesquisa web externa
        </h2>
        <p style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
          Configure os provedores de busca que o Cofrito usa quando o usuário ativa
          “+ Web externa” no chat. Estas configurações são <strong>globais</strong> e valem
          para todos os usuários.
        </p>
      </header>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #e5e7eb' }}>
        <SubTabButton active={subTab === 'web'} onClick={() => setSubTab('web')} icon={<Search size={14} />}>
          Busca web
        </SubTabButton>
        <SubTabButton active={subTab === 'deep'} onClick={() => setSubTab('deep')} icon={<Sparkles size={14} />}>
          Deep search
        </SubTabButton>
        <SubTabButton active={subTab === 'bases'} onClick={() => setSubTab('bases')} icon={<Database size={14} />}>
          Bases específicas
        </SubTabButton>
      </div>

      {/* Conteúdo */}
      {subTab === 'web' && <WebSearchTab />}
      {subTab === 'deep' && <DeepSearchTab />}
      {subTab === 'bases' && <BasesTab />}
    </div>
  )
}

function SubTabButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '10px 16px', border: 'none', background: 'transparent',
        fontSize: 13, fontWeight: active ? 600 : 400,
        color: active ? '#1a4d8f' : '#6b7280',
        borderBottom: active ? '2px solid #1a4d8f' : '2px solid transparent',
        cursor: 'pointer', marginBottom: -1,
      }}
    >
      {icon} {children}
    </button>
  )
}

// ── TAB 1: BUSCA WEB (4 provedores) ─────────────────────────────────────

function WebSearchTab() {
  const [config, setConfig] = useState<WebSearchConfigState>(DEFAULTS_WEB)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [hasKey, setHasKey] = useState(false)
  const [showKey, setShowKey] = useState(false)
  // const [showProviderInfo, setShowProviderInfo] = useState<string | null>('tavily')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const cfg: any = await api.getWebSearchConfig()
      if (cfg) {
        setHasKey(!!cfg._hasApiKey)
        setConfig({
          ...cfg,
          apiKey: '',
          datajudTribunals: cfg.datajudTribunals || ['stj', 'trf4', 'tjrs'],
          restrictDomains: cfg.restrictDomains || [],
        })
      }
    } catch (err: any) {
      console.warn('getWebSearchConfig:', err?.message)
    } finally {
      setLoading(false)
    }
  }

  async function save() {
    setSaving(true)
    setStatus(null)
    try {
      const toSave = { ...config, apiKey: config.apiKey || '••••••' }
      const r: any = await api.saveWebSearchConfig(toSave)
      setStatus({ type: 'success', message: `Configuração salva às ${new Date(r.savedAt).toLocaleString('pt-BR')}` })
      setHasKey(true)
      setConfig({ ...config, apiKey: '' })
    } catch (err: any) {
      setStatus({ type: 'error', message: err?.message ?? 'Erro ao salvar' })
    } finally {
      setSaving(false)
    }
  }

  async function test() {
    setTesting(true)
    setStatus(null)
    try {
      const r: any = await api.testWebSearch({ query: 'improbidade administrativa TJRS 2024' })
      if (r.ok) {
        setStatus({ type: 'success', message: `✓ ${r.resultCount} resultados em ${r.latencyMs}ms` })
      } else {
        setStatus({ type: 'error', message: r.error || 'Teste falhou' })
      }
    } catch (err: any) {
      setStatus({ type: 'error', message: err?.message ?? 'Erro no teste' })
    } finally {
      setTesting(false)
    }
  }

  if (loading) {
    return <div style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>Carregando…</div>
  }

  const currentProvider = WEB_PROVIDERS.find((p) => p.id === config.provider) || WEB_PROVIDERS[0]
  const supportsKey = currentProvider?.needsKey ?? false

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 800 }}>
      <div style={{ padding: 16, background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 8, fontSize: 12, color: '#3730a3', lineHeight: 1.6 }}>
        <Info size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
        A <strong>busca web</strong> retorna lista de links e snippets. Se quiser resposta
        <strong> sintetizada e fundamentada</strong>, ative a aba <strong>Deep search</strong>.
      </div>

      <Section title="1. Habilitar busca web">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={config.enabled} onChange={e => setConfig({ ...config, enabled: e.target.checked })} />
          <span style={{ fontSize: 13, color: '#374151' }}>
            Permitir que o toggle “+ Web externa” apareça no chat (com este provedor)
          </span>
        </label>
      </Section>

      <Section title="2. Escolher provedor">
        <p style={{ fontSize: 11, color: '#6b7280', margin: '0 0 10px' }}>
          Cada provedor tem características, custos e API key próprios.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {WEB_PROVIDERS.map((p) => {
            const selected = config.provider === p.id
          
            return (
              <div key={p.id} style={{ border: selected ? '2px solid #1a4d8f' : '1px solid #e5e7eb', borderRadius: 6, background: selected ? '#f0f4ff' : '#fff', overflow: 'hidden' }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 12, cursor: 'pointer' }}>
                  <input type="radio" name="provider" value={p.id} checked={selected} onChange={() => setConfig({ ...config, provider: p.id as any, apiKey: '', searchModel: '' })} style={{ marginTop: 4 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 18 }}>{p.icon}</span>
                      <strong style={{ fontSize: 13, color: '#0f172a' }}>{p.name}</strong>
                      <span style={{ fontSize: 11, color: '#6b7280' }}>— {p.tagline}</span>
                    </div>
                  </div>
                </label>
              </div>
            )
          })}
        </div>
      </Section>

      {supportsKey && (
        <Section title="3. API Key">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type={showKey ? 'text' : 'password'}
              value={config.apiKey}
              onChange={e => setConfig({ ...config, apiKey: e.target.value })}
              placeholder={hasKey ? '••••••  (chave salva, cole para substituir)' : currentProvider.keyPlaceholder}
              style={{ flex: 1, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13 }}
            />
            <button type="button" onClick={() => setShowKey(!showKey)} style={{ padding: 8, border: '1px solid #d1d5db', borderRadius: 4, background: '#fff', cursor: 'pointer' }}>
              {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </Section>
      )}

      <Section title="4. Configurações de busca">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Resultados por query">
            <input type="number" min={1} max={20} value={config.maxResultsPerQuery} onChange={e => setConfig({ ...config, maxResultsPerQuery: +e.target.value })} style={inputStyle} />
          </Field>
          <Field label="Recência (dias)">
            <input type="number" min={0} max={3650} value={config.recencyDays} onChange={e => setConfig({ ...config, recencyDays: +e.target.value })} style={inputStyle} />
          </Field>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151', marginTop: 8 }}>
          <input type="checkbox" checked={config.restrictToBR} onChange={e => setConfig({ ...config, restrictToBR: e.target.checked })} />
          Restringir a domínios brasileiros
        </label>
      </Section>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={save} disabled={saving} style={primaryButtonStyle}>
          {saving ? <><Loader2 size={14} className="cofrito-spin" /> Salvando…</> : <><Save size={14} /> Salvar</>}
        </button>
        <button onClick={test} disabled={testing || !config.enabled} style={secondaryButtonStyle}>
          {testing ? <><Loader2 size={14} className="cofrito-spin" /> Testando…</> : <><TestTube size={14} /> Testar busca</>}
        </button>
        {status && (
          <div style={{ fontSize: 12, color: status.type === 'success' ? '#065f46' : '#dc2626', display: 'flex', alignItems: 'center', gap: 4 }}>
            {status.type === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
            {status.message}
          </div>
        )}
      </div>
    </div>
  )
}

// ── TAB 2: DEEP SEARCH ─────────────────────────────────────────────────

function DeepSearchTab() {
  const [config, setConfig] = useState<DeepSearchConfigState>(DEFAULTS_DEEP)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [hasKey, setHasKey] = useState(false)
  const [showKey, setShowKey] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const cfg: any = await api.getDeepSearchConfig()
      if (cfg) {
        setHasKey(!!cfg._hasApiKey)
        setConfig({ ...DEFAULTS_DEEP, ...cfg, apiKey: '' })
      }
    } catch (err: any) {
      console.warn('getDeepSearchConfig:', err?.message)
    } finally {
      setLoading(false)
    }
  }

  async function save() {
    setSaving(true)
    setStatus(null)
    try {
      const toSave = { ...config, apiKey: config.apiKey || '••••••' }
      const r: any = await api.saveDeepSearchConfig(toSave)
      setStatus({ type: 'success', message: `Configuração salva às ${new Date(r.savedAt).toLocaleString('pt-BR')}` })
      setHasKey(true)
      setConfig({ ...config, apiKey: '' })
    } catch (err: any) {
      setStatus({ type: 'error', message: err?.message ?? 'Erro ao salvar' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>Carregando…</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 800 }}>
      <div style={{ padding: 16, background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, fontSize: 12, color: '#78350f', lineHeight: 1.6 }}>
        <Sparkles size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
        <strong>Deep search</strong> é a skill de pesquisa web profunda com raciocínio. Diferente da busca web
        simples (que retorna links), a deep search <strong>gera queries</strong>, busca, lê snippets e <strong>sintetiza
        uma resposta fundamentada</strong> usando o LLM.
        <br /><br />
        <strong>Por padrão</strong>, se você já configurou um <strong>modelo LLM global</strong>, a skill
        <strong> reusa o mesmo modelo</strong> (sem novo carregamento de API). O orquestrador passa o controle
        para a skill, ela faz o trabalho, e depois reassume o chat para entregar a resposta.
      </div>

      <Section title="1. Habilitar deep search">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={config.enabled} onChange={e => setConfig({ ...config, enabled: e.target.checked })} />
          <span style={{ fontSize: 13, color: '#374151' }}>
            Permitir que o orquestrador use a skill de deep search quando o usuário ativa “+ Web externa”
          </span>
        </label>
      </Section>

      <Section title="2. Modelo LLM">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 12 }}>
          <input type="checkbox" checked={config.useGlobalModel} onChange={e => setConfig({ ...config, useGlobalModel: e.target.checked })} />
          <span style={{ fontSize: 13, color: '#374151' }}>
            <strong>Usar modelo LLM global</strong> (recomendado)
          </span>
        </label>
        <p style={{ fontSize: 11, color: '#6b7280', margin: '0 0 12px' }}>
          Se ativado, a skill usa o mesmo provider/model/apiKey já carregado pelo orquestrador.
          <br />
          Se desativado, você pode configurar um modelo dedicado abaixo.
        </p>

        {!config.useGlobalModel && (
          <div style={{ padding: 12, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Field label="Provedor">
              <select value={config.provider || 'openrouter'} onChange={e => setConfig({ ...config, provider: e.target.value })} style={inputStyle}>
                <option value="openrouter">OpenRouter</option>
                <option value="google">Google</option>
                <option value="anthropic">Anthropic</option>
                <option value="openai">OpenAI</option>
                <option value="deepseek">DeepSeek</option>
                <option value="perplexity">Perplexity</option>
              </select>
            </Field>
            <Field label="Modelo">
              <input type="text" value={config.model || ''} onChange={e => setConfig({ ...config, model: e.target.value })} placeholder="ex: anthropic/claude-3.5-sonnet" style={inputStyle} />
            </Field>
            <Field label="API Key">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type={showKey ? 'text' : 'password'} value={config.apiKey} onChange={e => setConfig({ ...config, apiKey: e.target.value })} placeholder={hasKey ? '••••••' : 'sk-...'} style={{ ...inputStyle, flex: 1 }} />
                <button type="button" onClick={() => setShowKey(!showKey)} style={{ padding: 8, border: '1px solid #d1d5db', borderRadius: 4, background: '#fff', cursor: 'pointer' }}>
                  {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </Field>
          </div>
        )}
      </Section>

      <Section title="3. Parâmetros da skill">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Max tokens (resposta)">
            <input type="number" min={100} max={8000} value={config.maxTokens} onChange={e => setConfig({ ...config, maxTokens: +e.target.value })} style={inputStyle} />
          </Field>
          <Field label="Temperatura">
            <input type="number" min={0} max={2} step={0.1} value={config.temperature} onChange={e => setConfig({ ...config, temperature: +e.target.value })} style={inputStyle} />
          </Field>
          <Field label="Max queries de busca">
            <input type="number" min={1} max={10} value={config.maxSearchQueries} onChange={e => setConfig({ ...config, maxSearchQueries: +e.target.value })} style={inputStyle} />
          </Field>
          <Field label="Recência (dias)">
            <input type="number" min={0} max={3650} value={config.recencyDays} onChange={e => setConfig({ ...config, recencyDays: +e.target.value })} style={inputStyle} />
          </Field>
        </div>
      </Section>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={save} disabled={saving} style={primaryButtonStyle}>
          {saving ? <><Loader2 size={14} className="cofrito-spin" /> Salvando…</> : <><Save size={14} /> Salvar</>}
        </button>
        {status && (
          <div style={{ fontSize: 12, color: status.type === 'success' ? '#065f46' : '#dc2626', display: 'flex', alignItems: 'center', gap: 4 }}>
            {status.type === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
            {status.message}
          </div>
        )}
      </div>
    </div>
  )
}

// ── TAB 3: BASES ESPECÍFICAS ──────────────────────────────────────────

function BasesTab() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 800 }}>
      <div style={{ padding: 16, background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 8, fontSize: 12, color: '#064e3b', lineHeight: 1.6 }}>
        <Database size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
        <strong>Bases específicas</strong> são fontes com APIs próprias (jurisprudência, intranet)
        — não são provedores de busca web genéricos. Configure cada uma na sua aba dedicada.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {BASE_PROVIDERS.map((p) => (
          <div key={p.id} style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: 12, background: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 18 }}>{p.icon}</span>
              <strong style={{ fontSize: 14, color: '#0f172a' }}>{p.name}</strong>
              <span style={{ fontSize: 11, color: '#6b7280' }}>— {p.tagline}</span>
            </div>
            <p style={{ fontSize: 12, color: '#4b5563', lineHeight: 1.5, margin: 0 }}>{p.what}</p>
            <p style={{ fontSize: 11, color: '#065f46', margin: '6px 0 0' }}>
              <strong>Custo:</strong> {p.cost}
            </p>
            {p.special === 'datajud' && (
              <p style={{ fontSize: 11, color: '#6b7280', margin: '4px 0 0' }}>
                <strong>Tribunais configuráveis</strong> em “Pesquisa global” → aba “Web search” →
                <em> (a aba Web Search herda essa config)</em>
              </p>
            )}
            {p.special === 'mprs' && (
              <p style={{ fontSize: 11, color: '#6b7280', margin: '4px 0 0' }}>
                <strong>Configurar URL e credenciais</strong> na aba <em>“Intranet MPRS”</em> no menu lateral.
              </p>
            )}
          </div>
        ))}
      </div>

      <p style={{ fontSize: 11, color: '#6b7280', fontStyle: 'italic' }}>
        A configuração de tribunais do DataJud continua na aba <strong>Pesquisa web</strong> principal (legado) e será
        unificada na Fase 2.
      </p>
    </div>
  )
}

// ── Helpers de UI ──────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>{title}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#4b5563', marginBottom: 4 }}>
        {label}
        {hint && <span style={{ fontWeight: 400, color: '#9ca3af', marginLeft: 6 }}>— {hint}</span>}
      </label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13, background: '#fff',
}

const primaryButtonStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '8px 16px', background: '#1a4d8f', color: '#fff',
  border: 'none', borderRadius: 4, fontSize: 13, cursor: 'pointer', fontWeight: 500,
}

const secondaryButtonStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '8px 16px', background: '#fff', color: '#374151',
  border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13, cursor: 'pointer', fontWeight: 500,
}
