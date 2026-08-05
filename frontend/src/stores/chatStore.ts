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
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversationId: null,
  messages: [],
  conversations: [],
  isOpen: false,
  isThinking: false,
  isInitialized: false,

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
}))
