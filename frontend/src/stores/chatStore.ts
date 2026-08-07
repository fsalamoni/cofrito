/**
 * Store do chat.
 */
import { create } from 'zustand'
import type { ChatMessage, Conversation } from '@/types'

interface ChatState {
  conversationId: string | null
  messages: ChatMessage[]
  conversations: Conversation[]
  isOpen: boolean
  isThinking: boolean
  isInitialized: boolean
  /** Permite que o LLM complemente a resposta com informações externas ao corpus. */
  allowExternal: boolean

  init: (open?: boolean) => void
  open: () => void
  close: () => void
  toggle: () => void
  startNewConversation: () => void
  setConversations: (c: Conversation[]) => void
  addMessage: (m: ChatMessage) => void
  updateMessage: (id: string, updates: Partial<ChatMessage>) => void
  setThinking: (b: boolean) => void
  setConversationId: (id: string | null) => void
  loadConversation: (id: string, messages: ChatMessage[]) => void
  setAllowExternal: (b: boolean) => void
}

const STORAGE_KEY = 'cofrito:allowExternal'

function loadInitialAllowExternal(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

export const useChatStore = create<ChatState>((set) => ({
  conversationId: null,
  messages: [],
  conversations: [],
  isOpen: false,
  isThinking: false,
  isInitialized: false,
  allowExternal: loadInitialAllowExternal(),

  init: (open = true) => {
    set({ isInitialized: true, isOpen: open })
  },

  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),

  startNewConversation: () =>
    set({ conversationId: null, messages: [] }),

  setConversations: (conversations) => set({ conversations }),

  addMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),

  updateMessage: (id, updates) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, ...updates } : m)),
    })),

  setThinking: (b) => set({ isThinking: b }),

  setConversationId: (id) => set({ conversationId: id }),

  loadConversation: (id, messages) => set({ conversationId: id, messages }),

  setAllowExternal: (b) => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY, String(b))
      }
    } catch {
      // ignore
    }
    set({ allowExternal: b })
  },
}))
