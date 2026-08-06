/**
 * Trigger: notifica CAO via e-mail ao receber consulta.
 *
 * Integração de e-mail desativada neste deploy (decisão 2026-08).
 * O trigger só registra log. Reativar: descomentar defineSecret e bloco de envio.
 */

import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { logger } from 'firebase-functions/v2'

export const onConsultaCreate = onDocumentCreated(
  {
    document: 'consultas-formais/{consultaId}',
    region: 'southamerica-east1',
  },
  async (event) => {
    const data = event.data?.data()
    if (!data) return

    logger.info('onConsultaCreate.received', {
      protocol: data.protocol,
      userEmail: data.userEmail,
      // E-mail ao CAO desativado neste deploy. Reativar ver topo do arquivo.
    })
  },
)
