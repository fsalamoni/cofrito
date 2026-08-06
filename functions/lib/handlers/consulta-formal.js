"use strict";
/**
 * Handler de consulta formal.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.openConsultaFormal = void 0;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const v2_1 = require("firebase-functions/v2");
const firestore_1 = require("firebase-admin/firestore");
const zod_1 = require("zod");
const email_1 = require("../services/email");
const protocol_1 = require("../utils/protocol");
const validators_1 = require("../utils/validators");
const RESEND_API_KEY = (0, params_1.defineSecret)('RESEND_API_KEY');
const ConsultaRequestSchema = zod_1.z.object({
    assunto: zod_1.z.string().min(5).max(200),
    questaoObjetiva: zod_1.z.string().min(20).max(5000),
    contextoFatico: zod_1.z.string().max(10000).optional(),
    pgea: zod_1.z
        .string()
        .optional()
        .refine((v) => !v || (0, validators_1.validatePGEA)(v).valid, { message: 'PGEA inválido' }),
    documentosIds: zod_1.z.array(zod_1.z.string()).max(20).optional().default([]),
});
exports.openConsultaFormal = (0, https_1.onCall)({ secrets: [RESEND_API_KEY], cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Faça login para abrir consulta formal.');
    }
    const parsed = ConsultaRequestSchema.safeParse(request.data);
    if (!parsed.success) {
        throw new https_1.HttpsError('invalid-argument', 'Dados inválidos.', { issues: parsed.error.issues });
    }
    const db = (0, firestore_1.getFirestore)();
    const protocol = (0, protocol_1.generateConsultaProtocol)();
    const now = firestore_1.Timestamp.now();
    const consultaData = {
        protocol,
        userId: request.auth.uid,
        userEmail: request.auth.token.email ?? '',
        ...parsed.data,
        status: 'recebida',
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
    };
    await db.collection('consultas-formais').doc(protocol).set(consultaData);
    // Notifica o CAO
    try {
        const apiKey = RESEND_API_KEY.value();
        if (apiKey) {
            await (0, email_1.sendEmail)({
                apiKey,
                to: process.env.CAO_EMAIL || 'caocivel@mprs.mp.br',
                subject: `[${protocol}] Nova consulta formal via agente`,
                body: formatConsultaEmail(consultaData),
            });
        }
    }
    catch (err) {
        v2_1.logger.error('consultaFormal.email.error', { protocol, err });
        // Não falha a operação
    }
    v2_1.logger.info('consultaFormal.created', { protocol, userId: request.auth.uid });
    return {
        protocol,
        status: 'recebida',
        createdAt: now.toDate().toISOString(),
        estimatedResponseDays: '5 a 15 dias úteis',
    };
});
function formatConsultaEmail(c) {
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
`.trim();
}
//# sourceMappingURL=consulta-formal.js.map