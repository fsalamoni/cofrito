/* eslint-disable react/no-unescaped-entities */
/**
 * WebSearchConfig — configuração do provedor de pesquisa web externa.
 *
 * Importante: a pesquisa web SÓ é executada se:
 *  1. Admin master HABILITAR aqui (este painel)
 *  2. Usuário ativar o toggle "+ Web externa" no chat
 *
 * Se desabilitado aqui, o Cofrito usa APENAS o corpus interno
 * (uploads + intranet MPRS se configurada).
 *
 * Configurações separadas:
 *  - PROVEDOR: qual API de busca usar
 *  - API KEY: credencial (mascarada)
 *  - MODELO DE BUSCA (opcional, alguns provedores): modelo de IA
 *    para a busca (ex: Perplexity 'sonar' vs 'sonar-pro')
 */
import { useEffect, useState } from 'react'
import {
  Save, Loader2, CheckCircle2, AlertCircle, Eye, EyeOff, TestTube,
  Info, ExternalLink,
} from 'lucide-react'
import { api } from '@/lib/api'

interface WebSearchConfigState {
  provider: 'tavily' | 'serper' | 'brave' | 'perplexity' | 'mprs-intranet' | 'datajud'
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

const PROVIDERS = [
  {
    id: 'tavily' as const,
    name: 'Tavily',
    tagline: 'Busca otimizada para LLMs (recomendado)',
    origin: 'Empresa americana focada em retrieval para IA (Y Combinator 2023).',
    what: 'Faz busca na web e retorna resultados COM CONTEÚDO EXTRAÍDO (texto completo da página). Otimizado para uso por agentes de IA.',
    cost: 'Grátis: 1000 buscas/mês | Pro: US$ 30/mês (5.000 buscas) | Scale: US$ 100/mês (20.000)',
    signup: 'https://tavily.com',
    sameAsLLM: 'Não (Tavily é uma empresa separada)',
    needsKey: true,
    keyPlaceholder: 'tvly-...',
    supportsModel: false,
    icon: '🔍',
  },
  {
    id: 'serper' as const,
    name: 'Serper (Google)',
    tagline: 'API de busca do Google (paga por uso)',
    origin: 'Empresa americana, parceira Google. Equivalente à antiga Google Custom Search JSON API.',
    what: 'Acessa o índice do Google e devolve resultados SERP (links + snippets). Não extrai conteúdo — só metadados.',
    cost: 'Grátis: 2.500 queries (1 conta) | Depois: ~US$ 0,30/1k queries (~$1 = 3.300 queries)',
    signup: 'https://serper.dev',
    sameAsLLM: 'Não',
    needsKey: true,
    keyPlaceholder: 'sua-api-key-serper',
    supportsModel: false,
    icon: '🔎',
  },
  {
    id: 'brave' as const,
    name: 'Brave Search',
    tagline: 'Busca com privacidade, índice próprio',
    origin: 'Brave Software (criador do navegador Brave). Índice web próprio, sem rastrear usuários.',
    what: 'Busca web genérica com bom índice brasileiro. Privacidade forte.',
    cost: 'Grátis: 2.000 queries/mês (1 qps) | Pro: US$ 3-9 por mil queries | Enterprise sob contrato',
    signup: 'https://brave.com/search/api/',
    sameAsLLM: 'Não',
    needsKey: true,
    keyPlaceholder: 'BSA...',
    supportsModel: false,
    icon: '🦁',
  },
  {
    id: 'perplexity' as const,
    name: 'Perplexity (Sonar)',
    tagline: 'Busca + IA — devolve resposta sintetizada com citações',
    origin: 'Perplexity AI (empresa americana). Modelo proprietário "sonar" baseado em Llama/Mistral.',
    what: 'Em vez de devolver lista de links, faz busca + síntese e devolve TEXTO pronto com citações. Ideal para respostas diretas.',
    cost: 'sonar (small): ~US$ 1/M tokens (input) / ~US$ 1/M (output) | sonar-pro: ~US$ 3/M (input) / ~US$ 15/M (output). 1 busca ≈ 1k tokens.',
    signup: 'https://docs.perplexity.ai',
    sameAsLLM: 'NÃO — Perplexity tem API PRÓPRIA (chave separada). Mas pode usar o MESMO provider se você configurar OpenRouter com o modelo "perplexity/sonar" — nesse caso a chave do Perplexity aqui é OPCIONAL.',
    needsKey: true,
    keyPlaceholder: 'pplx-...',
    supportsModel: true,
    models: [
      { id: 'sonar', label: 'Sonar (rápido, ~$1/M tokens)' },
      { id: 'sonar-pro', label: 'Sonar Pro (qualidade, ~$3-15/M tokens)' },
    ],
    icon: '🧠',
  },
  {
    id: 'datajud' as const,
    name: 'DataJud (CNJ)',
    tagline: 'Jurisprudência oficial de todos os tribunais brasileiros',
    origin: 'API pública do Conselho Nacional de Justiça (CNJ). Documentada em datajud-wiki.cnj.jus.br.',
    what: 'Pesquisa diretamente no Elasticsearch do CNJ. Cobre STF*, STJ, TST, TSE, TRFs (1-6), TJs estaduais (incluindo TJRS). Retorna metadados + ementa + inteiro teor quando disponível.',
    cost: 'TOTALMENTE GRATUITO. Chave pública compartilhada já inclusa (não precisa configurar).',
    signup: 'Não precisa — chave pública do CNJ já está embutida.',
    sameAsLLM: 'NÃO tem relação com o LLM. É uma base de dados jurídica.',
    needsKey: false, // chave pública
    keyPlaceholder: '(chave pública do CNJ já configurada — opcional substituir)',
    supportsModel: false,
    icon: '⚖️',
    special: 'datajud',
  },
  {
    id: 'mprs-intranet' as const,
    name: 'MPRS Intranet',
    tagline: 'Acesso à intranet do MP/RS (parte do corpus interno)',
    origin: 'Configuração especial — ver aba "Intranet MPRS" no menu lateral.',
    what: 'Acessa a intranet do Ministério Público do RS. Esta aba apenas SELECIONA o provedor; a URL e credenciais ficam na aba dedicada.',
    cost: 'Sem custo (acesso institucional do MP/RS).',
    signup: 'Ver aba "Intranet MPRS"',
    sameAsLLM: 'N/A',
    needsKey: false, // configurado em outra aba
    keyPlaceholder: '(configurado na aba "Intranet MPRS")',
    supportsModel: false,
    icon: '🏛️',
    special: 'mprs',
  },
] as const

const DATAJUD_TRIBUNAL_OPTIONS = [
  { id: 'stj',  label: 'STJ — Superior Tribunal de Justiça' },
  { id: 'tst',  label: 'TST — Tribunal Superior do Trabalho' },
  { id: 'tse',  label: 'TSE — Tribunal Superior Eleitoral' },
  { id: 'trf1', label: 'TRF1 — 1ª Região' },
  { id: 'trf2', label: 'TRF2 — 2ª Região' },
  { id: 'trf3', label: 'TRF3 — 3ª Região' },
  { id: 'trf4', label: 'TRF4 — 4ª Região (RS, SC, PR)' },
  { id: 'trf5', label: 'TRF5 — 5ª Região (NE)' },
  { id: 'trf6', label: 'TRF6 — 6ª Região (MG)' },
  { id: 'tjrs', label: 'TJRS — Tribunal de Justiça do RS' },
  { id: 'tjsp', label: 'TJSP — Tribunal de Justiça de SP' },
  { id: 'tjrj', label: 'TJRJ — Tribunal de Justiça do RJ' },
  { id: 'tjmg', label: 'TJMG — Tribunal de Justiça de MG' },
  { id: 'tjpr', label: 'TJPR — Tribunal de Justiça do PR' },
  { id: 'tjsc', label: 'TJSC — Tribunal de Justiça de SC' },
  { id: 'tjba', label: 'TJBA — Tribunal de Justiça da BA' },
  { id: 'tjpe', label: 'TJPE — Tribunal de Justiça de PE' },
  { id: 'tjdft', label: 'TJDFT — Tribunal de Justiça do DF' },
]

export function WebSearchConfig() {
  const [config, setConfig] = useState<WebSearchConfigState>({
    provider: 'datajud', // default: datajud (gratuito, jurisprudência)
    apiKey: '',
    enabled: false,
    maxResultsPerQuery: 5,
    restrictToBR: true,
    safeSearch: true,
    recencyDays: 365,
    restrictDomains: [],
    datajudTribunals: ['stj', 'trf4', 'tjrs'],
    searchModel: '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [testResult, setTestResult] = useState<any>(null)
  const [hasKey, setHasKey] = useState(false)
  const [showProviderInfo, setShowProviderInfo] = useState<string | null>('datajud')

  useEffect(() => {
    load()
  }, [])

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
    setTestResult(null)
    try {
      const r: any = await api.testWebSearch({ query: 'improbidade administrativa TJRS 2024' })
      setTestResult(r)
    } catch (err: any) {
      setTestResult({ ok: false, error: err?.message })
    } finally {
      setTesting(false)
    }
  }

  if (loading) {
    return <div style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>Carregando…</div>
  }

  const currentProvider = PROVIDERS.find((p) => p.id === config.provider)!
  const supportsKey = currentProvider.needsKey

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 800 }}>
      {/* Aviso */}
      <div style={{ padding: 16, background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 8, fontSize: 12, color: '#3730a3', lineHeight: 1.6 }}>
        <Info size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
        A pesquisa web SÓ é executada quando <strong>o usuário ativa "+ Web externa"</strong> no chat.
        Por padrão o Cofrito usa <strong>somente o corpus interno</strong> (uploads + intranet MPRS).
        Esta configuração é <strong>global</strong> (vale para todos os usuários).
      </div>

