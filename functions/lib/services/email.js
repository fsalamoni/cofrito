"use strict";
/**
 * Email service — wrapper Resend.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendEmail = sendEmail;
const resend_1 = require("resend");
async function sendEmail(opts) {
    const resend = new resend_1.Resend(opts.apiKey);
    await resend.emails.send({
        from: opts.from || 'Cofrito <no-reply@cofrito.caocipp.mp.rs.gov.br>',
        to: opts.to,
        subject: opts.subject,
        text: opts.body,
        html: opts.html || `<pre style="font-family: monospace; white-space: pre-wrap;">${opts.body}</pre>`,
    });
}
//# sourceMappingURL=email.js.map