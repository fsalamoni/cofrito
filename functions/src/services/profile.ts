/**
 * Profile — leitura e atualização de perfil.
 */

import { getFirestore, Timestamp } from './firestore'

export interface UserProfile {
  uid: string
  displayName: string
  email: string
  institutionalEmail: boolean
  role: 'promotor' | 'servidor' | 'estagiario' | 'coordenador' | 'admin' | 'externo'
  areasInferidas: string[]
  preferences: {
    tone: 'formal' | 'conversational'
    detail: 'low' | 'medium' | 'high'
    language: 'pt-BR'
  }
  status: 'active' | 'suspended' | 'deleted'
  createdAt: string
  lastSeen: string
  consent: { acceptedAt: string; version: string; ipHash: string; userAgent: string }
}

export async function getUserProfile(userId: string): Promise<UserProfile> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any = {}
  try {
    const db = getFirestore()
    const userDoc = await db.doc(`users/${userId}`).get()
    data = (userDoc.data() as Record<string, unknown>) || {}
  } catch (err) {
    // Se admin SDK falhar, retorna profile vazio (default) em vez de quebrar
    console.warn('getUserProfile: failed to read user doc, returning default', { userId, err: (err as Error)?.message })
  }
  return {
    uid: userId,
    displayName: data.displayName || 'Usuário',
    email: data.email || '',
    institutionalEmail: data.institutionalEmail ?? (data.email?.endsWith('@mp.rs.gov.br') ?? false),
    role: data.role || 'externo',
    areasInferidas: data.areasInferidas || [],
    preferences: data.preferences || {
      tone: 'formal',
      detail: 'medium',
      language: 'pt-BR',
    },
    status: data.status || 'active',
    createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
    lastSeen: data.lastSeen?.toDate?.()?.toISOString() || new Date().toISOString(),
    consent: data.consent || { acceptedAt: '', version: '1.0', ipHash: '', userAgent: '' },
  }
}

export async function updateInferredAreas(userId: string, areas: string[]): Promise<void> {
  if (!areas?.length) return
  const db = getFirestore()
  const profileRef = db.doc(`users/${userId}/profile/main`)
  const profileDoc = await profileRef.get()
  const current = (profileDoc.data()?.areasInferidas as string[]) || []
  const updated = Array.from(new Set([...current, ...areas])).slice(0, 5)
  await profileRef.set(
    {
      areasInferidas: updated,
      updatedAt: Timestamp.now(),
    },
    { merge: true },
  )
}
