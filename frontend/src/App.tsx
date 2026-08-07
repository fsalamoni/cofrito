/**
 * App principal — landing + portal.
 *
 * Fluxo:
 *  - usuário não logado → LandingPage (com botões de login)
 *  - usuário logado → HomePage (com widget do chat)
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useAuthStore } from './stores/authStore'
import { HomePage } from './pages/HomePage'
import { LandingPage } from './pages/LandingPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 min
    },
  },
})

export default function App() {
  const init = useAuthStore((s) => s.init)
  const user = useAuthStore((s) => s.user)
  const initialized = useAuthStore((s) => s.initialized)

  useEffect(() => {
    init()
  }, [init])

  return (
    <QueryClientProvider client={queryClient}>
      {!initialized ? (
        <LoadingScreen />
      ) : user ? (
        <HomePage />
      ) : (
        <LandingPage />
      )}
    </QueryClientProvider>
  )
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
