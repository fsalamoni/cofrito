/**
 * Hook de autenticação.
 */
import { useAuthStore } from '@/stores/authStore'

export function useAuth() {
  const { user, loading, error, init, signIn, completeSignIn, signOut } = useAuthStore()
  return { user, loading, error, init, signIn, completeSignIn, signOut }
}
