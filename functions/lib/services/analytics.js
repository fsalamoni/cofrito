"use strict";
/**
 * Analytics — log de métricas.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.logAnalytics = logAnalytics;
const v2_1 = require("firebase-functions/v2");
function logAnalytics(event, meta = {}) {
    v2_1.logger.info(`analytics.${event}`, meta);
}
//# sourceMappingURL=analytics.js.map