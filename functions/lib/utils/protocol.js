"use strict";
/**
 * Gera protocolo de consulta formal.
 * Formato: CAO-YYYYMMDD-XXXXX
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateConsultaProtocol = generateConsultaProtocol;
function generateConsultaProtocol() {
    const d = new Date();
    const date = d.toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.floor(Math.random() * 99999).toString().padStart(5, '0');
    return `CAO-${date}-${random}`;
}
//# sourceMappingURL=protocol.js.map