      {/* Habilitar */}
      <Section title="1. Habilitar pesquisa web">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
          />
          <span style={{ fontSize: 13, color: '#374151' }}>
            Permitir que o toggle "+ Web externa" apareça no chat
          </span>
        </label>
      </Section>

      {/* Provedor */}
      <Section title="2. Escolher provedor">
        <p style={{ fontSize: 11, color: '#6b7280', margin: '0 0 10px' }}>
          Cada provedor tem características, custos e API key próprios. Clique para expandir a explicação.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {PROVIDERS.map((p) => {
            const selected = config.provider === p.id
            const isOpen = showProviderInfo === p.id
            return (
              <div key={p.id} style={{
                border: selected ? '2px solid #1a4d8f' : '1px solid #e5e7eb',
                borderRadius: 6,
                background: selected ? '#f0f4ff' : '#ffffff',
                overflow: 'hidden',
              }}>
                <label style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  padding: 12,
                  cursor: 'pointer',
                }}>
                  <input
                    type="radio"
                    name="provider"
                    value={p.id}
                    checked={selected}
                    onChange={() => setConfig({ ...config, provider: p.id, apiKey: '', searchModel: '' })}
                    style={{ marginTop: 4 }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 18 }}>{p.icon}</span>
                      <strong style={{ fontSize: 13, color: '#0f172a' }}>{p.name}</strong>
                      <span style={{ fontSize: 11, color: '#6b7280' }}>— {p.tagline}</span>
                      {p.id === 'datajud' && (
                        <span style={{ fontSize: 10, background: '#065f46', color: '#ffffff', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>
                          RECOMENDADO PARA JURISPRUDÊNCIA
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); setShowProviderInfo(isOpen ? null : p.id) }}
                      style={{ fontSize: 11, color: '#1a4d8f', background: 'transparent', border: 'none', padding: '4px 0', cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      {isOpen ? '▼' : '▶'} Ver detalhes
                    </button>
                    {isOpen && (
                      <div style={{ marginTop: 8, padding: 10, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 4, fontSize: 11, color: '#374151', lineHeight: 1.5 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: 6 }}>
                          <strong>Origem:</strong><span>{p.origin}</span>
                          <strong>O que faz:</strong><span>{p.what}</span>
                          <strong>Custo:</strong><span style={{ color: '#065f46' }}>{p.cost}</span>
                          <strong>Mesmo LLM?</strong><span>{p.sameAsLLM}</span>
                          {!p.needsKey && (
                            <>
                              <strong>API Key:</strong>
                              <span style={{ color: '#6b7280' }}>Não obrigatória (chave pública)</span>
                            </>
                          )}
                          {p.signup !== 'Não precisa — chave pública do CNJ já está embutida.' && p.signup !== 'Ver aba "Intranet MPRS"' && (
                            <>
                              <strong>Cadastro:</strong>
                              <a href={p.signup} target="_blank" rel="noopener noreferrer" style={{ color: '#1a4d8f' }}>
                                {p.signup} <ExternalLink size={10} style={{ verticalAlign: 'middle' }} />
                              </a>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </label>
              </div>
            )
          })}
        </div>
      </Section>

      {/* API Key + Modelo (condicional) */}
      {supportsKey && (
        <Section title={`3. API Key do ${currentProvider.name}`}>
          <Field label="API Key" hint={currentProvider.keyPlaceholder ? `Exemplo de formato: ${currentProvider.keyPlaceholder}` : ''}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type={showKey ? 'text' : 'password'}
                value={config.apiKey}
                onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                placeholder={currentProvider.keyPlaceholder}
                style={{ ...inputStyle, flex: 1 }}
                autoComplete="off"
              />
              <button onClick={() => setShowKey((v) => !v)} style={iconBtnStyle} title={showKey ? 'Ocultar' : 'Mostrar'}>
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            {hasKey && (
              <p style={{ fontSize: 11, color: '#059669', margin: '4px 0 0' }}>
                ✓ Key salva no servidor (deixe vazio para manter a atual)
              </p>
            )}
          </Field>

          {currentProvider.supportsModel && (
            <Field label="Modelo de busca" hint="Perplexity aceita modelos diferentes. 'sonar' é mais barato; 'sonar-pro' tem qualidade maior.">
              <select
                value={config.searchModel || ''}
                onChange={(e) => setConfig({ ...config, searchModel: e.target.value })}
                style={inputStyle}
              >
                <option value="">(padrão do provider)</option>
                {currentProvider.models?.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </Field>
          )}
        </Section>
      )}

      {config.provider === 'datajud' && (
        <Section title="3. Tribunais do DataJud">
          <Field
            label="Quais tribunais consultar?"
            hint="Recomendado para o MP/RS: STJ + TRF4 + TJRS. Adicione mais se quiser cobertura nacional."
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 6 }}>
              {DATAJUD_TRIBUNAL_OPTIONS.map((t) => (
                <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={config.datajudTribunals.includes(t.id)}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...config.datajudTribunals, t.id]
                        : config.datajudTribunals.filter((x) => x !== t.id)
                      setConfig({ ...config, datajudTribunals: next })
                    }}
                  />
                  <span>{t.label}</span>
                </label>
              ))}
            </div>
          </Field>
        </Section>
      )}

