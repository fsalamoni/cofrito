/**
 * Trigger: notifica CAO via e-mail ao receber consulta.
 */

import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { defineSecret } from 'firebase-functions/params'
import { logger } from 'firebase-functions/v2'
import { sendEmail } from '../../services/email'

const RESEND_API_KEY = defineSecret('RESEND_API_KEY')

export const onConsultaCreate = onDocumentCreated(
  {
    document: 'consultas-formais/{consultaId}',
    region: 'southamerica-east1',
    secrets: [RESEND_API_KEY],
  },
  async (event) => {
    const data = event.data?.data()
    if (!data) return

    const apiKey = RESEND_API_KEY.value()
    if (!apiKey) {
      logger.warn('onConsultaCreate.no_api_key')
      return
    }

    try {
      await sendEmail({
        apiKey,
        to: process.env.CAO_EMAIL || 'caocivel@mprs.mp.br',
        subject: `[${data.protocol}] Nova consulta formal`,
        body: `Protocolo: ${data.protocol}\nUsuário: ${data.userEmail}\nAssunto: ${data.assunto}\n\nQuestão objetiva:\n${data.questaoObjetiva}`,
      })
    } catch (err) {
      logger.error('onConsultaCreate.email.error', { err })
    }
  },
)
