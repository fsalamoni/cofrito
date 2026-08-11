/**
 * Agente CAOCIPP — Cloud Functions entrypoint.
 *
 * Exposed functions:
 *  - chat                    — recebe pergunta, faz RAG, retorna resposta
 *  - openConsultaFormal      — abre consulta formal
 *  - submitFeedback          — persiste feedback do usuário
 *  - getProfile              — retorna perfil do usuário
 *  - updateProfile           — atualiza perfil
 *  - getHistory              — lista de conversas do usuário
 *  - deleteAccount           — apaga conta (LGPD)
 *
 * Admin-only:
 *  - adminReingest
 *  - adminListUsers
 *  - adminListConsultas
 *  - adminGetStats
 *  - adminExportData
 *
 * Triggers:
 *  - onUserCreate            — inicializa perfil
 *  - onFeedbackCreate        — log de auditoria
 *  - onConsultaCreate        — notificação ao CAO
 *  - cleanupRetention        — scheduled (limpeza LGPD)
 *  - aggregateAnalytics      — scheduled (métricas)
 */

import { setGlobalOptions } from 'firebase-functions/v2'
import { initializeApp, getApps } from 'firebase-admin/app'

// Garante que o admin SDK está inicializado no module load.
// Em Cloud Functions Gen 2, isso às vezes é lazy e o getFirestore()
// falha com "default Firebase app does not exist" em runtime.
if (getApps().length === 0) {
  try {
    initializeApp()
  } catch (e) {
    // Já inicializado por outro módulo ou pelo runtime
    console.warn('admin.initializeApp no module load falhou:', (e as Error).message)
  }
}

setGlobalOptions({
  region: 'southamerica-east1',
  maxInstances: 50,
  memory: '512MiB',
  cpu: 1,
  concurrency: 80,
  timeoutSeconds: 60,
  // App Check desabilitado por enquanto (configurar reCAPTCHA enterprise depois)
  // Sem isso, as functions retornam 403 para clientes sem token App Check
  enforceAppCheck: false,
})

// Public
export { chat } from './handlers/chat'
export { chatV2 } from './handlers/chat-v2'
export { openConsultaFormal } from './handlers/consulta-formal'
export { submitFeedback } from './handlers/feedback'
export { getProfile } from './handlers/profile'
export { getHistory } from './handlers/history'
export { updateProfile } from './handlers/profile-update'
export { deleteAccount } from './handlers/delete-account'

// LLM Config (user + admin)
export {
  getLLMConfig,
  setLLMConfig,
  deleteLLMConfig,
  adminGetGlobalLLM,
  adminSetGlobalLLM,
  listLLMModels,
  adminListAdmins,
  adminGrantAdmin,
  adminRevokeAdmin,
  adminListUserLLM,
} from './handlers/llm-config'

// Bootstrap: primeiro user vira master
export { bootstrapAdminMaster, grantAdminByEmail } from './handlers/bootstrap-admin'

// Admin
export { adminReingest } from './handlers/admin/reingest'
export { adminListConsultas } from './handlers/admin/list-consultas'
export { adminGetStats } from './handlers/admin/stats'

// Admin: upload de documentos + source paths
export {
  adminUploadDocument,
  adminListDocuments,
  adminDeleteDocument,
  adminGetSourcePaths,
  adminSetSourcePaths,
  adminSyncSourcePath,
} from './handlers/admin-documents'

// Admin: configurações globais de pesquisa
export {
  getResearchConfig,
  saveResearchConfig,
  getWebSearchConfig,
  saveWebSearchConfig,
  testWebSearch,
  getIntranetConfig,
  saveIntranetConfig,
  testIntranet,
  getPublicResearchStatus,
} from './handlers/admin-research'

// Triggers
export { onUserCreate } from './handlers/triggers/on-user-create'
export { onFeedbackCreate } from './handlers/triggers/on-feedback-create'
export { onConsultaCreate } from './handlers/triggers/on-consulta-create'

// Scheduled
export { cleanupRetention } from './handlers/scheduled/cleanup-retention'
export { aggregateAnalytics } from './handlers/scheduled/aggregate-analytics'
