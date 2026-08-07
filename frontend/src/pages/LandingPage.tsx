/**
 * LandingPage — página inicial de apresentação do Cofrito.
 *
 * Aparece quando o usuário ainda não está autenticado.
 * Contém:
 *  - Hero (título + descrição do que é o Cofrito)
 *  - Funcionalidades principais
 *  - Botões de login (Google + email/senha)
 */
import { useState } from 'react'
import { useAuthStore } from '@/stores/authStore'
import cofritoImg from '@/assets/cofrito/cofrito-200.png'

export function LandingPage() {
  const [mode, setMode] = useState<'choose' | 'email-signin' | 'email-signup'>('choose')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const { signInWithGoogle, signInWithEmail, signUpWithEmail, loading, error } = useAuthStore()

  async function handleGoogle() {
    try {
      await signInWithGoogle()
    } catch (err) {
      console.error('Google sign-in falhou:', err)
    }
  }

  async function handleEmailSignIn(e: React.FormEvent) {
    e.preventDefault()
    try {
      await signInWithEmail(email, password)
    } catch (err) {
      console.error('Email sign-in falhou:', err)
    }
  }

  async function handleEmailSignUp(e: React.FormEvent) {
    e.preventDefault()
    try {
      await signUpWithEmail(email, password, displayName)
    } catch (err) {
      console.error('Email sign-up falhou:', err)
    }
  }

  return (
    <div style={pageStyle}>
      <header style={headerStyle}>
        <div style={brandStyle}>
          <img src={cofritoImg} alt="Cofrito" style={{ width: 48, height: 48 }} />
          <div>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1a4d8f' }}>Cofrito</h1>
            <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>CAOCIPP / MP-RS</p>
          </div>
        </div>
      </header>

      <main style={mainStyle}>
        <div style={heroStyle}>
          <img
            src={cofritoImg}
            alt="Cofrito"
            style={{ width: 120, height: 120, marginBottom: 24 }}
          />
          <h2 style={titleStyle}>Assistente conversacional do CAOCIPP</h2>
          <p style={subtitleStyle}>
            O Cofrito ajuda Promotores e servidores do Ministério Público do Rio Grande do Sul
            a localizar rapidamente material institucional do Centro de Apoio Operacional Cível
            e do Patrimônio Público: atos normativos, teses, modelos de peças, FAQ e
            procedimentos internos.
          </p>
        </div>

        <section style={featuresStyle}>
          <Feature
            title="Respostas fundamentadas"
            description="Todas as respostas vêm com citação da fonte institucional consultada."
          />
          <Feature
            title="Consulta formal integrada"
            description="Se não houver material no acervo, você pode abrir uma consulta formal ao CAOCIPP diretamente pelo chat."
          />
          <Feature
            title="Privacidade garantida"
            description="Seus dados ficam isolados na sua pasta. A LGPD é respeitada em todo o fluxo."
          />
          <Feature
            title="Histórico personalizado"
            description="O Cofrito lembra de suas conversas anteriores e adapta as respostas às suas áreas de atuação."
          />
        </section>

        <section style={loginSectionStyle}>
          <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600, textAlign: 'center' }}>
            Acesse sua conta
          </h3>
          <p style={{ margin: '0 0 20px', fontSize: 13, color: '#6b7280', textAlign: 'center' }}>
            Use sua conta Google ou crie um acesso com e-mail institucional
          </p>

          {mode === 'choose' && (
            <div style={loginButtonsStyle}>
              <button onClick={handleGoogle} disabled={loading} style={googleButtonStyle}>
                <GoogleIcon /> Entrar com Google
              </button>
              <button
                onClick={() => setMode('email-signin')}
                disabled={loading}
                style={emailButtonStyle}
              >
                Entrar com e-mail e senha
              </button>
              <button
                onClick={() => setMode('email-signup')}
                disabled={loading}
                style={linkButtonStyle}
              >
                Criar conta com e-mail
              </button>
            </div>
          )}

          {mode === 'email-signin' && (
            <form onSubmit={handleEmailSignIn} style={formStyle}>
              <input
                type="email"
                placeholder="seu@email.mp.rs.gov.br"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={inputStyle}
              />
              <input
                type="password"
                placeholder="Senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                style={inputStyle}
              />
              <button type="submit" disabled={loading} style={primaryButtonStyle}>
                {loading ? 'Entrando…' : 'Entrar'}
              </button>
              <button type="button" onClick={() => setMode('choose')} style={linkButtonStyle}>
                ← Voltar
              </button>
            </form>
          )}

          {mode === 'email-signup' && (
            <form onSubmit={handleEmailSignUp} style={formStyle}>
              <input
                type="text"
                placeholder="Seu nome"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                style={inputStyle}
              />
              <input
                type="email"
                placeholder="seu@email.mp.rs.gov.br"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={inputStyle}
              />
              <input
                type="password"
                placeholder="Senha (mínimo 6 caracteres)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                style={inputStyle}
              />
              <button type="submit" disabled={loading} style={primaryButtonStyle}>
                {loading ? 'Criando conta…' : 'Criar conta'}
              </button>
              <button type="button" onClick={() => setMode('choose')} style={linkButtonStyle}>
                ← Voltar
              </button>
            </form>
          )}

          {error && <p style={errorStyle}>{error}</p>}
        </section>
      </main>

      <footer style={footerStyle}>
        <p style={{ margin: 0, fontSize: 12, color: '#9ca3af', textAlign: 'center' }}>
          Cofrito · Centro de Apoio Operacional Cível e do Patrimônio Público · MP-RS
        </p>
      </footer>
    </div>
  )
}

