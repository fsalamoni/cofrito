"use strict";
/**
 * Trigger: notifica CAO via e-mail ao receber consulta.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.onConsultaCreate = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const params_1 = require("firebase-functions/params");
const v2_1 = require("firebase-functions/v2");
const email_1 = require("../../services/email");
const RESEND_API_KEY = (0, params_1.defineSecret)('RESEND_API_KEY');
exports.onConsultaCreate = (0, firestore_1.onDocumentCreated)({
    document: 'consultas-formais/{consultaId}',
    region: 'southamerica-east1',
    secrets: [RESEND_API_KEY],
}, async (event) => {
    const data = event.data?.data();
    if (!data)
        return;
    const apiKey = RESEND_API_KEY.value();
    if (!apiKey) {
        v2_1.logger.warn('onConsultaCreate.no_api_key');
        return;
    }
    try {
        await (0, email_1.sendEmail)({
            apiKey,
            to: process.env.CAO_EMAIL || 'caocivel@mprs.mp.br',
            subject: `[${data.protocol}] Nova consulta formal`,
            body: `Protocolo: ${data.protocol}\nUsuário: ${data.userEmail}\nAssunto: ${data.assunto}\n\nQuestão objetiva:\n${data.questaoObjetiva}`,
        });
    }
    catch (err) {
        v2_1.logger.error('onConsultaCreate.email.error', { err });
    }
});
//# sourceMappingURL=on-consulta-create.js.map