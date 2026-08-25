/**
 * Constroi os passos de "raciocinio e acoes" do orquestrador para PERSISTIR
 * junto da mensagem — assim o usuario pode expandir e ver o que o Cofrito fez
 * para chegar na resposta (inclusive ao reabrir a conversa no historico).
 */
import type { AgentRun, OrchestratorPlan } from './types'
import type { TrailStep } from '../services/history'

const ROLE_LABELS: Record<string, string> = {
  orchestrator: 'Análise do pedido',
  'researcher-internal': 'Busca no acervo',
  'researcher-web': 'Busca na web externa',
  compiler: 'Organização das fontes',
  'legal-writer': 'Redação da análise jurídica',
  critic: 'Revisão crítica',
}

function summarizeOutput(role: string, output: Record<string, unknown> | undefined): string | undefined {
  if (!output) return undefined
  const o = output as Record<string, unknown>
  switch (role) {
    case 'orchestrator':
      return [
        o.intent ? `Intenção: ${o.intent}` : '',
        typeof o.pointsCount === 'number' ? `${o.pointsCount} ponto(s) de pesquisa` : '',
      ].filter(Boolean).join(' · ') || undefined
    case 'researcher-internal':
    case 'researcher-web':
      return typeof o.count === 'number' ? `${o.count} documento(s) encontrado(s)` : undefined
    case 'compiler':
      return [
        typeof o.count === 'number' ? `${o.count} fonte(s) compilada(s)` : '',
        o.hasEnough === false ? 'material parcial' : '',
      ].filter(Boolean).join(' · ') || undefined
    case 'legal-writer':
      return typeof o.length === 'number' ? `análise redigida (${o.length} caracteres)` : undefined
    default:
      return undefined
  }
}

/**
 * Mapeia os agentRuns (+ o raciocinio do plano) em passos legiveis.
 * Preserva a ORDEM CRONOLOGICA de execucao dos agentes.
 */
export function buildTrailSteps(
  plan: OrchestratorPlan | undefined,
  agentRuns: AgentRun[],
): TrailStep[] {
  const steps: TrailStep[] = []
  for (const run of agentRuns) {
    const label = ROLE_LABELS[run.role] || run.role
    let detail: string | undefined
    if (run.role === 'orchestrator' && plan?.reasoning) {
      // O "pensamento" do orquestrador: o raciocinio + pontos pesquisados.
      const pts = plan.points?.length ? ` Pontos: ${plan.points.map((p) => p.query).join('; ')}.` : ''
      detail = `${plan.reasoning.trim()}${pts}`.slice(0, 600)
    } else if (run.status === 'skipped') {
      detail = (run.notes as string) || 'etapa não necessária'
    } else if (run.status === 'error') {
      detail = run.error ? `falhou: ${run.error}` : 'falhou'
    } else {
      detail = summarizeOutput(run.role, run.output as Record<string, unknown>)
    }
    steps.push({
      role: run.role,
      label,
      detail,
      status: run.status === 'pending' ? 'info' : run.status,
      durationMs: run.durationMs,
    })
  }
  return steps
}
