/**
 * ModelSelectorTable — seletor de modelo de LLM com Tabela Rica.
 *
 * Inspirado no padrão do Lexio (ModelCatalogCard):
 *  - Tabela com colunas: Modelo | Tier | Capacidades | Contexto | Custo In | Custo Out | Melhor para
 *  - Cada modelo tem 4 notas (0-10) em agentFit: Extração, Síntese, Raciocínio, Redação
 *  - Notas NORMALIZADAS por provider (top do provider = 10, pior = 1)
 *  - Custos exibidos em R$ (BRL) com taxa de referência
 *  - Badges: ✦ GRÁTIS, TIER (Rápido/Equilibrado/Premium), capabilities (📝 🖼 🎵 🎬)
 *  - Filtros: busca, tier, capabilities, preço (grátis/pago)
 *  - Ordenação por qualquer coluna (custo in, custo out, qualquer score, contexto, melhor score)
 *  - "Melhor para" mostra a categoria top (Extração/Síntese/Raciocínio/Redação) com ícone + cor
 *
 * Props:
 *  - models: EnrichedModel[]   — modelos a exibir (já enriquecidos)
 *  - selectedId?: string       — modelo pré-selecionado
 *  - onSelect: (model) => void — callback ao clicar
 *  - showProvider?: boolean    — mostra coluna de provider (default: true)
 *  - maxHeight?: number        — altura máxima da tabela (px, default 420)
 *  - compact?: boolean         — modo compacto (tabela mais densa)
 */

import { useState, useMemo } from 'react'
import { Search, ChevronUp, ChevronDown, Sparkles, Zap, Brain, FileText, X } from 'lucide-react'
import {
  AGENT_CATEGORY_LABELS,
  AGENT_CATEGORY_COLORS,
  MODEL_ROLE_LABELS,
  MODEL_ROLE_COLORS,
  CAPABILITY_LABELS,
  formatContext,
  scoreColor,
  type EnrichedModel,
} from '@/lib/model-scoring'
import { formatCost } from '@/lib/currency-utils'
import type { AgentCategory, ModelCapability } from '@/types'

type SortKey =
  | 'name' | 'tier' | 'context' | 'inputCost' | 'outputCost'
  | 'extraction' | 'synthesis' | 'reasoning' | 'writing' | 'topScore'

interface ModelSelectorTableProps {
  models: EnrichedModel[]
  selectedId?: string
  onSelect: (model: EnrichedModel) => void
  showProvider?: boolean
  maxHeight?: number
  compact?: boolean
}

const TIER_LABELS: Record<'fast' | 'balanced' | 'premium', string> = {
  fast:     'Rápido',
  balanced: 'Equilibrado',
  premium:  'Premium',
}
const TIER_COLORS: Record<'fast' | 'balanced' | 'premium', { bg: string; text: string }> = {
  fast:     { bg: 'rgba(16, 185, 129, 0.15)', text: '#065f46' },
  balanced: { bg: 'rgba(139, 92, 246, 0.15)', text: '#5b21b6' },
  premium:  { bg: 'rgba(245, 158, 11, 0.15)', text: '#92400e' },
}

const CATEGORY_ICONS_MAP: Record<AgentCategory, React.ElementType> = {
  extraction: Zap,
  synthesis:  Sparkles,
  reasoning:  Brain,
  writing:    FileText,
}

