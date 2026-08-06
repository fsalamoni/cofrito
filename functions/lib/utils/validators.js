"use strict";
/**
 * Validadores utilitários.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.validatePGEA = validatePGEA;
exports.sha256 = sha256;
function validatePGEA(pgea) {
    const regex = /^\d{5}\.\d{3}\.\d{3}\/\d{4}$/;
    if (!regex.test(pgea)) {
        return { valid: false, reason: 'Formato deve ser XXXXX.XXX.XXX/XXXX' };
    }
    return { valid: true };
}
function sha256(text) {
    // Para uso em Node (Cloud Functions), usar crypto do Node
    const crypto = require('node:crypto');
    return crypto.createHash('sha256').update(text).digest('hex');
}
//# sourceMappingURL=validators.js.map