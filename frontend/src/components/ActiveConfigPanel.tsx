/**
 * ActiveConfigPanel — mostra a configuração ATIVA do LLM com TODOS os detalhes.
 *
 * Exibe um quadro claro e completo de qual provider/LLM/modelo está em uso,
 * com endpoint, temperatura, max tokens, tier, notas de capacidade (extração,
 * síntese, raciocínio, redação), melhor para, contexto e custos em R$.
 *
 * Usado tanto em `/admin` (config global) quanto em `/settings` (config pessoal).
 *
 * Props:
 *  - config: a config ATIVA (já resolvida: global > user > fallback)
 *  - source: 'global' | 'user' | 'fallback' | 'none'  — quem originou essa config
 *  - provider: a config do provider (description, defaultBaseUrl, apiKeyUrl)
 */

import { useMemo } from 'react'
import { getProviderInfo, getEnrichedModel } from '@/lib/providers'
import {
  AGENT_CATEGORY_LABELS,
  AGENT_CATEGORY_COLORS,
  AGENT_CATEGORY_ICONS,
  MODEL_ROLE_LABELS,
  MODEL_ROLE_COLORS,
  CAPABILITY_LABELS,
  formatContext,
  scoreColor,
} from '@/lib/model-scoring'
import { formatCost } from '@/lib/currency-utils'
import { Cpu, Coins, Globe, Zap, Scale, Brain, FileText, TrendingUp, Activity, Link2, Settings2, ShieldCheck, User } from 'lucide-react'
import { InfoModal } from '@/components/InfoModal'
import { TemperatureInfo, MaxTokensInfo, ContextInfo, PricingInfo } from '@/components/llm-info-content'
import type { LLMConfig, LLMProvider } from '@/types'
import type { AgentCategory } from '@/types'

export type ConfigSource = 'global' | 'user' | 'fallback' | 'none'

export interface ActiveConfigPanelProps {
  config: Partial<LLMConfig> | null | undefined
  source: ConfigSource
}

const SOURCE_META: Record<ConfigSource, { label: string; color: string; icon: React.ReactNode; description: string }> = {
  global: {
    label: 'Configuração Global (Admin Master)',
    color: '#b45309',
    icon: <ShieldCheck size={12} />,
    description: 'Definida pelo administrador master — todos os usuários usam esta.',
  },
  user: {
    label: 'Sua configuração pessoal',
    color: '#1a4d8f',
    icon: <User size={12} />,
    description: 'Configuração pessoal que você definiu (substitui qualquer global).',
  },
  fallback: {
    label: 'Fallback do sistema',
    color: '#6b7280',
    icon: <Settings2 size={12} />,
    description: 'Configuração padrão de fallback do sistema (sem customização do user/admin).',
  },
  none: {
    label: 'Nenhuma configuração ativa',
    color: '#dc2626',
    icon: <Settings2 size={12} />,
    description: 'Você ainda não configurou um provedor de LLM. O chat não vai funcionar até você definir um.',
  },
}