export function ModelSelectorTable({
  models,
  selectedId,
  onSelect,
  showProvider = true,
  maxHeight = 460,
  compact = false,
}: ModelSelectorTableProps) {
  const [search, setSearch] = useState('')
  const [tierFilter, setTierFilter] = useState<'all' | 'fast' | 'balanced' | 'premium'>('all')
  const [priceFilter, setPriceFilter] = useState<'all' | 'free' | 'paid'>('all')
  const [capFilter, setCapFilter] = useState<'all' | ModelCapability>('all')
  const [sortKey, setSortKey] = useState<SortKey>('topScore')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // Estatísticas dos filtros
  const stats = useMemo(() => {
    const total = models.length
    const free = models.filter((m) => m.isFree).length
    const premium = models.filter((m) => m.tier === 'premium').length
    const fast = models.filter((m) => m.tier === 'fast').length
    const multimodal = models.filter((m) => (m.capabilities ?? []).some((c) => c !== 'text')).length
    return { total, free, premium, fast, multimodal }
  }, [models])

  // Filtragem
  const filtered = useMemo(() => {
    let list = [...models]
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((m) =>
        m.id.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q) ||
        (m.description ?? '').toLowerCase().includes(q) ||
        m.provider.toLowerCase().includes(q),
      )
    }
    if (tierFilter !== 'all') list = list.filter((m) => m.tier === tierFilter)
    if (priceFilter === 'free') list = list.filter((m) => m.isFree)
    if (priceFilter === 'paid') list = list.filter((m) => !m.isFree)
    if (capFilter !== 'all') list = list.filter((m) => (m.capabilities ?? []).includes(capFilter))
    return list
  }, [models, search, tierFilter, priceFilter, capFilter])

  // Ordenação
  const sorted = useMemo(() => {
    const arr = [...filtered]
    arr.sort((a, b) => {
      let va: number | string = 0
      let vb: number | string = 0
      switch (sortKey) {
        case 'name':       va = a.name.toLowerCase(); vb = b.name.toLowerCase(); break
        case 'tier': {
          const order = { fast: 0, balanced: 1, premium: 2 }
          va = order[a.tier ?? 'balanced']
          vb = order[b.tier ?? 'balanced']
          break
        }
        case 'context':    va = a.contextWindow ?? 0; vb = b.contextWindow ?? 0; break
        case 'inputCost':  va = a.inputCost ?? 0; vb = b.inputCost ?? 0; break
        case 'outputCost': va = a.outputCost ?? 0; vb = b.outputCost ?? 0; break
        case 'extraction': va = a.agentFit?.extraction ?? 0; vb = b.agentFit?.extraction ?? 0; break
        case 'synthesis':  va = a.agentFit?.synthesis ?? 0; vb = b.agentFit?.synthesis ?? 0; break
        case 'reasoning':  va = a.agentFit?.reasoning ?? 0; vb = b.agentFit?.reasoning ?? 0; break
        case 'writing':    va = a.agentFit?.writing ?? 0; vb = b.agentFit?.writing ?? 0; break
        case 'topScore': {
          const ta = Math.max(a.agentFit?.extraction ?? 0, a.agentFit?.synthesis ?? 0, a.agentFit?.reasoning ?? 0, a.agentFit?.writing ?? 0)
          const tb = Math.max(b.agentFit?.extraction ?? 0, b.agentFit?.synthesis ?? 0, b.agentFit?.reasoning ?? 0, b.agentFit?.writing ?? 0)
          va = ta; vb = tb
          break
        }
      }
      if (typeof va === 'string' && typeof vb === 'string') {
        return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
      }
      return sortDir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number)
    })
    return arr
  }, [filtered, sortKey, sortDir])

  function toggleSort(k: SortKey) {
    if (sortKey === k) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(k)
      setSortDir('desc')
    }
  }

  function SortHeader({ k, children, align = 'center' }: { k: SortKey; children: React.ReactNode; align?: 'left' | 'center' | 'right' }) {
    const isActive = sortKey === k
    return (
      <button
        type="button"
        onClick={() => toggleSort(k)}
        style={{
          background: 'transparent',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 2,
          font: 'inherit',
          color: isActive ? '#1a4d8f' : 'inherit',
          fontWeight: isActive ? 700 : 600,
          justifyContent: align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center',
          width: '100%',
        }}
        title={`Ordenar por ${typeof children === 'string' ? children : ''}`}
      >
        {children}
        {isActive ? (sortDir === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />) : null}
      </button>
    )
  }

  return (
    <div style={wrapStyle}>
      {/* ── Toolbar ─────────────────────────────────────────── */}
      <div style={toolbarStyle}>
        <div style={searchWrapStyle}>
          <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, descrição ou id..."
            style={searchInputStyle}
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} style={searchClearStyle} title="Limpar busca">
              <X size={11} />
            </button>
          )}
        </div>
      </div>

      {/* ── Filtros ─────────────────────────────────────────── */}
      <div style={filterRowStyle}>
        <FilterPills
          label="Tier"
          value={tierFilter}
          onChange={(v) => setTierFilter(v as 'all' | 'fast' | 'balanced' | 'premium')}
          options={[
            { value: 'all', label: 'Todos' },
            { value: 'fast', label: 'Rápido' },
            { value: 'balanced', label: 'Equilibrado' },
            { value: 'premium', label: 'Premium' },
          ]}
        />
        <FilterPills
          label="Preço"
          value={priceFilter}
          onChange={(v) => setPriceFilter(v as 'all' | 'free' | 'paid')}
          options={[
            { value: 'all', label: 'Todos' },
            { value: 'free', label: '✦ Grátis' },
            { value: 'paid', label: '💰 Pago' },
          ]}
        />
        <FilterPills
          label="Capacidades"
          value={capFilter}
          onChange={(v) => setCapFilter(v as 'all' | ModelCapability)}
          options={[
            { value: 'all', label: 'Todas' },
            { value: 'text', label: '📝 Texto' },
            { value: 'image', label: '🖼 Imagem' },
            { value: 'audio', label: '🎵 Áudio' },
            { value: 'video', label: '🎬 Vídeo' },
          ]}
        />
      </div>

      {/* ── Estatísticas ────────────────────────────────────── */}
      <div style={statsRowStyle}>
        <span><strong>{stats.total}</strong> modelos</span>
        <span style={{ color: '#10b981' }}>✦ {stats.free} grátis</span>
        <span style={{ color: '#f59e0b' }}>⭐ {stats.premium} premium</span>
        <span style={{ color: '#10b981' }}>⚡ {stats.fast} rápidos</span>
        <span style={{ color: '#ec4899' }}>🎬 {stats.multimodal} multimodais</span>
        {filtered.length !== models.length && (
          <span style={{ color: '#6b7280' }}>· mostrando {filtered.length}</span>
        )}
      </div>

      {/* ── Tabela ──────────────────────────────────────────── */}
      <div style={{ ...tableWrapStyle, maxHeight }}>
        <table style={tableStyle}>
          <thead>
            <tr style={theadRowStyle}>
              <th style={{ ...thStyle, textAlign: 'left', minWidth: 180 }}><SortHeader k="name" align="left">Modelo</SortHeader></th>
              {showProvider && <th style={{ ...thStyle, textAlign: 'left' }}>Provider</th>}
              <th style={thStyle}><SortHeader k="tier">Tier</SortHeader></th>
              <th style={thStyle}><SortHeader k="extraction" align="center">Ex</SortHeader></th>
              <th style={thStyle}><SortHeader k="synthesis">Sí</SortHeader></th>
              <th style={thStyle}><SortHeader k="reasoning">Ra</SortHeader></th>
              <th style={thStyle}><SortHeader k="writing">Re</SortHeader></th>
              <th style={thStyle}><SortHeader k="topScore">Melhor para</SortHeader></th>
              <th style={thStyle}><SortHeader k="context">Contexto</SortHeader></th>
              <th style={thStyle}><SortHeader k="inputCost">In</SortHeader></th>
              <th style={thStyle}><SortHeader k="outputCost">Out</SortHeader></th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={showProvider ? 11 : 10} style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>
                  Nenhum modelo encontrado com esses filtros.
                </td>
              </tr>
            ) : (
              sorted.map((m) => {
                const isSelected = selectedId === m.id
                const tier = m.tier ?? 'balanced'
                const tierStyle = TIER_COLORS[tier]
                const roleStyle = MODEL_ROLE_COLORS[m.role]
                const topCat = getTopCategoryLocal(m)
                const TopIcon = CATEGORY_ICONS_MAP[topCat]
                return (
                  <tr
                    key={m.id}
                    onClick={() => onSelect(m)}
                    style={{
                      ...trStyle,
                      background: isSelected ? 'rgba(99, 102, 241, 0.10)' : undefined,
                      borderLeft: isSelected ? '3px solid #1a4d8f' : '3px solid transparent',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.background = 'rgba(15, 23, 42, 0.04)'
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.background = ''
                    }}
                  >
                    {/* Modelo */}
                    <td style={{ ...tdStyle, textAlign: 'left' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, fontSize: 12, color: '#0f172a' }}>{m.name}</span>
                        {m.isFree && <span style={freeBadgeStyle}>✦ GRÁTIS</span>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2, flexWrap: 'wrap' }}>
                        {(m.capabilities ?? []).map((c) => {
                          const info = CAPABILITY_LABELS[c]
                          return (
                            <span key={c} style={{ ...capBadgeStyle, color: info.color, background: `${info.color}1a` }}>
                              {info.icon} {info.label}
                            </span>
                          )
                        })}
                        <span style={modelIdStyle} title={m.id}>{m.id}</span>
                      </div>
                      {m.description && !compact && (
                        <div style={descStyle}>{m.description}</div>
                      )}
                    </td>
                    {/* Provider */}
                    {showProvider && (
                      <td style={{ ...tdStyle, textAlign: 'left' }}>
                        <span style={providerBadgeStyle}>{m.provider}</span>
                        <div style={roleBadgeStyle}>
                          <span style={{
                            ...roleInnerStyle,
                            background: roleStyle.bg,
                            color: roleStyle.text,
                          }}>{MODEL_ROLE_LABELS[m.role]}</span>
                        </div>
                      </td>
                    )}
                    {/* Tier */}
                    <td style={tdStyle}>
                      <span style={{ ...tierBadgeStyle, background: tierStyle.bg, color: tierStyle.text }}>
                        {TIER_LABELS[tier]}
                      </span>
                    </td>
                    {/* Scores */}
                    <td style={tdStyle}><ScoreBadge score={m.agentFit?.extraction ?? 0} label="Ex" /></td>
                    <td style={tdStyle}><ScoreBadge score={m.agentFit?.synthesis ?? 0} label="Sí" /></td>
                    <td style={tdStyle}><ScoreBadge score={m.agentFit?.reasoning ?? 0} label="Ra" /></td>
                    <td style={tdStyle}><ScoreBadge score={m.agentFit?.writing ?? 0} label="Re" /></td>
                    {/* Melhor para */}
                    <td style={tdStyle}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600, color: AGENT_CATEGORY_COLORS[topCat] }}>
                        <TopIcon size={11} />
                        {AGENT_CATEGORY_LABELS[topCat]}
                      </div>
                      <div style={{ fontSize: 9, color: '#6b7280', marginTop: 1 }}>{topCat === 'extraction' ? 'Triagem' : topCat === 'synthesis' ? 'Compilador' : topCat === 'reasoning' ? 'Jurista' : 'Redator'}</div>
                    </td>
                    {/* Contexto */}
                    <td style={tdStyle}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#0f172a', fontFamily: 'ui-monospace, monospace' }}>{formatContext(m.contextWindow)}</div>
                      <div style={{ fontSize: 9, color: '#6b7280' }}>tokens</div>
                    </td>
                    {/* Custo In */}
                    <td style={tdStyle}>
                      <CostCell cost={m.inputCost ?? 0} />
                    </td>
                    {/* Custo Out */}
                    <td style={tdStyle}>
                      <CostCell cost={m.outputCost ?? 0} />
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Legenda de cores dos scores */}
      <div style={legendStyle}>
        <span style={{ fontSize: 10, color: '#6b7280' }}>Notas (0-10, normalizadas por provider):</span>
        <LegendDot color={scoreColor(10)} label="9-10 melhor" />
        <LegendDot color={scoreColor(8)} label="7-8 ótimo" />
        <LegendDot color={scoreColor(6)} label="5-6 bom" />
        <LegendDot color={scoreColor(4)} label="3-4 fraco" />
        <LegendDot color={scoreColor(2)} label="1-2 ruim" />
        <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 'auto' }}>
          Ex=Extração · Sí=Síntese · Ra=Raciocínio · Re=Redação
        </span>
      </div>
    </div>
  )
}

