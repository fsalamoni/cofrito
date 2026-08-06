"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.aggregateAnalytics = exports.cleanupRetention = exports.onConsultaCreate = exports.onFeedbackCreate = exports.onUserCreate = exports.adminGetStats = exports.adminListConsultas = exports.adminReingest = exports.deleteAccount = exports.updateProfile = exports.getHistory = exports.getProfile = exports.submitFeedback = exports.openConsultaFormal = exports.chat = void 0;
const v2_1 = require("firebase-functions/v2");
(0, v2_1.setGlobalOptions)({
    region: 'southamerica-east1',
    maxInstances: 50,
    memory: '512MiB',
    cpu: 1,
    concurrency: 80,
    timeoutSeconds: 60,
    secrets: ['GEMINI_API_KEY', 'RESEND_API_KEY'],
});
// Public
var chat_1 = require("./handlers/chat");
Object.defineProperty(exports, "chat", { enumerable: true, get: function () { return chat_1.chat; } });
var consulta_formal_1 = require("./handlers/consulta-formal");
Object.defineProperty(exports, "openConsultaFormal", { enumerable: true, get: function () { return consulta_formal_1.openConsultaFormal; } });
var feedback_1 = require("./handlers/feedback");
Object.defineProperty(exports, "submitFeedback", { enumerable: true, get: function () { return feedback_1.submitFeedback; } });
var profile_1 = require("./handlers/profile");
Object.defineProperty(exports, "getProfile", { enumerable: true, get: function () { return profile_1.getProfile; } });
var history_1 = require("./handlers/history");
Object.defineProperty(exports, "getHistory", { enumerable: true, get: function () { return history_1.getHistory; } });
var profile_update_1 = require("./handlers/profile-update");
Object.defineProperty(exports, "updateProfile", { enumerable: true, get: function () { return profile_update_1.updateProfile; } });
var delete_account_1 = require("./handlers/delete-account");
Object.defineProperty(exports, "deleteAccount", { enumerable: true, get: function () { return delete_account_1.deleteAccount; } });
// Admin
var reingest_1 = require("./handlers/admin/reingest");
Object.defineProperty(exports, "adminReingest", { enumerable: true, get: function () { return reingest_1.adminReingest; } });
var list_consultas_1 = require("./handlers/admin/list-consultas");
Object.defineProperty(exports, "adminListConsultas", { enumerable: true, get: function () { return list_consultas_1.adminListConsultas; } });
var stats_1 = require("./handlers/admin/stats");
Object.defineProperty(exports, "adminGetStats", { enumerable: true, get: function () { return stats_1.adminGetStats; } });
// Triggers
var on_user_create_1 = require("./handlers/triggers/on-user-create");
Object.defineProperty(exports, "onUserCreate", { enumerable: true, get: function () { return on_user_create_1.onUserCreate; } });
var on_feedback_create_1 = require("./handlers/triggers/on-feedback-create");
Object.defineProperty(exports, "onFeedbackCreate", { enumerable: true, get: function () { return on_feedback_create_1.onFeedbackCreate; } });
var on_consulta_create_1 = require("./handlers/triggers/on-consulta-create");
Object.defineProperty(exports, "onConsultaCreate", { enumerable: true, get: function () { return on_consulta_create_1.onConsultaCreate; } });
// Scheduled
var cleanup_retention_1 = require("./handlers/scheduled/cleanup-retention");
Object.defineProperty(exports, "cleanupRetention", { enumerable: true, get: function () { return cleanup_retention_1.cleanupRetention; } });
var aggregate_analytics_1 = require("./handlers/scheduled/aggregate-analytics");
Object.defineProperty(exports, "aggregateAnalytics", { enumerable: true, get: function () { return aggregate_analytics_1.aggregateAnalytics; } });
//# sourceMappingURL=index.js.map