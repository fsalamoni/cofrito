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

setGlobalOptions({
  region: 'southamerica-east1',
  maxInstances: 50,
  memory: '512MiB',
  cpu: 1,
  concurrency: 80,
  timeoutSeconds: 60,
  secrets: ['GEMINI_API_KEY', 'RESEND_API_KEY'],
})

// Public
export { chat } from './handlers/chat'
export { openConsultaFormal } from './handlers/consulta-formal'
export { submitFeedback } from './handlers/feedback'
export { getProfile } from './handlers/profile'
export { getHistory } from './handlers/history'
export { updateProfile } from './handlers/profile-update'
export { deleteAccount } from './handlers/delete-account'

// Admin
export { adminReingest } from './handlers/admin/reingest'
export { adminListConsultas } from './handlers/admin/list-consultas'
export { adminGetStats } from './handlers/admin/stats'

// Triggers
export { onUserCreate } from './handlers/triggers/on-user-create'
export { onFeedbackCreate } from './handlers/triggers/on-feedback-create'
export { onConsultaCreate } from './handlers/triggers/on-consulta-create'

// Scheduled
export { cleanupRetention } from './handlers/scheduled/cleanup-retention'
export { aggregateAnalytics } from './handlers/scheduled/aggregate-analytics'