// ── Sub-componentes ──────────────────────────────────────────────────────────

function ScoreBadge({ score, label }: { score: number; label: string }) {
  const c = scoreColor(score)
  return (
    <div
      title={`${label}: ${score}/10`}
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '2px 6px',
        borderRadius: 4,
        background: c.bg,
        color: c.text,
        minWidth: 32,
      }}
    >
      <span style={{ fontWeight: 700, fontSize: 11, lineHeight: 1 }}>{score}</span>
      <span style={{ fontSize: 8, opacity: 0.7, lineHeight: 1, marginTop: 1 }}>{label}</span>
    </div>
  )
}

function CostCell({ cost }: { cost: number }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 600, color: cost === 0 ? '#10b981' : '#0f172a' }}>
      {formatCost(cost, 'BRL')}
    </div>
  )
}

function FilterPills<T extends string>({ label, value, onChange, options }: {
  label: string
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <div style={filterGroupStyle}>
      <span style={filterLabelStyle}>{label}:</span>
      <div style={filterPillsStyle}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            style={{
              ...filterPillStyle,
              background: value === o.value ? '#1a4d8f' : '#ffffff',
              color: value === o.value ? '#ffffff' : '#374151',
              borderColor: value === o.value ? '#1a4d8f' : '#d1d5db',
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function LegendDot({ color, label }: { color: { bg: string; text: string }; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, color: '#6b7280' }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: color.bg, display: 'inline-block' }} />
      {label}
    </span>
  )
}

function getTopCategoryLocal(m: EnrichedModel): AgentCategory {
  const f = m.agentFit ?? { extraction: 0, synthesis: 0, reasoning: 0, writing: 0 }
  let best: AgentCategory = 'extraction'
  let bestScore = -1
  ;(['extraction', 'synthesis', 'reasoning', 'writing'] as AgentCategory[]).forEach((c) => {
    if (f[c] > bestScore) {
      bestScore = f[c]
      best = c
    }
  })
  return best
}

// ── Styles ───────────────────────────────────────────────────────────────────

const wrapStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  width: '100%',
}

