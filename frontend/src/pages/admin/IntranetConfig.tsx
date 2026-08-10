/* eslint-disable react/no-unescaped-entities */
/**
 * IntranetConfig — configuração de acesso à intranet do MP/RS.
 *
 * A intranet é parte do CORPUS INTERNO do Cofrito (não precisa do toggle
 * "+ Web externa" no chat). Quando configurada e habilitada, o Pesquisador
 * Interno do pipeline a consulta automaticamente.
 *
 * 4 métodos de autenticação suportados:
 *  - form: POST username/password (mais comum)
 *  - basic: HTTP Basic Auth (header Authorization)
 *  - cookie: cookie pré-existente (você cola o valor)
 *  - sso-redirect: SSO com redirect (OAuth-like — mais complexo)
 */
import { useEffect, useState } from 'react'
import {
  Save, Loader2, CheckCircle2, AlertCircle, Eye, EyeOff, TestTube,
  Info, Building2,
} from 'lucide-react'
import { api } from '@/lib/api'

interface IntranetConfigState {
  enabled: boolean
  baseUrl: string
  authMethod: 'form' | 'basic' | 'cookie' | 'sso-redirect'
  username: string
  password: string
  loginPath: string
  searchPath: string
  documentPathPrefix: string
  cookieDomain: string
  cookieName: string
  customHeaders: Record<string, string>
}

const STEPS = [
  { n: 1, title: 'Descobrir a URL base', help: 'Pergunte ao TI do MP ou acesse a intranet pelo navegador e copie a URL raiz (ex: https://intranet.mp.rs.gov.br).' },
  { n: 2, title: 'Verificar acesso autenticado', help: 'A intranet exige login? Em qual tela? Copie a URL de login (ex: /login, /auth/signin, /sso/redirect).' },
  { n: 3, title: 'Testar busca de documentos', help: 'Tente buscar por um documento. Veja a URL — o "caminho de busca" geralmente é /pesquisa?q=... ou /api/busca?termo=...' },
  { n: 4, title: 'Configurar credenciais', help: 'Crie um usuário de serviço no MP (com o TI) dedicado ao Cofrito. Não use seu usuário pessoal.' },
  { n: 5, title: 'Testar a conexão', help: 'Use o botão "Testar conexão" abaixo. Se retornar OK, salve e ative.' },
]

const AUTH_METHOD_INFO: Record<string, { label: string; description: string; needs: readonly string[]; recommended?: boolean }> = {
  'form': {
    label: 'Form (POST com username/password)',
    description: 'Mais comum. O Cofrito faz POST com username+password para o caminho de login e armazena o cookie de sessão retornado.',
    needs: ['URL base', 'Caminho do login (ex: /login)', 'Usuário', 'Senha'],
    recommended: true,
  },
  'basic': {
    label: 'HTTP Basic Auth',
    description: 'Header Authorization: Basic base64(user:pass). Poucas intranets usam isso; geralmente é via form.',
    needs: ['URL base', 'Usuário', 'Senha'],
  },
  'cookie': {
    label: 'Cookie pré-existente',
    description: 'Você cola manualmente o valor de um cookie de sessão válido (obtido via DevTools > Application > Cookies). O Cofrito envia esse cookie em todas as requisições. ATENÇÃO: cookies expiram — pode ser necessário atualizar periodicamente.',
    needs: ['URL base', 'Nome do cookie (ex: JSESSIONID)', 'Valor do cookie (senha)'],
  },
  'sso-redirect': {
    label: 'SSO com redirect (OAuth-like)',
    description: 'Para intranets que usam SSO corporativo (ex: Azure AD, Google Workspace). Mais complexo — pode requerer cooperação do TI do MP.',
    needs: ['URL base', 'Caminho do SSO', 'Configurações específicas do IdP'],
  },
}

