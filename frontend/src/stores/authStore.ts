/**
 * Store de autenticação.
 */
import { create } from 'zustand'
import {
  onAuthStateChanged,
  signInWithEmailLink,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth'
import { auth } from '@/lib/firebase'

interface AuthState {
  user: User | null
  loading: boolean
  initialized: boolean
  error: string | null

  init: () => () => void
  signIn: (email: string) => Promise<void>
  completeSignIn: () => Promise<void>
  signOut: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: false,
  initialized: false,
  error: null,

  init: () => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => set({ user, initialized: true, loading: false }),
      (error) => set({ error: error.message, initialized: true, loading: false }),
    )
    return unsubscribe
  },

  signIn: async (email: string) => {
    set({ loading: true, error: null })
    try {
      await sendSignInLinkToEmail(auth, email, {
        url: `${window.location.origin}/auth/complete`,
        handleCodeInApp: true,
      })
      window.localStorage.setItem('cofrito:email-for-sign-in', email)
    } catch (err: any) {
      set({ error: err.message, loading: false })
      throw err
    }
  },

  completeSignIn: async () => {
    if (isSignInWithEmailLink(auth, window.location.href)) {
      let email: string | null = window.localStorage.getItem('cofrito:email-for-sign-in')
      if (!email) {
        email = window.prompt('Confirme seu e-mail:')
        if (!email) throw new Error('E-mail é obrigatório')
      }
      set({ loading: true, error: null })
      try {
        await signInWithEmailLink(auth, email, window.location.href)
        window.localStorage.removeItem('cofrito:email-for-sign-in')
      } catch (err: any) {
        set({ error: err.message, loading: false })
        throw err
      }
    }
  },

  signOut: async () => {
    await fbSignOut(auth)
    set({ user: null })
  },
}))
