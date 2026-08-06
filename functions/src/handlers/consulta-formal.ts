/**
 * Handler de consulta formal.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { logger } from 'firebase-functions/v2'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { z } from 'zod'

import { sendEmail } from '../services/email'
import { generateConsultaProtocol } from '../utils/protocol'
import { validatePGEA } from '../utils/validators'

const RESEND_API_KEY = defineSecret('RESEND_API_KEY')

const ConsultaRequestSchema = z.object({
  assunto: z.string().min(5).max(200),
  questaoObjetiva: z.string().min(20).max(5000),
  contextoFatico: z.string().max(10000).optional(),
  pgea: z
    .string()
    .optional()
    .refine((v) => !v || validatePGEA(v).valid, { message: 'PGEA inválido' }),
  documentosIds: z.array(z.string()).max(20).optional().default([]),
})

export const openConsultaFormal = onCall(
  { secrets: [RESEND_API_KEY], cors: true },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Faça login para abrir consulta formal.')
    }

    const parsed = ConsultaRequestSchema.safeParse(request.data)
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', 'Dados inválidos.', { issues: parsed.error.issues })
    }

    const db = getFirestore()
    const protocol = generateConsultaProtocol()
    const now = Timestamp.now()

    const consultaData = {
      protocol,
      userId: request.auth.uid,
      userEmail: request.auth.token.email ?? '',
      ...parsed.data,
      status: 'recebida' as const,
      createdAt: now,
      updatedAt: now,
      historico: [
        {
          from: null,
          to: 'recebida',
          by: 'sistema',
          note: 'Consulta recebida via agente conversacional.',
          at: now,
        },
      ],
    }

    await db.collection('consultas-formais').doc(protocol).set(consultaData)

    // Notifica o CAO
    try {
      const apiKey = RESEND_API_KEY.value()
      if (apiKey) {
        await sendEmail({
          apiKey,
          to: process.env.CAO_EMAIL || 'caocivel@mprs.mp.br',
          subject: `[${protocol}] Nova consulta formal via agente`,
          body: formatConsultaEmail(consultaData),
        })
      }
    } catch (err) {
      logger.error('consultaFormal.email.error', { protocol, err })
      // Não falha a operação
    }

    logger.info('consultaFormal.created', { protocol, userId: request.auth.uid })

    return {
      protocol,
      status: 'recebida' as const,
      createdAt: now.toDate().toISOString(),
      estimatedResponseDays: '5 a 15 dias úteis',
    }
  },
)

function formatConsultaEmail(c: Record<string, unknown>): string {
  return `
Nova consulta formal recebida via agente conversacional.

Protocolo: ${c.protocol}
Usuário: ${c.userEmail}
${c.pgea ? `PGEA: ${c.pgea}\n` : ''}
Assunto: ${c.assunto}

Questão objetiva:
${c.questaoObjetiva}

${c.contextoFatico ? `Contexto fático:\n${c.contextoFatico}\n` : ''}
---
Acesse o painel admin para visualizar e responder.
`.trim()
}