function Feature({ title, description }: { title: string; description: string }) {
  return (
    <div style={featureCardStyle}>
      <h4 style={featureTitleStyle}>{title}</h4>
      <p style={featureDescStyle}>{description}</p>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.6 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.6 16 19 13 24 13c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.4 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.6 2.4-7.3 2.4-5.3 0-9.7-3.4-11.3-8.1l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.7 2.1-2 3.9-3.7 5.2l6.2 5.2c-.4.4 6.6-4.8 6.6-14.4 0-1.3-.1-2.3-.4-3.5z" />
    </svg>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  background: 'linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)',
  fontFamily: 'Inter, system-ui, sans-serif',
  color: '#1a1a1a',
}

const headerStyle: React.CSSProperties = {
  padding: '16px 24px',
  borderBottom: '1px solid #e5e7eb',
  background: '#ffffff',
}

const brandStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  maxWidth: 1200,
  margin: '0 auto',
}

const mainStyle: React.CSSProperties = {
  flex: 1,
  maxWidth: 1200,
  margin: '0 auto',
  padding: '48px 24px',
  width: '100%',
  boxSizing: 'border-box',
}

const heroStyle: React.CSSProperties = {
  textAlign: 'center',
  marginBottom: 48,
}

const titleStyle: React.CSSProperties = {
  fontSize: 32,
  fontWeight: 700,
  color: '#1a4d8f',
  margin: '0 0 12px',
  lineHeight: 1.2,
}

const subtitleStyle: React.CSSProperties = {
  fontSize: 16,
  color: '#4b5563',
  maxWidth: 640,
  margin: '0 auto',
  lineHeight: 1.6,
}

const featuresStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 16,
  marginBottom: 48,
}

const featureCardStyle: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  padding: 20,
}

const featureTitleStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  margin: '0 0 6px',
  color: '#1a4d8f',
}

const featureDescStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#4b5563',
  margin: 0,
  lineHeight: 1.5,
}

const loginSectionStyle: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  padding: 32,
  maxWidth: 420,
  margin: '0 auto',
}

const loginButtonsStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
}

const googleButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 12,
  padding: '12px 16px',
  background: '#ffffff',
  border: '1px solid #d1d5db',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 500,
  color: '#1a1a1a',
}

const emailButtonStyle: React.CSSProperties = {
  padding: '12px 16px',
  background: '#1a4d8f',
  color: '#ffffff',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 500,
}

const linkButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#1a4d8f',
  cursor: 'pointer',
  fontSize: 13,
  padding: 8,
  textDecoration: 'underline',
}

const formStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
}

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  fontSize: 14,
  fontFamily: 'inherit',
}

const primaryButtonStyle: React.CSSProperties = {
  padding: '12px 16px',
  background: '#1a4d8f',
  color: '#ffffff',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 500,
  marginTop: 4,
}

const errorStyle: React.CSSProperties = {
  marginTop: 12,
  padding: 10,
  background: '#fee2e2',
  color: '#991b1b',
  borderRadius: 6,
  fontSize: 13,
}

const footerStyle: React.CSSProperties = {
  padding: 16,
  borderTop: '1px solid #e5e7eb',
  background: '#ffffff',
}
