/**
 * IntranetConfig — painel admin para configurar a intranet MPRS.
 *
 * Persiste em: admin-config/intranet
 *
 * A intranet é SEMPRE consultada (independente do toggle "Pesquisa web"),
 * porque o corpus interno é o padrão do Cofrito.
 */
import { useEffect, useState } from 'react'
import { Save, Loader2, CheckCircle2, AlertCircle, Eye, EyeOff, TestTube } from 'lucide-react'
import { api } from '@/lib/api'

const AUTH_METHODS = [
  { id: 'form', label: 'Form (POST com username/password)' },
  { id: 'basic', label: 'HTTP Basic Auth' },
  { id: 'cookie', label: 'Cookie pré-existente (injetar manualmente)' },
  { id: 'sso-redirect', label: 'SSO com redirect (OAuth-like)' },
] as const

export function IntranetConfig() {
  const [config, setConfig] = useState<any>({
    enabled: false,
    baseUrl: '',
    authMethod: 'form',
    username: '',
    password: '',
    loginPath: '/login',
    searchPath: '/pesquisa?q={query}',
    documentPathPrefix: '/documento/',
    cookieDomain: '',
    cookieName: '',
    customHeaders: {},
    testStatus: 'untested',
  })
  const [, setOriginal] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [testResult, setTestResult] = useState<any>(null)
  const [hasPassword, setHasPassword] = useState(false)
  const [customHeadersText, setCustomHeadersText] = useState('')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    try {
      const cfg: any = await api.getIntranetConfig()
      if (cfg) {
        setHasPassword(!!cfg._hasPassword)
        setConfig({
          ...cfg,
          username: '',
          password: '',
        })
        setOriginal({ ...cfg, username: '', password: '' })
        const ch = cfg.customHeaders || {}
        setCustomHeadersText(
          Object.entries(ch).map(([k, v]) => `${k}: ${v}`).join('\n'),
        )
      }
    } catch (err: any) {
      console.warn('getIntranetConfig:', err?.message)
    } finally {
      setLoading(false)
    }
  }

  async function save() {
    setSaving(true)
    setStatus(null)
    try {
      const headers: Record<string, string> = {}
      for (const line of customHeadersText.split('\n')) {
        const m = line.match(/^([^:]+):\s*(.+)$/)
        if (m) headers[m[1].trim()] = m[2].trim()
      }
      const toSave = {
        ...config,
        customHeaders: headers,
        password: config.password || '••••••',
      }
      const r: any = await api.saveIntranetConfig(toSave)
      setStatus({ type: 'success', message: `Configuração salva às ${new Date(r.savedAt).toLocaleString('pt-BR')}` })
      setHasPassword(true)
      setConfig({ ...config, password: '' })
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
      const r: any = await api.testIntranet()
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
        background: '#eef2ff',
        border: '1px solid #c7d2fe',
        borderRadius: 8,
        fontSize: 12,
        color: '#3730a3',
        lineHeight: 1.6,
      }}>
        ℹ️ A <strong>intranet MPRS</strong> faz parte do corpus interno do Cofrito — ela é consultada
        <strong> mesmo sem o usuário ativar "Pesquisa web"</strong> no chat. É a fonte preferencial para
        jurisprudência, pareceres e atos do MP/RS. Recomendado configurar login/senha do MPRS para
        acesso autenticado.
      </div>

      <Section title="Habilitar">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
          />
          <span style={{ fontSize: 13, color: '#374151' }}>Habilitar consulta à intranet MPRS</span>
        </label>
      </Section>

      <Section title="Conexão">
        <Field label="URL base" hint="Ex: https://intranet.mp.rs.gov.br">
          <input
            type="url"
            value={config.baseUrl}
            onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
            placeholder="https://intranet.mp.rs.gov.br"
            style={inputStyle}
          />
        </Field>
        <Field label="Método de autenticação">
          <select
            value={config.authMethod}
            onChange={(e) => setConfig({ ...config, authMethod: e.target.value })}
            style={inputStyle}
          >
            {AUTH_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </Field>
      </Section>

      {config.authMethod === 'form' && (
        <Section title="Credenciais (form)">
          <Field label="Usuário">
            <input
              type="text"
              value={config.username}
              onChange={(e) => setConfig({ ...config, username: e.target.value })}
              placeholder="seu.usuario"
              style={inputStyle}
              autoComplete="off"
            />
          </Field>
          <Field label="Senha">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={config.password}
                onChange={(e) => setConfig({ ...config, password: e.target.value })}
                placeholder={hasPassword ? '•••••• (deixe vazio para manter)' : 'senha'}
                style={{ ...inputStyle, flex: 1 }}
                autoComplete="new-password"
              />
              <button onClick={() => setShowPassword((v) => !v)} style={iconBtnStyle} title={showPassword ? 'Ocultar' : 'Mostrar'}>
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </Field>
          <Field label="Caminho do login" hint="Path relativo à baseUrl para POST de credenciais. Ex: /auth/signin">
            <input
              type="text"
              value={config.loginPath || ''}
              onChange={(e) => setConfig({ ...config, loginPath: e.target.value })}
              placeholder="/auth/signin"
              style={inputStyle}
            />
          </Field>
        </Section>
      )}

      {config.authMethod === 'cookie' && (
        <Section title="Cookie pré-configurado">
          <Field label="Nome do cookie" hint="Ex: JSESSIONID, mp_session">
            <input
              type="text"
              value={config.cookieName || ''}
              onChange={(e) => setConfig({ ...config, cookieName: e.target.value })}
              placeholder="JSESSIONID"
              style={inputStyle}
            />
          </Field>
          <Field label="Valor do cookie" hint="Cole o valor do cookie obtido via DevTools (Application > Cookies)">
            <input
              type="password"
              value={config.password}
              onChange={(e) => setConfig({ ...config, password: e.target.value })}
              placeholder={hasPassword ? '••••••' : 'valor do cookie'}
              style={inputStyle}
            />
          </Field>
          <Field label="Domínio do cookie (opcional)">
            <input
              type="text"
              value={config.cookieDomain || ''}
              onChange={(e) => setConfig({ ...config, cookieDomain: e.target.value })}
              placeholder="intranet.mp.rs.gov.br"
              style={inputStyle}
            />
          </Field>
        </Section>
      )}

      {config.authMethod === 'basic' && (
        <Section title="HTTP Basic">
          <Field label="Usuário">
            <input
              type="text"
              value={config.username}
              onChange={(e) => setConfig({ ...config, username: e.target.value })}
              style={inputStyle}
            />
          </Field>
          <Field label="Senha">
            <input
              type="password"
              value={config.password}
              onChange={(e) => setConfig({ ...config, password: e.target.value })}
              placeholder={hasPassword ? '••••••' : 'senha'}
              style={inputStyle}
            />
          </Field>
        </Section>
      )}

      <Section title="Pesquisa e documentos">
        <Field label="Path de pesquisa" hint="Use {query} como placeholder. Ex: /pesquisa?q={query} ou /api/busca?termo={query}">
          <input
            type="text"
            value={config.searchPath || ''}
            onChange={(e) => setConfig({ ...config, searchPath: e.target.value })}
            placeholder="/pesquisa?q={query}"
            style={inputStyle}
          />
        </Field>
        <Field label="Prefixo de documentos" hint="Caminho-base para construir links de documentos. Ex: /documento/">
          <input
            type="text"
            value={config.documentPathPrefix || ''}
            onChange={(e) => setConfig({ ...config, documentPathPrefix: e.target.value })}
            placeholder="/documento/"
            style={inputStyle}
          />
        </Field>
      </Section>

      <Section title="Headers customizados (opcional)">
        <Field label="Headers extras" hint="Formato: Nome: Valor (um por linha). Ex: X-API-Key: abc123">
          <textarea
            value={customHeadersText}
            onChange={(e) => setCustomHeadersText(e.target.value)}
            placeholder="X-Api-Key: abc123&#10;User-Agent: Cofrito/1.0"
            style={{ ...inputStyle, fontFamily: 'ui-monospace, monospace', minHeight: 80 }}
          />
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
              <div>Status: <strong>{testResult.status}</strong></div>
              <div>Latência: <strong>{testResult.latencyMs}ms</strong></div>
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
        <button onClick={test} disabled={testing || !config.enabled || !config.baseUrl} style={{
          ...secondaryBtnStyle,
          opacity: testing || !config.enabled || !config.baseUrl ? 0.5 : 1,
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
