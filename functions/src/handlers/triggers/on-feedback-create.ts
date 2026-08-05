/**
 * Trigger: log de auditoria de feedback.
 */

import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'

export const onFeedbackCreate = onDocumentCreated(
  { document: 'feedback/{feedbackId}', region: 'southamerica-east1' },
  async (event) => {
    const data = event.data?.data()
    if (!data) return
    const db = getFirestore()
    await db.collection('audit').add({
      userId: data.userId,
      action: 'feedback.created',
      resource: `feedback/${event.params.feedbackId}`,
      at: Timestamp.now(),
      meta: { helpful: data.helpful, hasComment: !!data.comment },
    })
  },
)
