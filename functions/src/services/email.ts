/**
 * Email service — wrapper Resend.
 */

import { Resend } from 'resend'

export interface EmailOptions {
  apiKey: string
  to: string
  from?: string
  subject: string
  body: string
  html?: string
}

export async function sendEmail(opts: EmailOptions): Promise<void> {
  const resend = new Resend(opts.apiKey)
  await resend.emails.send({
    from: opts.from || 'Cofrito <no-reply@cofrito.caocipp.mp.rs.gov.br>',
    to: opts.to,
    subject: opts.subject,
    text: opts.body,
    html: opts.html || `<pre style="font-family: monospace; white-space: pre-wrap;">${opts.body}</pre>`,
  })
}
