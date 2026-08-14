/**
 * Testes do agent-events (mapeamento TrailEvent -> NarrativeEvent).
 */
import { describe, it, expect } from 'vitest'
import { mapToNarrative } from './agent-events'

describe('mapToNarrative', () => {
  const conv = 'conv-1'
  const msg = 'msg-1'

  describe('agent_start', () => {
    it('orchestrator -> thinking', () => {
      const result = mapToNarrative('agent_start', { role: 'orchestrator', ts: '2026-08-11T16:00:00Z' }, conv, msg)
      expect(result?.type).toBe('thinking')
      expect(result?.role).toBe('orchestrator')
    })

    it('researcher-internal -> searching-acervo', () => {
      const result = mapToNarrative('agent_start', { role: 'researcher-internal', ts: '2026-08-11T16:00:01Z' }, conv, msg)
      expect(result?.type).toBe('searching-acervo')
    })

    it('researcher-web -> searching-web', () => {
      const result = mapToNarrative('agent_start', { role: 'researcher-web', ts: '2026-08-11T16:00:02Z' }, conv, msg)
      expect(result?.type).toBe('searching-web')
    })

    it('compiler -> compiling', () => {
      const result = mapToNarrative('agent_start', { role: 'compiler', ts: '2026-08-11T16:00:03Z' }, conv, msg)
      expect(result?.type).toBe('compiling')
    })

    it('legal-writer -> answering', () => {
      const result = mapToNarrative('agent_start', { role: 'legal-writer', ts: '2026-08-11T16:00:04Z' }, conv, msg)
      expect(result?.type).toBe('answering')
    })
  })

  describe('plan', () => {
    it('mapeia para planning', () => {
      const result = mapToNarrative('plan', { plan: {}, ts: '2026-08-11T16:00:00Z' }, conv, msg)
      expect(result?.type).toBe('planning')
    })
  })

  describe('sources_found', () => {
    it('internal -> searching-acervo com count', () => {
      const result = mapToNarrative('sources_found', { source: 'internal', count: 5, ts: '2026-08-11T16:00:00Z' }, conv, msg)
      expect(result?.type).toBe('searching-acervo')
      expect(result?.count).toBe(5)
    })

    it('web -> searching-web com count', () => {
      const result = mapToNarrative('sources_found', { source: 'web', count: 3, ts: '2026-08-11T16:00:00Z' }, conv, msg)
      expect(result?.type).toBe('searching-web')
      expect(result?.count).toBe(3)
    })

    it('internal inclui titulos dos documentos', () => {
      const result = mapToNarrative('sources_found', { source: 'internal', count: 2, titles: ['Parecer X', 'TAC Y'], ts: '2026-08-11T16:00:00Z' }, conv, msg)
      expect(result?.titles).toEqual(['Parecer X', 'TAC Y'])
    })

    it('compiled com count -> compiling (entrega)', () => {
      const result = mapToNarrative('sources_found', { source: 'compiled', count: 3, titles: ['A', 'B'], ts: '2026-08-11T16:00:00Z' }, conv, msg)
      expect(result?.type).toBe('compiling')
      expect(result?.details).toContain('Entregando')
      expect(result?.titles).toEqual(['A', 'B'])
    })

    it('compiled com count 0 -> null', () => {
      const result = mapToNarrative('sources_found', { source: 'compiled', count: 0, ts: '2026-08-11T16:00:00Z' }, conv, msg)
      expect(result).toBeNull()
    })
  })

  describe('plan (compreensao do pedido)', () => {
    it('inclui o raciocinio e os pontos como titulos', () => {
      const result = mapToNarrative('plan', {
        plan: { reasoning: 'Pedido sobre nepotismo', points: [{ query: 'nepotismo em cargo comissionado' }], detectedAreas: ['Administrativo'] },
        ts: '2026-08-11T16:00:00Z',
      }, conv, msg)
      expect(result?.type).toBe('planning')
      expect(result?.details).toContain('nepotismo')
      expect(result?.details).toContain('Administrativo')
      expect(result?.titles).toEqual(['nepotismo em cargo comissionado'])
    })
  })

  describe('agent_end', () => {
    it('researcher-internal end -> searching-acervo com duration', () => {
      const result = mapToNarrative('agent_end', { role: 'researcher-internal', durationMs: 250, status: 'success', ts: '2026-08-11T16:00:00Z' }, conv, msg)
      expect(result?.type).toBe('searching-acervo')
      expect(result?.durationMs).toBe(250)
      expect(result?.status).toBe('success')
    })

    it('orchestrator end -> null (ja temos thinking)', () => {
      const result = mapToNarrative('agent_end', { role: 'orchestrator', ts: '2026-08-11T16:00:00Z' }, conv, msg)
      expect(result).toBeNull()
    })
  })

  describe('final_answer / error', () => {
    it('final_answer -> complete', () => {
      const result = mapToNarrative('final_answer', { length: 1500, ts: '2026-08-11T16:00:00Z' }, conv, msg)
      expect(result?.type).toBe('complete')
    })

    it('error -> error', () => {
      const result = mapToNarrative('error', { message: 'falhou', ts: '2026-08-11T16:00:00Z' }, conv, msg)
      expect(result?.type).toBe('error')
      expect(result?.details).toBe('falhou')
    })
  })

  describe('contexto preservado', () => {
    it('mantem conversationId e messageId', () => {
      const result = mapToNarrative('agent_start', { role: 'orchestrator', ts: '2026-08-11T16:00:00Z' }, 'conv-X', 'msg-Y')
      expect(result?.conversationId).toBe('conv-X')
      expect(result?.messageId).toBe('msg-Y')
    })
  })
})
