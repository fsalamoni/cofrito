/**
 * Handlers da taxonomia jurídica (admin master).
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions'
import { assertAdminMaster } from '../middleware/auth'
import { saveConfigDoc } from '../services/config-store'
import {
  loadLegalTaxonomy,
  normalizeLegalTaxonomy,
  LEGAL_TAXONOMY_PATH,
} from '../services/legal-taxonomy'

export const adminGetLegalTaxonomy = onCall(
  { cors: true, enforceAppCheck: false },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Faça login.')
    await assertAdminMaster(request.auth.uid)
    return await loadLegalTaxonomy()
  },
)

export const adminSaveLegalTaxonomy = onCall(
  { cors: true, enforceAppCheck: false },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Faça login.')
    await assertAdminMaster(request.auth.uid)
    const taxonomy = normalizeLegalTaxonomy(request.data)
    await saveConfigDoc(taxonomy, {
      uid: request.auth.uid,
      path: LEGAL_TAXONOMY_PATH,
      tag: 'legal-taxonomy',
    })
    logger.info('legal-taxonomy.saved', {
      uid: request.auth.uid,
      counts: {
        tipos: taxonomy.tiposDocumento.length,
        areas: taxonomy.areasDireito.length,
        assuntos: taxonomy.assuntos.length,
      },
    })
    return taxonomy
  },
)
