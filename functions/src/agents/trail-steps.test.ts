import { describe, it, expect } from 'vitest'
import { buildTrailSteps } from './trail-steps'
import type { AgentRun, OrchestratorPlan } from './types'

const plan: OrchestratorPlan = {
  intent: 'document-retrieval',
  reasoning: 'Usuário procura material sobre nepotismo por afinidade.',
  points: [{ id: 'p1', query: 'nepotismo sobrinha', keywords: ['nepotismo', 'sobrinha'] }],
  requiresWebSearch: false,
  requiresLegalWriting: false,
  requiresCompilation: true,
  requiresInternalSearch: true,
} as OrchestratorPlan

const runs: AgentRun[] = [
  { id: 'o1', role: 'orchestrator', startedAt: '', durationMs: 1200, input: {}, output: { intent: 'document-retrieval', pointsCount: 1 }, status: 'success' },
  { id: 'r1', role: 'researcher-internal', startedAt: '', durationMs: 800, input: {}, output: { count: 4 }, status: 'success' },
  { id: 'w1', role: 'researcher-web', startedAt: '', finishedAt: '', durationMs: 0, input: {}, output: { skipped: true, reason: 'external search disabled' }, status: 'skipped', notes: 'external search disabled' },
  { id: 'c1', role: 'compiler', startedAt: '', durationMs: 300, input: {}, output: { count: 4, hasEnough: true }, status: 'success' },
  { id: 'lw1', role: 'legal-writer', startedAt: '', durationMs: 5000, input: {}, output: { length: 2100 }, status: 'success' },
]

describe('buildTrailSteps', () => {
  it('gera um passo por agente, em ordem', () => {
    const steps = buildTrailSteps(plan, runs)
    expect(steps).toHaveLength(5)
    expect(steps.map(s => s.role)).toEqual(['orchestrator', 'researcher-internal', 'researcher-web', 'compiler', 'legal-writer'])
  })

  it('usa o raciocínio do plano no passo do orquestrador', () => {
    const steps = buildTrailSteps(plan, runs)
    expect(steps[0].label).toBe('Análise do pedido')
    expect(steps[0].detail).toContain('nepotismo por afinidade')
    expect(steps[0].detail).toContain('nepotismo sobrinha')
  })

  it('resume as saídas de cada agente', () => {
    const steps = buildTrailSteps(plan, runs)
    expect(steps[1].detail).toContain('4 documento')
    expect(steps[3].detail).toContain('4 fonte')
    expect(steps[4].detail).toContain('2100')
  })

  it('marca etapa pulada com status skipped e nota', () => {
    const steps = buildTrailSteps(plan, runs)
    const web = steps.find(s => s.role === 'researcher-web')!
    expect(web.status).toBe('skipped')
    expect(web.detail).toContain('external search disabled')
  })

  it('propaga o status de erro com a mensagem', () => {
    const errRuns: AgentRun[] = [
      { id: 'lw', role: 'legal-writer', startedAt: '', durationMs: 90000, input: {}, output: {}, status: 'error', error: 'timeout' },
    ]
    const steps = buildTrailSteps(plan, errRuns)
    expect(steps[0].status).toBe('error')
    expect(steps[0].detail).toContain('timeout')
  })
})