export function ActiveConfigPanel({ config, source }: ActiveConfigPanelProps) {
  const sourceMeta = SOURCE_META[source]
  const provider = (config?.provider as LLMProvider) ?? null
  const model = config?.model ?? null
  const providerInfo = provider ? getProviderInfo(provider) : undefined

  // Buscar modelo enriquecido para mostrar tier, capabilities, scores
  const enrichedModel = useMemo(() => {
    if (!provider || !model) return null
    return getEnrichedModel(provider, model) ?? null
  }, [provider, model])

  const inputCost = enrichedModel?.inputCost ?? 0
  const outputCost = enrichedModel?.outputCost ?? 0
  const isFree = enrichedModel?.isFree ?? (inputCost === 0 && outputCost === 0)
  const tier = enrichedModel?.tier ?? 'balanced'
  const role = enrichedModel?.role ?? 'balanced'
  const capabilities = enrichedModel?.capabilities ?? (model ? ['text'] : [])
  const fit = useMemo(
    () => enrichedModel?.agentFit ?? { extraction: 0, synthesis: 0, reasoning: 0, writing: 0 },
    [enrichedModel],
  )
  const contextWindow = enrichedModel?.contextWindow ?? 0

  // Top categoria (melhor para)
  const topCategory: AgentCategory = useMemo(() => {
    const entries = Object.entries(fit) as [AgentCategory, number][]
    entries.sort((a, b) => b[1] - a[1])
    return entries[0]?.[0] ?? 'synthesis'
  }, [fit])

  const endpoint = config?.baseUrl || providerInfo?.defaultBaseUrl || '—'
  const temperature = config?.temperature ?? 0.3
  const maxTokens = config?.maxTokens ?? 2000

  return (
    <div style={wrapStyle}>
      {/* Header com fonte */}
      <div style={{
        ...headerStyle,
        borderBottomColor: sourceMeta.color + '40',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ ...sourceIconStyle, color: sourceMeta.color, background: sourceMeta.color + '15' }}>
            {sourceMeta.icon}
          </span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: sourceMeta.color }}>
              {sourceMeta.label}
            </div>
            <div style={{ fontSize: 10, color: '#6b7280', marginTop: 1 }}>
              {sourceMeta.description}
            </div>
          </div>
        </div>
      </div>

      {/* Identificação principal: Provedor | LLM | Modelo */}
      <div style={idGridStyle}>
        <Field
          label="Provedor"
          icon={<Globe size={11} />}
          value={provider ?? '—'}
          subValue={providerInfo?.label}
        />
        <Field
          label="LLM (família)"
          icon={<Activity size={11} />}
          value={enrichedModel ? (enrichedModel.id.split('/')[0] || provider) : '—'}
          subValue={providerInfo?.description}
        />
        <Field
          label="Modelo"
          icon={<Cpu size={11} />}
          value={enrichedModel?.name ?? model ?? '—'}
          subValue={model ?? undefined}
          mono
        />
      </div>

      {/* Endpoint + configs numéricas */}
      <div style={configsGridStyle}>
        <Field
          label="Endpoint (Base URL)"
          icon={<Link2 size={11} />}
          value={endpoint}
          mono
        />
        <Field
          label="Temperatura"
          icon={<TrendingUp size={11} />}
          value={temperature.toFixed(2)}
          hint={<InfoModal title="Temperatura" iconSize={9}><TemperatureInfo /></InfoModal>}
        />
        <Field
          label="Max tokens"
          icon={<Settings2 size={11} />}
          value={maxTokens.toLocaleString('pt-BR')}
          hint={<InfoModal title="Max tokens" iconSize={9}><MaxTokensInfo /></InfoModal>}
          subValue={`≈ ${Math.round(maxTokens * 0.75).toLocaleString('pt-BR')} palavras`}
        />
      </div>

      {/* Perfil do modelo: tier, role, capabilities, melhor para, contexto */}
      {enrichedModel && (
        <div style={profileSectionStyle}>
          <div style={sectionTitleStyle}>📊 Perfil do modelo</div>

          <div style={badgesRowStyle}>
            <Badge label={tier === 'fast' ? '⚡ Rápido' : tier === 'premium' ? '⭐ Premium' : '⚖ Equilibrado'}
                   bg={tier === 'fast' ? 'rgba(16, 185, 129, 0.15)' : tier === 'premium' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(139, 92, 246, 0.15)'}
                   color={tier === 'fast' ? '#065f46' : tier === 'premium' ? '#92400e' : '#5b21b6'} />
            <Badge label={MODEL_ROLE_LABELS[role]}
                   bg={MODEL_ROLE_COLORS[role].bg}
                   color={MODEL_ROLE_COLORS[role].text} />
            {isFree && <Badge label="✦ GRÁTIS" bg="rgba(16, 185, 129, 0.20)" color="#065f46" />}
            {capabilities.map((c) => {
              const info = CAPABILITY_LABELS[c]
              return (
                <Badge key={c} label={`${info.icon} ${info.label}`}
                       bg={`${info.color}1a`} color={info.color} />
              )
            })}
          </div>

          <div style={contextRowStyle}>
            <Cpu size={11} color="#6b7280" />
            <span style={{ fontSize: 11, color: '#374151', fontWeight: 600, fontFamily: 'ui-monospace, monospace' }}>
              Contexto: {formatContext(contextWindow)} tokens
            </span>
            <InfoModal title="Contexto" iconSize={9}><ContextInfo /></InfoModal>
            {contextWindow > 0 && (
              <span style={{ fontSize: 10, color: '#6b7280', marginLeft: 4 }}>
                (≈ {Math.round(contextWindow * 0.75 / 250).toLocaleString('pt-BR')} páginas A4)
              </span>
            )}
          </div>
        </div>
      )}

      {/* Notas de capacidade (graduação 0-100) */}
      {enrichedModel && (
        <div style={scoresSectionStyle}>
          <div style={sectionTitleStyle}>
            🎓 Graduação de capacidades (0-100, normalizada por provider)
          </div>
          <div style={scoresGridStyle}>
            <ScoreCard label="Extração" icon={<Zap size={11} />} score={fit.extraction} />
            <ScoreCard label="Síntese"   icon={<Scale size={11} />} score={fit.synthesis} />
            <ScoreCard label="Raciocínio" icon={<Brain size={11} />} score={fit.reasoning} />
            <ScoreCard label="Redação"    icon={<FileText size={11} />} score={fit.writing} />
          </div>

          <div style={bestForStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>Melhor para:</span>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 8px',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                background: AGENT_CATEGORY_COLORS[topCategory] + '20',
                color: AGENT_CATEGORY_COLORS[topCategory],
              }}>
                {AGENT_CATEGORY_ICONS[topCategory]} {AGENT_CATEGORY_LABELS[topCategory]}
              </span>
              <span style={{ fontSize: 10, color: '#6b7280' }}>
                ({topCategory === 'extraction' ? 'Triagem, Fact-Checker' :
                  topCategory === 'synthesis' ? 'Compilador, Revisor' :
                  topCategory === 'reasoning' ? 'Pesquisador, Jurista' : 'Redator'})
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Custos */}
      <div style={pricingSectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Coins size={11} color="#6b7280" />
          <div style={sectionTitleStyle}>Custos por 1M tokens (referência em R$, taxa R$ 5,70/USD)</div>
          <InfoModal title="Custos (R$/1M tokens)" iconSize={9}><PricingInfo /></InfoModal>
        </div>
        <div style={pricingGridStyle}>
          <div style={costCardStyle}>
            <div style={costLabelStyle}>Entrada (In)</div>
            <div style={{ ...costValueStyle, color: inputCost === 0 ? '#10b981' : '#0f172a' }}>
              {formatCost(inputCost, 'BRL')}
            </div>
            <div style={costSubStyle}>por 1M tokens</div>
          </div>
          <div style={costCardStyle}>
            <div style={costLabelStyle}>Saída (Out)</div>
            <div style={{ ...costValueStyle, color: outputCost === 0 ? '#10b981' : '#0f172a' }}>
              {formatCost(outputCost, 'BRL')}
            </div>
            <div style={costSubStyle}>por 1M tokens</div>
          </div>
        </div>
        {inputCost > 0 || outputCost > 0 ? (
          <div style={estimateStyle}>
            💡 <strong>Estimativa por conversa típica (1k in + 500 out):</strong>{' '}
            ≈ R$ {((1000 / 1_000_000) * inputCost + (500 / 1_000_000) * outputCost).toFixed(4)}
          </div>
        ) : (
          <div style={estimateStyle}>
            ✦ <strong>Este modelo é gratuito.</strong> Custo zero por conversa (apenas eventual rate limit do provider).
          </div>
        )}
      </div>

      {source === 'none' && (
        <div style={emptyStateStyle}>
          <strong>Nenhuma configuração ativa.</strong> Defina um provedor de LLM no formulário abaixo.
        </div>
      )}
    </div>
  )
}

