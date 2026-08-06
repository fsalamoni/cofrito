/**
 * HomePage — landing do portal (apenas dev/admin).
 */
import { AgentWidget } from '@/components/AgentWidget'
import { useProfile } from '@/hooks/useProfile'
import { useAuthStore } from '@/stores/authStore'

export function HomePage() {
  const { data: profile, isLoading, isError } = useProfile()
  const user = useAuthStore((s) => s.user)

  if (isError) {
    // não bloqueia — só loga. widget continua funcionando.
    console.warn('Falha ao carregar perfil (esperado se Cloud Function offline)')
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: '#ffffff',
      color: '#1a1a1a',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      <header style={{
        borderBottom: '1px solid #e5e7eb',
        padding: '16px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
      }}>
        <img
          src="/cofrito.png"
          alt="Cofrito"
          style={{ width: 56, height: 56, objectFit: 'contain' }}
        />
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#1a4d8f' }}>
            Cofrito — CAOCIPP
          </h1>
          <p style={{ margin: '2px 0 0', fontSize: 13, color: '#6b7280' }}>
            Assistente conversacional do CAOCIPP / MP-RS
          </p>
        </div>
      </header>

      <main style={{ flex: 1, padding: 24 }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>
            Página de demonstração
          </h2>

          {user && isLoading ? (
            <div style={cardStyle}>
              <p>Carregando perfil...</p>
            </div>
          ) : user && profile ? (
            <div style={cardStyle}>
              <p>
                Logado como: <strong>{profile.displayName}</strong> ({profile.email})
              </p>
              <p style={{ fontSize: 13, color: '#6b7280' }}>
                Áreas inferidas: {profile.areasInferidas?.join(', ') || '(nenhuma)'}
              </p>
            </div>
          ) : user ? (
            <div style={cardStyle}>
              <p>Autenticado. O chat está pronto no canto inferior direito.</p>
              {isError && (
                <p style={{ fontSize: 12, color: '#9ca3af' }}>
                  (Não foi possível carregar o perfil — Cloud Function offline?)
                </p>
              )}
            </div>
          ) : (
            <div style={cardStyle}>
              <p>
                <strong>Você não está autenticado.</strong> Clique no botão do Cofrito
                no canto inferior direito para entrar com seu e-mail (Magic Link).
              </p>
            </div>
          )}

          <div style={{ ...cardStyle, marginTop: 16, background: '#f9fafb' }}>
            <p style={{ margin: 0, fontSize: 13, color: '#4b5563' }}>
              <strong>Status do deploy:</strong> widget visível ✓ ·
              {' '}LLM (Gemini) e e-mail (Resend) desativados · restante funcional.
            </p>
          </div>
        </div>
      </main>

      <AgentWidget defaultOpen={false} />
    </div>
  )
}

const cardStyle: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  padding: 16,
  background: '#ffffff',
  marginBottom: 16,
}
