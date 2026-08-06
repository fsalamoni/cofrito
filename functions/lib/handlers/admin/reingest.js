"use strict";
/**
 * Admin: re-ingerir corpus.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminReingest = void 0;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const ingestion_1 = require("../../services/ingestion");
const auth_1 = require("../../middleware/auth");
const GEMINI_API_KEY = (0, params_1.defineSecret)('GEMINI_API_KEY');
exports.adminReingest = (0, https_1.onCall)({ secrets: [GEMINI_API_KEY], cors: true }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Faça login.');
    await (0, auth_1.assertAdmin)(request.auth.uid);
    const result = await (0, ingestion_1.runIngestion)({ apiKey: GEMINI_API_KEY.value(), source: 'admin' });
    return result;
});
//# sourceMappingURL=reingest.js.map