// ── Sub-componentes ──────────────────────────────────────────────────────────

function Field({ label, icon, value, subValue, hint, mono }: {
  label: string
  icon: React.ReactNode
  value: string
  subValue?: string
  hint?: React.ReactNode
  mono?: boolean
}) {
  return (
    <div style={fieldStyle}>
      <div style={fieldLabelStyle}>
        {icon}
        <span>{label}</span>
        {hint}
      </div>
      <div style={{
        ...fieldValueStyle,
        fontFamily: mono ? 'ui-monospace, monospace' : 'inherit',
      }}>
        {value}
      </div>
      {subValue && <div style={fieldSubStyle}>{subValue}</div>}
    </div>
  )
}

function Badge({ label, bg, color }: { label: string; bg: string; color: string }) {
  return (
    <span style={{
      fontSize: 10,
      padding: '2px 6px',
      borderRadius: 10,
      background: bg,
      color: color,
      fontWeight: 600,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  )
}

function ScoreCard({ label, icon, score }: {
  label: string
  icon: React.ReactNode
  score: number
}) {
  const c = scoreColor(score)
  return (
    <div style={scoreCardStyle}>
      <div style={scoreCardHeaderStyle}>
        {icon}
        <span style={scoreCardLabelStyle}>{label}</span>
      </div>
      <div style={{
        ...scoreCardValueStyle,
        background: c.bg,
        color: c.text,
      }}>
        {score}
        <span style={scoreCardMaxStyle}>/100</span>
      </div>
    </div>
  )
}

// ── Styles ───────────────────────────────────────────────────────────────────

const wrapStyle: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: 10,
  padding: 0,
  overflow: 'hidden',
  marginBottom: 12,
}

const headerStyle: React.CSSProperties = {
  padding: '10px 12px',
  background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
  borderBottom: '1px solid',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
}

const sourceIconStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 4,
  borderRadius: 6,
  width: 24,
  height: 24,
}

const idGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 1,
  background: '#e5e7eb',
}

const configsGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '2fr 1fr 1fr',
  gap: 1,
  background: '#e5e7eb',
  borderTop: '1px solid #e5e7eb',
}

const fieldStyle: React.CSSProperties = {
  background: '#ffffff',
  padding: '8px 10px',
}

const fieldLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  fontSize: 10,
  fontWeight: 600,
  color: '#6b7280',
  textTransform: 'uppercase',
  letterSpacing: 0.3,
  marginBottom: 3,
}

const fieldValueStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: '#0f172a',
  wordBreak: 'break-all',
}

const fieldSubStyle: React.CSSProperties = {
  fontSize: 9,
  color: '#9ca3af',
  marginTop: 2,
}

const profileSectionStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderTop: '1px solid #e5e7eb',
  background: '#fafbfc',
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: '#374151',
  marginBottom: 6,
}

const badgesRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 4,
  marginBottom: 8,
}

const contextRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
}

const scoresSectionStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderTop: '1px solid #e5e7eb',
}

const scoresGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: 6,
  marginBottom: 8,
}

const scoreCardStyle: React.CSSProperties = {
  background: '#f8fafc',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  padding: 6,
  textAlign: 'center',
}

const scoreCardHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 3,
  marginBottom: 4,
}

const scoreCardLabelStyle: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 600,
  color: '#6b7280',
  textTransform: 'uppercase',
  letterSpacing: 0.3,
}

const scoreCardValueStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  padding: '2px 6px',
  borderRadius: 4,
  display: 'inline-block',
  minWidth: 48,
}

const scoreCardMaxStyle: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 500,
  opacity: 0.7,
  marginLeft: 2,
}

const bestForStyle: React.CSSProperties = {
  padding: '6px 0',
  borderTop: '1px dashed #e5e7eb',
}

const pricingSectionStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderTop: '1px solid #e5e7eb',
  background: '#fafbfc',
}

const pricingGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 6,
  marginTop: 4,
}

const costCardStyle: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  padding: 8,
  textAlign: 'center',
}

const costLabelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: '#6b7280',
  textTransform: 'uppercase',
  letterSpacing: 0.3,
}

const costValueStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  marginTop: 2,
  fontFamily: 'ui-monospace, monospace',
}

const costSubStyle: React.CSSProperties = {
  fontSize: 9,
  color: '#6b7280',
  marginTop: 1,
}

const estimateStyle: React.CSSProperties = {
  fontSize: 10,
  color: '#374151',
  marginTop: 6,
  padding: '4px 6px',
  background: 'rgba(99, 102, 241, 0.06)',
  borderRadius: 4,
  border: '1px solid rgba(99, 102, 241, 0.15)',
}

const emptyStateStyle: React.CSSProperties = {
  padding: 10,
  background: 'rgba(220, 38, 38, 0.06)',
  color: '#991b1b',
  fontSize: 11,
  textAlign: 'center',
  borderTop: '1px solid rgba(220, 38, 38, 0.20)',
}