export function IntranetConfig() {
  const [config, setConfig] = useState<IntranetConfigState>({
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
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [testResult, setTestResult] = useState<any>(null)
  const [hasPassword, setHasPassword] = useState(false)
  const [customHeadersText, setCustomHeadersText] = useState('')
  const [showSteps, setShowSteps] = useState(false)

  useEffect(() => { load() }, [])

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

  // const _methodInfo = AUTH_METHOD_INFO[config.authMethod]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 800 }}>
      {/* Card explicativo */}
      <div style={{ padding: 16, background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 8, fontSize: 12, color: '#3730a3', lineHeight: 1.6 }}>
        <Building2 size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
        A intranet do MP/RS faz parte do <strong>corpus interno</strong> do Cofrito.
        Quando configurada e habilitada, o Pesquisador Interno a consulta automaticamente —
        <strong> mesmo sem o usuário ativar "+ Web externa"</strong> no chat.
        É a fonte preferencial para atos, pareceres e comunicações internas do MP.
      </div>

      {/* Passo-a-passo */}
      <div style={{ padding: 16, background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8 }}>
        <button
          onClick={() => setShowSteps((v) => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'transparent', border: 'none', padding: 0,
            cursor: 'pointer', fontFamily: 'inherit', color: '#0f172a',
          }}
        >
          <Info size={14} color="#1a4d8f" />
          <strong style={{ fontSize: 13 }}>Como configurar a intranet (passo-a-passo)</strong>
          <span style={{ fontSize: 11, color: '#6b7280' }}>{showSteps ? '▼' : '▶'}</span>
        </button>
        {showSteps && (
          <ol style={{ marginTop: 12, paddingLeft: 24, fontSize: 12, color: '#374151', lineHeight: 1.7 }}>
            {STEPS.map((s) => (
              <li key={s.n}>
                <strong>{s.title}</strong>
                <br />
                <span style={{ color: '#6b7280' }}>{s.help}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Habilitar */}
      <Section title="1. Habilitar intranet">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
          />
          <span style={{ fontSize: 13, color: '#374151' }}>
            Habilitar consulta à intranet MPRS no corpus interno
          </span>
        </label>
        <p style={{ fontSize: 11, color: '#6b7280', margin: 0, lineHeight: 1.5 }}>
          Quando desabilitado, o agente ignora a intranet e foca apenas em uploads e (se habilitado) pesquisa web.
        </p>
      </Section>

      {/* Conexão */}
      <Section title="2. URL base e método de autenticação">
        <Field label="URL base da intranet" hint="URL raiz (com https://). Ex: https://intranet.mp.rs.gov.br">
          <input
            type="url"
            value={config.baseUrl}
            onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
            placeholder="https://intranet.mp.rs.gov.br"
            style={inputStyle}
          />
        </Field>

        <Field label="Método de autenticação">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(Object.keys(AUTH_METHOD_INFO) as Array<keyof typeof AUTH_METHOD_INFO>).map((m) => {
              const info = AUTH_METHOD_INFO[m]
              return (
                <label key={m} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 8,
                  padding: 8,
                  background: config.authMethod === m ? '#f0f4ff' : 'transparent',
                  borderRadius: 6,
                  cursor: 'pointer',
                  border: config.authMethod === m ? '1px solid #1a4d8f' : '1px solid transparent',
                }}>
                  <input
                    type="radio"
                    name="authMethod"
                    checked={config.authMethod === m}
                    onChange={() => setConfig({ ...config, authMethod: m as any })}
                    style={{ marginTop: 3 }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <strong style={{ fontSize: 12, color: '#0f172a' }}>{info.label}</strong>
                      {info.recommended && (
                        <span style={{ fontSize: 9, background: '#065f46', color: '#ffffff', padding: '1px 5px', borderRadius: 3, fontWeight: 600 }}>
                          RECOMENDADO
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: 11, color: '#6b7280', margin: '4px 0 0' }}>{info.description}</p>
                    <p style={{ fontSize: 10, color: '#9ca3af', margin: '4px 0 0' }}>
                      Campos necessários: {info.needs.join(' · ')}
                    </p>
                  </div>
                </label>
              )
            })}
          </div>
        </Field>
      </Section>

      {/* Credenciais */}
      {(config.authMethod === 'form' || config.authMethod === 'basic') && (
        <Section title={`3. Credenciais (${AUTH_METHOD_INFO[config.authMethod].label})`}>
          <Field label="Usuário">
            <input
              type="text"
              value={config.username}
              onChange={(e) => setConfig({ ...config, username: e.target.value })}
              placeholder="seu.usuario ou usuário de serviço"
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
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <p style={{ fontSize: 11, color: '#92400e', margin: '6px 0 0' }}>
              ⚠️ <strong>Recomendação</strong>: crie um usuário de serviço dedicado ao Cofrito (não use seu usuário pessoal).
              Assim é possível revogar acesso sem afetar seu login.
            </p>
          </Field>
          {config.authMethod === 'form' && (
            <Field label="Caminho do login (relativo à baseUrl)" hint="Onde o form de login faz POST. Inspecione o HTML da página de login para descobrir.">
              <input
                type="text"
                value={config.loginPath || ''}
                onChange={(e) => setConfig({ ...config, loginPath: e.target.value })}
                placeholder="/auth/signin"
                style={inputStyle}
              />
            </Field>
          )}
        </Section>
      )}

      {config.authMethod === 'cookie' && (
        <Section title="3. Cookie de sessão">
          <Field label="Nome do cookie" hint="Como aparece em DevTools > Application > Cookies">
            <input
              type="text"
              value={config.cookieName || ''}
              onChange={(e) => setConfig({ ...config, cookieName: e.target.value })}
              placeholder="JSESSIONID"
              style={inputStyle}
            />
          </Field>
          <Field label="Valor do cookie" hint="Cole aqui o valor (será armazenado criptografado em produção)">
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
          <div style={{ padding: 10, background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 4, fontSize: 11, color: '#78350f', lineHeight: 1.5 }}>
            ⚠️ <strong>Atenção</strong>: cookies de sessão expiram (geralmente em 30min-8h).
            Será necessário atualizar este valor periodicamente. Para uso contínuo, prefira o método <strong>form</strong>.
          </div>
        </Section>
      )}

      {config.authMethod === 'sso-redirect' && (
        <Section title="3. SSO (configuração avançada)">
          <p style={{ fontSize: 12, color: '#92400e', background: '#fef3c7', padding: 10, borderRadius: 4, lineHeight: 1.5 }}>
            SSO corporativo geralmente requer cooperação do TI do MP. Entre em contato com a TI
            e peça as URLs de redirecionamento + credenciais de service account (se aplicável).
          </p>
          <Field label="Caminho do SSO" hint="URL de redirecionamento do IdP (ex: /sso/redirect)">
            <input
              type="text"
              value={config.loginPath || ''}
              onChange={(e) => setConfig({ ...config, loginPath: e.target.value })}
              placeholder="/sso/login"
              style={inputStyle}
            />
          </Field>
        </Section>
      )}

      {/* Paths */}
      <Section title="4. Paths de pesquisa e documentos">
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

      {/* Headers */}
      <Section title="5. Headers customizados (opcional)">
        <Field label="Headers extras" hint="Formato: Nome: Valor (um por linha). Útil para APIs internas com tokens">
          <textarea
            value={customHeadersText}
            onChange={(e) => setCustomHeadersText(e.target.value)}
            placeholder="X-Api-Key: abc123&#10;User-Agent: Cofrito/1.0"
            style={{ ...inputStyle, fontFamily: 'ui-monospace, monospace', minHeight: 70 }}
          />
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

      {testResult && (
        <div style={{
          padding: 12, borderRadius: 8,
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
              <div>Status HTTP: <strong>{testResult.status}</strong></div>
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
          ...primaryBtnStyle, opacity: saving ? 0.5 : 1,
        }}>
          {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
        <button onClick={test} disabled={testing || !config.enabled || !config.baseUrl} style={{
          ...secondaryBtnStyle, opacity: testing || !config.enabled || !config.baseUrl ? 0.5 : 1,
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
      display: 'flex', flexDirection: 'column', gap: 12,
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
