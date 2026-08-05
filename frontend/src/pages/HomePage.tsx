/**
 * HomePage — landing do portal (apenas dev/admin).
 */
import { AgentWidget } from '@/components/AgentWidget'
import { useProfile } from '@/hooks/useProfile'

export function HomePage() {
  const { data: profile, isLoading } = useProfile()

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="border-b py-4 px-6">
        <h1 className="text-2xl font-bold">Cofrito — CAOCIPP</h1>
        <p className="text-sm text-muted-foreground">
          Assistente conversacional do CAOCIPP / MP-RS
        </p>
      </header>

      <main className="flex-1 p-6">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xl font-semibold mb-4">Página de demonstração</h2>

          {isLoading ? (
            <p>Carregando perfil...</p>
          ) : profile ? (
            <div className="rounded-lg border bg-card p-4 mb-4">
              <p>
                Logado como: <strong>{profile.displayName}</strong> ({profile.email})
              </p>
              <p className="text-sm text-muted-foreground">
                Áreas inferidas: {profile.areasInferidas.join(', ') || '(nenhuma)'}
              </p>
            </div>
          ) : (
            <div className="rounded-lg border bg-card p-4 mb-4">
              <p>Não autenticado. Use o widget para fazer login.</p>
            </div>
          )}

          <p className="text-sm text-muted-foreground">
            O Cofrito aparecerá no canto inferior direito. Clique para abrir.
          </p>
        </div>
      </main>

      <AgentWidget defaultOpen={false} />
    </div>
  )
}