const toolbarStyle: React.CSSProperties = {
  display: 'flex',
  gap: 6,
}

const searchWrapStyle: React.CSSProperties = {
  position: 'relative',
  flex: 1,
}

const searchInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 26px 6px 26px',
  fontSize: 12,
  border: '1px solid #d1d5db',
  borderRadius: 6,
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
}

const searchClearStyle: React.CSSProperties = {
  position: 'absolute',
  right: 4,
  top: '50%',
  transform: 'translateY(-50%)',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  padding: 4,
  color: '#6b7280',
  display: 'flex',
}

const filterRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 12,
  flexWrap: 'wrap',
  alignItems: 'center',
}

const filterGroupStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
}

const filterLabelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: '#6b7280',
  textTransform: 'uppercase',
  letterSpacing: 0.3,
}

const filterPillsStyle: React.CSSProperties = {
  display: 'flex',
  gap: 2,
  background: '#f1f5f9',
  padding: 2,
  borderRadius: 6,
}

const filterPillStyle: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #d1d5db',
  borderRadius: 4,
  padding: '3px 8px',
  fontSize: 10,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
  whiteSpace: 'nowrap',
}

const statsRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 12,
  flexWrap: 'wrap',
  fontSize: 10,
  color: '#374151',
  padding: '4px 0',
  borderTop: '1px solid #e5e7eb',
  borderBottom: '1px solid #e5e7eb',
}

