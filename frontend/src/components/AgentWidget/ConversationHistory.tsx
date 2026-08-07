/**
 * ConversationHistory — lista de conversas do usuário.
 *
 * Funcionalidades:
 *  - Lista conversas ordenadas por última atividade
 *  - Click → carrega a conversa no chat
 *  - Botão "Nova conversa" no topo
 *  - Delete individual
 *  - Estado vazio com mensagem amigável
 */
import { useEffect, useState } from 'react'
import { Plus, Trash2, MessageCircle, Loader2 } from 'lucide-react'
import { collection, query, orderBy, getDocs, doc, deleteDoc } from 'firebase/firestore'
import { firestore } from '@/lib/firebase'
import { useAuth } from '@/hooks/useAuth'
import { useChatStore } from '@/stores/chatStore'
import type { Conversation } from '@/types'

interface Props {
  onClose?: () => void
}

export function ConversationHistory({ onClose: _onClose }: Props) {
  const { user } = useAuth()
  const setConversationId = useChatStore((s) => s.setConversationId)
  const startNewConversation = useChatStore((s) => s.startNewConversation)
  const currentId = useChatStore((s) => s.conversationId)
  const setMessages = useChatStore((s) => s.loadConversation)

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    loadConversations()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  async function loadConversations() {
    if (!user) return
    setLoading(true)
    setError(null)
    try {
      const q = query(
        collection(firestore, `users/${user.uid}/conversations`),
        orderBy('lastActivityAt', 'desc'),
      )
      const snap = await getDocs(q)
      const items: Conversation[] = []
      snap.forEach((d) => {
        const data = d.data() as any
        items.push({
          id: d.id,
          uid: data.uid,
          title: data.title ?? 'Conversa sem título',
          status: data.status ?? 'active',
          createdAt: data.createdAt?.toDate?.()?.toISOString() ?? new Date().toISOString(),
          lastActivityAt: data.lastActivityAt?.toDate?.()?.toISOString() ?? new Date().toISOString(),
          messageCount: data.messageCount ?? 0,
        })
      })
      setConversations(items)
    } catch (err: any) {
      console.error('Erro ao carregar conversas:', err)
      setError(err.message || 'Erro ao carregar histórico')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id: string) {
    if (!user) return
    if (!confirm('Excluir esta conversa?')) return
    try {
      await deleteDoc(doc(firestore, `users/${user.uid}/conversations/${id}`))
      setConversations((cs) => cs.filter((c) => c.id !== id))
      if (currentId === id) {
        startNewConversation()
      }
    } catch (err: any) {
      console.error('Erro ao deletar:', err)
      setError(err.message || 'Erro ao deletar conversa')
    }
  }

  function handleNew() {
    startNewConversation()
    _onClose?.()
  }

  function handleSelect(id: string) {
    // Simples: seleciona o id (mensagens serão recarregadas pelo ChatPanel via history)
    setConversationId(id)
    // Disparar reload do histórico de mensagens
    reloadMessages(id)
    _onClose?.()
  }

  async function reloadMessages(conversationId: string) {
    if (!user) return
    try {
      const messagesSnap = await getDocs(
        query(
          collection(firestore, `users/${user.uid}/conversations/${conversationId}/messages`),
          orderBy('createdAt', 'asc'),
        ),
      )
      const msgs: any[] = []
      messagesSnap.forEach((d) => {
        const data = d.data()
        msgs.push({
          id: d.id,
          conversationId,
          role: data.role,
          content: data.content,
          sources: data.sources,
          createdAt: data.createdAt?.toDate?.()?.toISOString() ?? new Date().toISOString(),
        })
      })
      setMessages(conversationId, msgs)
    } catch (err) {
      console.error('Erro ao carregar mensagens:', err)
    }
  }

  return (
    <div>
      <div style={{ padding: '8px 12px' }}>
        <button onClick={handleNew} style={newBtnStyle}>
          <Plus size={14} />
          Nova conversa
        </button>
      </div>

      {loading && (
        <div style={emptyStyle}>
          <Loader2 size={20} className="cofrito-spin" />
          <span style={{ fontSize: 12, marginTop: 6 }}>Carregando...</span>
        </div>
      )}

      {error && (
        <div style={errorStyle}>
          <span style={{ fontSize: 12 }}>{error}</span>
          <button onClick={loadConversations} style={retryBtnStyle}>
            Tentar novamente
          </button>
        </div>
      )}

      {!loading && !error && conversations.length === 0 && (
        <div style={emptyStyle}>
          <MessageCircle size={20} color="#9ca3af" />
          <span style={{ fontSize: 12, marginTop: 6, textAlign: 'center' }}>
            Nenhuma conversa ainda.
            <br />Comece a primeira!
          </span>
        </div>
      )}

      {!loading && !error && conversations.length > 0 && (
        <div>
          {conversations.map((c) => {
            const isActive = currentId === c.id
            const lastActivity = new Date(c.lastActivityAt)
            return (
              <div
                key={c.id}
                onClick={() => handleSelect(c.id)}
                style={{
                  ...itemStyle,
                  ...(isActive ? itemActiveStyle : {}),
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={itemTitleStyle}>{c.title}</div>
                  <div style={itemMetaStyle}>
                    {c.messageCount ?? 0} mensagens · {formatRelative(lastActivity)}
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(c.id) }}
                  style={deleteBtnStyle}
                  title="Excluir"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function formatRelative(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return 'agora'
  if (diffMin < 60) return `${diffMin}m atrás`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH}h atrás`
  const diffD = Math.floor(diffH / 24)
  if (diffD < 7) return `${diffD}d atrás`
  return date.toLocaleDateString('pt-BR')
}

const newBtnStyle: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  padding: '8px 12px',
  background: '#1a4d8f',
  color: '#ffffff',
  border: 'none',
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const emptyStyle: React.CSSProperties = {
  padding: 24,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  color: '#9ca3af',
}

const errorStyle: React.CSSProperties = {
  padding: 12,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  background: '#fee2e2',
  color: '#991b1b',
  margin: 12,
  borderRadius: 8,
}

const retryBtnStyle: React.CSSProperties = {
  background: '#dc2626',
  color: '#ffffff',
  border: 'none',
  borderRadius: 6,
  padding: '4px 10px',
  fontSize: 11,
  cursor: 'pointer',
}

const itemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 12px',
  borderBottom: '1px solid #f3f4f6',
  cursor: 'pointer',
  transition: 'background 0.1s',
}

const itemActiveStyle: React.CSSProperties = {
  background: '#eef2ff',
  borderLeft: '3px solid #1a4d8f',
}

const itemTitleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  color: '#0f172a',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const itemMetaStyle: React.CSSProperties = {
  fontSize: 10,
  color: '#9ca3af',
  marginTop: 2,
}

const deleteBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#9ca3af',
  cursor: 'pointer',
  padding: 4,
  borderRadius: 4,
  display: 'flex',
  flexShrink: 0,
}
