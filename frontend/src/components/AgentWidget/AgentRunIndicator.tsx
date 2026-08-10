/**
 * AgentRunIndicator — exibe o timeline do pipeline multi-agente no chat.
 *
 * Mostra:
 *  - Quais skills foram executadas (orchestrator, researcher-internal, etc.)
 *  - Status de cada uma (✓ success, ✗ error, ⤴ skipped)
 *  - Duração de cada uma
 *  - Score do crítico (se houver)
 *  - Plano do orquestrador (intenção + pontos)
 *
 * Aparece em cada resposta do chat para dar transparência ao usuário sobre
 * o que o agente fez para chegar na resposta.
 */

import { useState } from 'react'
import { ChevronDown, ChevronUp, Check, X, SkipForward } from 'lucide-react'
import { AGENT_ROLE_LABELS, AGENT_ROLE_ICONS } from '@/types'
import type { AgentRole, OrchestratorPlan } from '@/types'

export interface AgentRunIndicatorProps {
  agentRuns: Array<{ role: AgentRole; status: 'success' | 'error' | 'skipped'; durationMs?: number }>
  iterations?: number
  criticScore?: number
  plan?: OrchestratorPlan | null
}

const STATUS_ICONS: Record<'success' | 'error' | 'skipped', React.ReactNode> = {
  success: <Check size={11} color="#10b981" />,
  error:   <X size={11} color="#dc2626" />,
  skipped: <SkipForward size={11} color="#9ca3af" />,
}

