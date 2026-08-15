import { describe, it, expect } from 'vitest'
import { getNextStep, isStaleLock, type ProcessingStep } from './admin-process-queue'

describe('admin-process-queue', () => {
  describe('getNextStep — progressão das etapas', () => {
    it('queued → json_creating → classifying → key_points → ementa → completed', () => {
      expect(getNextStep('queued')).toBe('json_creating')
      expect(getNextStep('json_creating')).toBe('classifying')
      expect(getNextStep('classifying')).toBe('key_points_extracting')
      expect(getNextStep('key_points_extracting')).toBe('ementa_generating')
      expect(getNextStep('ementa_generating')).toBe('completed')
    })

    it('etapa desconhecida ou final → completed', () => {
      expect(getNextStep('completed')).toBe('completed')
      expect(getNextStep('error' as ProcessingStep)).toBe('completed')
    })
  })

  describe('isStaleLock — recuperação de lock travado', () => {
    it('lock sem timestamp é considerado stale (destrava)', () => {
      expect(isStaleLock(null)).toBe(true)
      expect(isStaleLock(undefined)).toBe(true)
    })

    it('lock recente NÃO é stale', () => {
      expect(isStaleLock(new Date())).toBe(false)
      expect(isStaleLock(new Date(Date.now() - 5_000))).toBe(false)
    })

    it('lock parado há muito tempo é stale', () => {
      expect(isStaleLock(new Date(Date.now() - 10 * 60_000))).toBe(true)
    })
  })
})
