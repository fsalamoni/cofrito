/**
 * App principal — landing + portal + admin + settings.
 *
 * Rotas (hash-based para hospedagem estática):
 *  - / ou vazio          → LandingPage (se !user) ou HomePage (se user)
 *  - #/settings          → SettingsPage (config LLM pessoal)
 *  - #/admin             → AdminPage (painel administrativo)
 *  - #/admin/users       → AdminPage (tab usuários)
 *  - #/admin/admins      → AdminPage (tab admins)
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useAuthStore } from './stores/authStore'
import { HomePage } from './pages/HomePage'
import { LandingPage } from './pages/LandingPage'
import { AdminPage } from './pages/AdminPage'
import { SettingsPage } from './pages/SettingsPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 min
    },
  },
})

type Route = 'home' | 'settings' | 'admin'

function getRouteFromHash(): Route {
  const hash = window.location.hash
  if (hash.startsWith('#/admin')) return 'admin'
  if (hash === '#/settings') return 'settings'
  return 'home'
}

export default function App() {
  const init = useAuthStore((s) => s.init)
  const user = useAuthStore((s) => s.user)
  const initialized = useAuthStore((s) => s.initialized)
  const [route, setRoute] = useState<Route>(getRouteFromHash())

  useEffect(() => {
    init()
  }, [init])

  useEffect(() => {
    const handler = () => setRoute(getRouteFromHash())
    window.addEventListener('hashchange', handler)
    return () => window.removeEventListener('hashchange', handler)
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      {!initialized ? (
        <LoadingScreen />
      ) : (
        <Router user={user} route={route} />
      )}
    </QueryClientProvider>
  )
}

function Router({ user, route }: { user: any; route: Route }) {
  if (route === 'admin') {
    // Admin é acessível mesmo sem user (vai mostrar "Faça login" ou "Acesso restrito")
    return <AdminPage />
  }
  if (route === 'settings') {
    if (!user) return <LandingPage />
    return <SettingsPage />
  }
  // Home
  if (!user) return <LandingPage />
  return <HomePage />
}

function LoadingScreen() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#ffffff',
        fontFamily: 'Inter, system-ui, sans-serif',
        color: '#6b7280',
        fontSize: 14,
      }}
    >
      Carregando…
    </div>
  )
}