export function AgentRunIndicator({ agentRuns, iterations, criticScore, plan }: AgentRunIndicatorProps) {
  const [expanded, setExpanded] = useState(false)

  if (!agentRuns || agentRuns.length === 0) return null

  const successCount = agentRuns.filter((r) => r.status === 'success').length
  const errorCount = agentRuns.filter((r) => r.status === 'error').length
  const skippedCount = agentRuns.filter((r) => r.status === 'skipped').length
  const totalDuration = agentRuns.reduce((s, r) => s + (r.durationMs ?? 0), 0)

  return (
    <div style={wrapStyle}>
      <button onClick={() => setExpanded((v) => !v)} style={toggleStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          <span style={titleStyle}>
            🧭 Pipeline multi-agente
          </span>
          <span style={summaryStyle}>
            {agentRuns.length} skills · {successCount} ✓ · {errorCount} ✗ · {skippedCount} ⤴
            {iterations ? ` · ${iterations} iteração(ões)` : ''}
            {totalDuration > 0 ? ` · ${(totalDuration / 1000).toFixed(1)}s` : ''}
          </span>
        </div>
        {criticScore !== undefined && (
          <span style={{
            ...criticBadgeStyle,
            background: criticScore >= 80 ? 'rgba(16, 185, 129, 0.15)' : criticScore >= 60 ? 'rgba(250, 204, 21, 0.15)' : 'rgba(248, 113, 113, 0.15)',
            color: criticScore >= 80 ? '#047857' : criticScore >= 60 ? '#854d0e' : '#991b1b',
          }}>
            🎯 Crítico: {criticScore}/100
          </span>
        )}
      </button>

      {expanded && (
        <div style={bodyStyle}>
          {plan && (
            <div style={planStyle}>
              <div style={planHeaderStyle}>
                <strong>Intenção:</strong> <code style={codeStyle}>{plan.intent}</code>
              </div>
              {plan.reasoning && (
                <div style={planReasoningStyle}>{plan.reasoning}</div>
              )}
              {plan.points && plan.points.length > 0 && (
                <div style={pointsStyle}>
                  <strong>Pontos de pesquisa:</strong>
                  <ol style={pointsListStyle}>
                    {plan.points.map((p) => (
                      <li key={p.id}>
                        <code style={codeStyle}>{p.priority}</code> {p.query}
                        {p.keywords.length > 0 && (
                          <span style={keywordStyle}>({p.keywords.slice(0, 4).join(', ')})</span>
                        )}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          )}

          <div style={runsListStyle}>
            {agentRuns.map((r, i) => (
              <div key={i} style={runRowStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
                  <span style={{ fontSize: 13 }}>{AGENT_ROLE_ICONS[r.role] || '⚙'}</span>
                  <span style={runLabelStyle}>{AGENT_ROLE_LABELS[r.role] || r.role}</span>
                </div>
                <div style={runMetaStyle}>
                  {STATUS_ICONS[r.status]}
                  <span style={{ fontSize: 9, color: '#6b7280' }}>
                    {r.status === 'success' ? 'OK' : r.status === 'error' ? 'ERRO' : 'PULOU'}
                  </span>
                  {r.durationMs !== undefined && r.durationMs > 0 && (
                    <span style={{ fontSize: 9, color: '#9ca3af' }}>{(r.durationMs / 1000).toFixed(1)}s</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Versão compacta para mostrar dentro do MessageBubble.
 * Não tem os detalhes do trail (porque a resposta do backend só envia a contagem),
 * mas mostra o resumo visual do que aconteceu no pipeline.
 */
export function AgentRunIndicatorCompact({
  agentRunsCount,
  iterations,
  criticScore,
}: {
  agentRunsCount?: number
  iterations?: number
  criticScore?: number
}) {
  if (!agentRunsCount && !iterations && criticScore === undefined) return null
  return (
    <div style={compactWrapStyle}>
      <span style={{ fontSize: 9, color: '#6b7280', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        🧭
        {agentRunsCount !== undefined && <span><strong>{agentRunsCount}</strong> skills</span>}
        {iterations !== undefined && iterations > 1 && <span>· {iterations} iteração(ões)</span>}
        {criticScore !== undefined && (
          <span style={{
            marginLeft: 4,
            padding: '1px 5px',
            borderRadius: 6,
            fontWeight: 600,
            background: criticScore >= 80 ? 'rgba(16, 185, 129, 0.15)' : criticScore >= 60 ? 'rgba(250, 204, 21, 0.15)' : 'rgba(248, 113, 113, 0.15)',
            color: criticScore >= 80 ? '#047857' : criticScore >= 60 ? '#854d0e' : '#991b1b',
          }}>
            🎯 {criticScore}/100
          </span>
        )}
      </span>
    </div>
  )
}

const compactWrapStyle: React.CSSProperties = {
  display: 'inline-block',
  marginTop: 4,
  padding: '2px 6px',
  background: '#f8fafc',
  border: '1px solid #e5e7eb',
  borderRadius: 6,
  fontSize: 9,
  color: '#6b7280',
  fontFamily: 'inherit',
}

const wrapStyle: React.CSSProperties = {
  marginTop: 6,
  border: '1px solid #e5e7eb',
  borderRadius: 6,
  background: '#f8fafc',
  overflow: 'hidden',
  fontFamily: 'inherit',
}

const toggleStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
  background: 'transparent',
  border: 'none',
  padding: '6px 8px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  textAlign: 'left',
}

const titleStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: '#374151',
}

const summaryStyle: React.CSSProperties = {
  fontSize: 9,
  color: '#6b7280',
  fontFamily: 'ui-monospace, monospace',
}

const criticBadgeStyle: React.CSSProperties = {
  fontSize: 9,
  padding: '2px 6px',
  borderRadius: 8,
  fontWeight: 600,
  whiteSpace: 'nowrap',
}

const bodyStyle: React.CSSProperties = {
  padding: '6px 8px',
  borderTop: '1px solid #e5e7eb',
  background: '#ffffff',
}

const planStyle: React.CSSProperties = {
  marginBottom: 6,
  padding: 6,
  background: 'rgba(99, 102, 241, 0.05)',
  borderRadius: 4,
  border: '1px solid rgba(99, 102, 241, 0.15)',
}

const planHeaderStyle: React.CSSProperties = {
  fontSize: 10,
  color: '#1e40af',
  marginBottom: 2,
}

const planReasoningStyle: React.CSSProperties = {
  fontSize: 10,
  color: '#374151',
  marginBottom: 4,
  lineHeight: 1.4,
}

const pointsStyle: React.CSSProperties = {
  fontSize: 10,
  color: '#1e40af',
}

const pointsListStyle: React.CSSProperties = {
  margin: '2px 0 0 14px',
  padding: 0,
  fontSize: 10,
  color: '#374151',
}

const codeStyle: React.CSSProperties = {
  fontFamily: 'ui-monospace, monospace',
  fontSize: 9,
  background: 'rgba(0,0,0,0.06)',
  padding: '0 4px',
  borderRadius: 3,
}

const keywordStyle: React.CSSProperties = {
  color: '#6b7280',
  fontSize: 9,
  marginLeft: 4,
}

const runsListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
}

const runRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '3px 4px',
  borderRadius: 3,
  background: '#f8fafc',
}

const runLabelStyle: React.CSSProperties = {
  fontSize: 10,
  color: '#374151',
  fontWeight: 500,
}

const runMetaStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
}
