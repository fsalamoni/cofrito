/**
 * WebSearchConfig — painel admin para configurar a pesquisa web.
 *
 * Persiste em: admin-config/web-search
 *
 * ATENÇÃO: a API key é mascarada na UI. Se for salva com •••••, mantém a anterior.
 */
import { useEffect, useState } from 'react'
import { Save, Loader2, CheckCircle2, AlertCircle, Eye, EyeOff, TestTube } from 'lucide-react'
import { api } from '@/lib/api'

const PROVIDERS = [
  { id: 'tavily', label: 'Tavily (recomendado para IA)', helpUrl: 'https://tavily.com' },
  { id: 'serper', label: 'Serper (Google Search API)', helpUrl: 'https://serper.dev' },
  { id: 'brave', label: 'Brave Search', helpUrl: 'https://brave.com/search/api/' },
  { id: 'perplexity', label: 'Perplexity (sonar)', helpUrl: 'https://docs.perplexity.ai' },
  { id: 'mprs-intranet', label: 'MPRS Intranet (configurar na aba)', helpUrl: '' },
] as const

export function WebSearchConfig() {
  const [config, setConfig] = useState<any>({
    provider: 'tavily',
    apiKey: '',
    enabled: false,
    maxResultsPerQuery: 5,
    restrictToBR: true,
    safeSearch: true,
    recencyDays: 365,
    restrictDomains: [],
  })
  const [, setOriginal] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [testResult, setTestResult] = useState<any>(null)
  const [hasKey, setHasKey] = useState(false)

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
          apiKey: '', // nunca trazer a key do servidor
        })
        setOriginal({ ...cfg, apiKey: '' })
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
      // Se a key não foi digitada, enviar com ••••• para manter a anterior
      const toSave = { ...config, apiKey: config.apiKey || '••••••' }
      const r: any = await api.saveWebSearchConfig(toSave)
      setStatus({ type: 'success', message: `Configuração salva às ${new Date(r.savedAt).toLocaleString('pt-BR')}` })
      setHasKey(true)
      setConfig({ ...config, apiKey: '' })
      setOriginal({ ...config, apiKey: '' })
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
      const r: any = await api.testWebSearch({ query: 'teste de busca Cofrito jurisprudência' })
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 720 }}>
      <div style={{
        padding: 16,
        background: '#fef3c7',
        border: '1px solid #fde68a',
        borderRadius: 8,
        fontSize: 12,
        color: '#78350f',
        lineHeight: 1.6,
      }}>
        ⚠️ A pesquisa web <strong>só é executada quando o usuário ativa o toggle "Pesquisa web" no chat</strong>.
        Por padrão o Cofrito pesquisa <strong>apenas no corpus interno</strong> (uploads + intranet MPRS se configurada).
        Para a aba "MPRS Intranet" use a próxima página de configuração.
      </div>

      <Section title="Habilitar">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
          />
          <span style={{ fontSize: 13, color: '#374151' }}>
            Habilitar pesquisa web (o toggle no chat passa a funcionar)
          </span>
        </label>
      </Section>

      <Section title="Provedor">
        {PROVIDERS.map((p) => (
          <label key={p.id} style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            cursor: 'pointer',
            padding: 8,
            background: config.provider === p.id ? '#eef2ff' : 'transparent',
            borderRadius: 6,
          }}>
            <input
              type="radio"
              name="provider"
              value={p.id}
              checked={config.provider === p.id}
              onChange={() => setConfig({ ...config, provider: p.id })}
              style={{ marginTop: 2 }}
            />
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#0f172a' }}>{p.label}</div>
              {p.helpUrl && (
                <a href={p.helpUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#1a4d8f' }}>
                  Obter API key ↗
                </a>
              )}
            </div>
          </label>
        ))}
      </Section>

      <Section title="API Key">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type={showKey ? 'text' : 'password'}
            value={config.apiKey}
            onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
            placeholder={hasKey ? '•••••• (key salva — digite nova para substituir)' : 'Cole aqui a API key do provedor'}
            style={{ ...inputStyle, flex: 1 }}
          />
          <button onClick={() => setShowKey((v) => !v)} style={iconBtnStyle} title={showKey ? 'Ocultar' : 'Mostrar'}>
            {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {hasKey && (
          <p style={{ fontSize: 11, color: '#059669', margin: 0 }}>
            ✓ Key salva no servidor (deixe o campo vazio para manter a atual)
          </p>
        )}
      </Section>

      <Section title="Comportamento">
        <Field label="Máximo de resultados por query" hint="Recomendado: 3-10. Mais resultados = mais lento e mais caro">
          <input
            type="number"
            min={1}
            max={20}
            value={config.maxResultsPerQuery}
            onChange={(e) => setConfig({ ...config, maxResultsPerQuery: parseInt(e.target.value) || 5 })}
            style={inputStyle}
          />
        </Field>
        <Field label="Recência preferida (dias)" hint="0 = sem filtro, 365 = 1 ano. Documentos fora desse intervalo perdem prioridade">
          <input
            type="number"
            min={0}
            max={3650}
            value={config.recencyDays}
            onChange={(e) => setConfig({ ...config, recencyDays: parseInt(e.target.value) || 0 })}
            style={inputStyle}
          />
        </Field>
        <Field label="Domínios restritos (um por linha)" hint="Opcional. Ex: mp.rs.gov.br, jusbrasil.com.br">
          <textarea
            value={(config.restrictDomains || []).join('\n')}
            onChange={(e) => setConfig({ ...config, restrictDomains: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })}
            placeholder="mp.rs.gov.br&#10;stj.jus.br&#10;planalto.gov.br"
            style={{ ...inputStyle, fontFamily: 'ui-monospace, monospace', minHeight: 80 }}
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

      {testResult && (
        <div style={{
          padding: 12,
          borderRadius: 8,
          background: testResult.ok ? '#ecfdf5' : '#fef2f2',
          border: `1px solid ${testResult.ok ? '#a7f3d0' : '#fecaca'}`,
          color: testResult.ok ? '#065f46' : '#991b1b',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 13 }}>
            {testResult.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            {testResult.ok ? 'Conexão OK' : 'Falha no teste'}
          </div>
          {testResult.ok && (
            <div style={{ fontSize: 12, marginTop: 6 }}>
              <div>Latência: <strong>{testResult.latencyMs}ms</strong></div>
              <div>Resultados: <strong>{testResult.resultCount}</strong></div>
            </div>
          )}
          {testResult.error && (
            <pre style={{ fontSize: 11, marginTop: 6, whiteSpace: 'pre-wrap' }}>{testResult.error}</pre>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={save} disabled={saving} style={{
          ...primaryBtnStyle,
          opacity: saving ? 0.5 : 1,
        }}>
          {saving ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
        <button onClick={test} disabled={testing || !config.enabled} style={{
          ...secondaryBtnStyle,
          opacity: testing || !config.enabled ? 0.5 : 1,
        }}>
          {testing ? <Loader2 size={16} className="spin" /> : <TestTube size={16} />}
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
