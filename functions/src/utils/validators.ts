/**
 * Validadores utilitários.
 */

import { createHash } from 'node:crypto'

export function validatePGEA(pgea: string): { valid: boolean; reason?: string } {
  const regex = /^\d{5}\.\d{3}\.\d{3}\/\d{4}$/
  if (!regex.test(pgea)) {
    return { valid: false, reason: 'Formato deve ser XXXXX.XXX.XXX/XXXX' }
  }
  return { valid: true }
}

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}
