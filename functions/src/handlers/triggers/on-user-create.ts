/**
 * Trigger: ao criar usuário, inicializa perfil padrão.
 */

import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { getFirestore, Timestamp } from '../../services/firestore'
import { logger } from 'firebase-functions/v2'

export const onUserCreate = onDocumentCreated(
  { document: 'users/{uid}', region: 'southamerica-east1' },
  async (event) => {
    const uid = event.params.uid
    const userData = event.data?.data()
    if (!userData) return

    const db = getFirestore()
    await db.doc(`users/${uid}/profile/main`).set(
      {
        uid,
        areasAtuacao: [],
        areasInferidas: [],
        preferences: { tone: 'formal', detail: 'medium', language: 'pt-BR' },
        updatedAt: Timestamp.now(),
      },
      { merge: true },
    )

    await db.collection('audit').add({
      userId: uid,
      action: 'user.created',
      resource: `users/${uid}`,
      at: Timestamp.now(),
      meta: {},
    })

    logger.info('user.created', { uid })
  },
)
