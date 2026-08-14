/**
 * LegalTaxonomyConfig — mapa editável de tipos jurídicos.
 *
 * O admin mapeia os "tipos possíveis" que orientam o agente de acervo na
 * classificação: Tipos de Documento, Áreas do Direito e Assuntos/Temas.
 */
import { useEffect, useState, type KeyboardEvent } from 'react'
import { Save, Loader2, CheckCircle2, AlertCircle, Plus, X } from 'lucide-react'
import { api } from '@/lib/api'

interface Taxonomy {
  tiposDocumento: string[]
  areasDireito: string[]
  assuntos: string[]
}

const EMPTY: Taxonomy = { tiposDocumento: [], areasDireito: [], assuntos: [] }

export function LegalTaxonomyConfig() {
  const [tax, setTax] = useState<Taxonomy>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { void load() }, [])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const r = await api.adminGetLegalTaxonomy()
      const d = (r.data as any) || {}
      setTax({
        tiposDocumento: d.tiposDocumento ?? [],
        areasDireito: d.areasDireito ?? [],
        assuntos: d.assuntos ?? [],
      })
    } catch (err: any) {
      setError(err?.message || 'Erro ao carregar')
    } finally {
      setLoading(false)
    }
  }

  async function save() {
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const r = await api.adminSaveLegalTaxonomy(tax)
      const d = (r.data as any) || {}
      setTax({
        tiposDocumento: d.tiposDocumento ?? tax.tiposDocumento,
        areasDireito: d.areasDireito ?? tax.areasDireito,
        assuntos: d.assuntos ?? tax.assuntos,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err: any) {
      setError(err?.message || 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  function setList(key: keyof Taxonomy, list: string[]) {
    setTax((t) => ({ ...t, [key]: list }))
  }

  if (loading) {
    return <div style={{ padding: 24, color: '#6b7280' }}><Loader2 size={20} className="cofrito-spin" /> Carregando...</div>
  }

  return (
    <div>
      <p style={introStyle}>
        Este é o vocabulário que orienta o <strong>Criador de Acervo</strong> ao classificar
        cada documento. O agente prefere estes termos, mas pode criar novos quando o caso exigir.
        As 6 <em>naturezas</em> (consultivo/executório/…) são fixas.
      </p>

      <ChipEditor
        title="Tipos de Documento"
        hint="Parecer, Sentença, TAC, Contrato…"
        list={tax.tiposDocumento}
        onChange={(l) => setList('tiposDocumento', l)}
      />
      <ChipEditor
        title="Áreas do Direito"
        hint="Administrativo, Penal, Ambiental…"
        list={tax.areasDireito}
        onChange={(l) => setList('areasDireito', l)}
      />
      <ChipEditor
        title="Assuntos / Temas"
        hint="Nepotismo, Licitação, Improbidade…"
        list={tax.assuntos}
        onChange={(l) => setList('assuntos', l)}
      />

      <div style={saveBarStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {error && <span style={{ color: '#dc2626', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}><AlertCircle size={14} /> {error}</span>}
          {saved && <span style={{ color: '#16a34a', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle2 size={14} /> Salvo!</span>}
        </div>
        <button onClick={save} disabled={saving} style={saveBtnStyle}>
          {saving ? <Loader2 size={14} className="cofrito-spin" /> : <Save size={14} />}
          Salvar taxonomia
        </button>
      </div>
    </div>
  )
}

function ChipEditor({ title, hint, list, onChange }: {
  title: string; hint: string; list: string[]; onChange: (l: string[]) => void
}) {
  const [input, setInput] = useState('')

  function add() {
    const v = input.trim()
    if (!v) return
    if (list.some((x) => x.toLowerCase() === v.toLowerCase())) { setInput(''); return }
    onChange([...list, v])
    setInput('')
  }
  function remove(idx: number) {
    onChange(list.filter((_, i) => i !== idx))
  }
  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); add() }
  }

  return (
    <div style={sectionStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h3 style={sectionTitleStyle}>{title} <span style={{ color: '#9ca3af', fontWeight: 400 }}>({list.length})</span></h3>
        <span style={{ fontSize: 11, color: '#9ca3af' }}>{hint}</span>
      </div>
      <div style={chipsWrapStyle}>
        {list.map((item, idx) => (
          <span key={`${item}-${idx}`} style={chipStyle}>
            {item}
            <button onClick={() => remove(idx)} style={chipRemoveStyle} title="Remover" aria-label={`Remover ${item}`}>
              <X size={12} />
            </button>
          </span>
        ))}
        {list.length === 0 && <span style={{ fontSize: 12, color: '#9ca3af' }}>Lista vazia.</span>}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          placeholder="Adicionar termo e Enter"
          style={inputStyle}
        />
        <button onClick={add} style={addBtnStyle}><Plus size={14} /> Adicionar</button>
      </div>
    </div>
  )
}

const introStyle: React.CSSProperties = {
  fontSize: 13, color: '#374151', lineHeight: 1.6, margin: '0 0 16px',
  padding: 12, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8,
}
const sectionStyle: React.CSSProperties = {
  background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 14, marginBottom: 14,
}
const sectionTitleStyle: React.CSSProperties = { fontSize: 14, fontWeight: 600, color: '#0f172a', margin: '0 0 10px' }
const chipsWrapStyle: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 6 }
const chipStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, background: '#eef2ff', color: '#1a4d8f',
  border: '1px solid #c7d2fe', borderRadius: 999, padding: '3px 6px 3px 10px', fontSize: 12,
}
const chipRemoveStyle: React.CSSProperties = {
  background: 'transparent', border: 'none', color: '#1a4d8f', cursor: 'pointer', display: 'flex',
  padding: 2, borderRadius: 999,
}
const inputStyle: React.CSSProperties = {
  flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13,
  fontFamily: 'inherit', background: '#ffffff', boxSizing: 'border-box', outline: 'none',
}
const addBtnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, background: '#eef2ff', color: '#1a4d8f',
  border: '1px solid #c7d2fe', borderRadius: 6, padding: '6px 12px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
}
const saveBarStyle: React.CSSProperties = {
  position: 'sticky', bottom: 0, background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8,
  padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8,
}
const saveBtnStyle: React.CSSProperties = {
  background: '#1a4d8f', color: '#ffffff', border: 'none', borderRadius: 6, padding: '8px 16px',
  fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6,
}