const tableWrapStyle: React.CSSProperties = {
  overflow: 'auto',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  background: '#ffffff',
}

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 11,
  fontFamily: 'inherit',
}

const theadRowStyle: React.CSSProperties = {
  background: '#f8fafc',
  borderBottom: '1px solid #e5e7eb',
  position: 'sticky',
  top: 0,
  zIndex: 1,
}

const thStyle: React.CSSProperties = {
  padding: '6px 4px',
  fontSize: 10,
  fontWeight: 600,
  color: '#6b7280',
  textTransform: 'uppercase',
  letterSpacing: 0.3,
  textAlign: 'center',
  whiteSpace: 'nowrap',
}

const trStyle: React.CSSProperties = {
  borderBottom: '1px solid #f1f5f9',
  transition: 'background 0.1s',
}

const tdStyle: React.CSSProperties = {
  padding: '8px 4px',
  verticalAlign: 'top',
  textAlign: 'center',
}

const freeBadgeStyle: React.CSSProperties = {
  fontSize: 8,
  padding: '1px 5px',
  borderRadius: 8,
  background: 'rgba(16, 185, 129, 0.20)',
  color: '#065f46',
  fontWeight: 700,
  whiteSpace: 'nowrap',
}

const capBadgeStyle: React.CSSProperties = {
  fontSize: 8,
  padding: '1px 4px',
  borderRadius: 4,
  fontWeight: 600,
  whiteSpace: 'nowrap',
}

const modelIdStyle: React.CSSProperties = {
  fontSize: 9,
  fontFamily: 'ui-monospace, monospace',
  color: '#9ca3af',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  maxWidth: 140,
}

const descStyle: React.CSSProperties = {
  fontSize: 10,
  color: '#6b7280',
  marginTop: 2,
  lineHeight: 1.3,
  maxWidth: 240,
}

const providerBadgeStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: '#0f172a',
}

const roleBadgeStyle: React.CSSProperties = {
  marginTop: 2,
}

const roleInnerStyle: React.CSSProperties = {
  fontSize: 8,
  padding: '1px 5px',
  borderRadius: 8,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: 0.3,
}

const tierBadgeStyle: React.CSSProperties = {
  fontSize: 10,
  padding: '2px 6px',
  borderRadius: 8,
  fontWeight: 600,
  whiteSpace: 'nowrap',
}

const legendStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '4px 0',
  flexWrap: 'wrap',
}