      <Section title="4. Comportamento">
        <Field label="Máximo de resultados por query" hint="Recomendado: 3-10. Mais = mais lento e mais caro.">
          <input
            type="number"
            min={1}
            max={30}
            value={config.maxResultsPerQuery}
            onChange={(e) => setConfig({ ...config, maxResultsPerQuery: parseInt(e.target.value) || 5 })}
            style={inputStyle}
          />
        </Field>
        <Field label="Recência preferida (dias)" hint="0 = sem filtro. 365 = priorizar últimos 12 meses.">
          <input
            type="number"
            min={0}
            max={3650}
            value={config.recencyDays}
            onChange={(e) => setConfig({ ...config, recencyDays: parseInt(e.target.value) || 0 })}
            style={inputStyle}
          />
        </Field>
        <Field label="Domínios restritos (um por linha)" hint="Opcional. Ex: mp.rs.gov.br, jusbrasil.com.br. Vazio = sem restrição.">
          <textarea
            value={config.restrictDomains.join('\n')}
            onChange={(e) => setConfig({ ...config, restrictDomains: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })}
            placeholder="mp.rs.gov.br&#10;stj.jus.br&#10;planalto.gov.br"
            style={{ ...inputStyle, fontFamily: 'ui-monospace, monospace', minHeight: 70 }}
          />
        </Field>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={config.restrictToBR}
            onChange={(e) => setConfig({ ...config, restrictToBR: e.target.checked })}
          />
          <span style={{ fontSize: 13, color: '#374151' }}>Restringir a resultados do Brasil</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={config.safeSearch}
            onChange={(e) => setConfig({ ...config, safeSearch: e.target.checked })}
          />
          <span style={{ fontSize: 13, color: '#374151' }}>Safe search ativado</span>
        </label>
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

