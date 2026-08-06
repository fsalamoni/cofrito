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
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { auth, firestore } from '@/lib/firebase'

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

/**
 * Cria (ou atualiza) o documento `users/{uid}` com consent aceito.
 * Necessário porque as Firestore rules exigem esse doc para o usuário
 * acessar o corpus e gravar histórico de conversas.
 */
async function ensureUserDoc(user: User): Promise<void> {
  const ref = doc(firestore, `users/${user.uid}`)
  const snap = await getDoc(ref)
  const email = user.email ?? ''
  const displayName =
    user.displayName?.trim() ||
    (email.includes('@') ? email.split('@')[0] : 'Usuário')

  if (!snap.exists()) {
    await setDoc(ref, {
      uid: user.uid,
      email,
      displayName,
      institutionalEmail: email.endsWith('@mp.rs.gov.br') || email.endsWith('@mprs.mp.br'),
      role: 'externo',
      status: 'active',
      createdAt: serverTimestamp(),
      lastSeen: serverTimestamp(),
      consent: {
        acceptedAt: serverTimestamp(),
        version: '1.0',
        ipHash: '',
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      },
    })
  } else {
    // Atualiza lastSeen a cada login
    await setDoc(
      ref,
      { lastSeen: serverTimestamp() },
      { merge: true },
    )
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: false,
  initialized: false,
  error: null,

  init: () => {
    const unsubscribe = onAuthStateChanged(
      auth,
      async (user) => {
        if (user) {
          try {
            await ensureUserDoc(user)
          } catch (err) {
            // Não bloqueia o login se Firestore falhar (ex.: rules).
            console.warn('ensureUserDoc falhou:', err)
          }
        }
        set({ user, initialized: true, loading: false })
      },
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
      let email = window.localStorage.getItem('cofrito:email-for-sign-in')
      if (!email) {
        email = window.prompt('Confirme seu e-mail:') || null
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
