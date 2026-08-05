/**
 * Store de UI (tema, toasts, modal).
 */
import { create } from 'zustand'

type Theme = 'light' | 'dark' | 'auto'

interface UIState {
  theme: Theme
  setTheme: (t: Theme) => void

  // Toasts
  toasts: Array<{ id: string; message: string; type: 'success' | 'error' | 'warning' | 'info' }>
  pushToast: (message: string, type?: 'success' | 'error' | 'warning' | 'info') => void
  dismissToast: (id: string) => void
}

const THEME_KEY = 'cofrito:theme'

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (theme === 'auto') {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    root.dataset.theme = isDark ? 'dark' : 'light'
  } else {
    root.dataset.theme = theme
  }
}

export const useUIStore = create<UIState>((set, get) => ({
  theme: (typeof localStorage !== 'undefined' && (localStorage.getItem(THEME_KEY) as Theme)) || 'light',

  setTheme: (t) => {
    localStorage.setItem(THEME_KEY, t)
    applyTheme(t)
    set({ theme: t })
  },

  toasts: [],
  pushToast: (message, type = 'info') => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }))
    setTimeout(() => get().dismissToast(id), 5000)
  },
  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

// Aplica tema no boot
if (typeof window !== 'undefined') {
  applyTheme(useUIStore.getState().theme)
}