      {testResult && (
        <div style={{
          padding: 12, borderRadius: 8,
          background: testResult.ok ? '#ecfdf5' : '#fef2f2',
          border: `1px solid ${testResult.ok ? '#a7f3d0' : '#fecaca'}`,
          color: testResult.ok ? '#065f46' : '#991b1b',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 13 }}>
            {testResult.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            {testResult.ok ? 'Teste OK' : 'Falha no teste'}
          </div>
          {testResult.ok && (
            <div style={{ fontSize: 12, marginTop: 6 }}>
              <div>Latência: <strong>{testResult.latencyMs}ms</strong></div>
              <div>Resultados encontrados: <strong>{testResult.resultCount}</strong></div>
            </div>
          )}
          {testResult.error && (
            <pre style={{ fontSize: 11, marginTop: 6, whiteSpace: 'pre-wrap' }}>{testResult.error}</pre>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={save} disabled={saving} style={{
          ...primaryBtnStyle, opacity: saving ? 0.5 : 1,
        }}>
          {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
        <button onClick={test} disabled={testing || !config.enabled} style={{
          ...secondaryBtnStyle, opacity: testing || !config.enabled ? 0.5 : 1,
        }}>
          {testing ? <Loader2 size={14} className="spin" /> : <TestTube size={14} />}
          {testing ? 'Testando…' : 'Testar conexão'}
        </button>
        <button onClick={load} style={secondaryBtnStyle}>Recarregar</button>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      padding: 18,
      background: '#ffffff',
      border: '1px solid #e5e7eb',
      borderRadius: 8,
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{title}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>
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
  display: 'flex',
  alignItems: 'center',
  gap: 6,
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

const iconBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 36,
  height: 36,
  background: '#f3f4f6',
  color: '#374151',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  cursor: 'pointer',
}
