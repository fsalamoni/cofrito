/**
 * DocumentCatalog — planilha + viewer + upload do acervo.
 *
 * Substitui o DocumentUpload (que era so upload) por uma pagina completa:
 *  - Upload (mantem UX drag-and-drop do DocumentUpload)
 *  - Planilha com todos os docs do acervo (colunas enxutas)
 *  - Click no doc: abre viewer com 3 abas
 *     1. INFO: fileName, storagePath, metadata, status, etc
 *     2. JSON: textContent (JSON estruturado v1) com formatacao pretty
 *     3. ANALISE: classification, ementa, keyPoints (vindos da Fase 2b)
 *  - Acoes: delete, re-analisar
 *
 * Documentos sao do acervo V1 (Fase 2a/2b): corpus/uploaded/{docId}
 */
import { useState, useEffect, useRef, type DragEvent, type ChangeEvent } from 'react'
import {
  Upload, FileText, X, Check, Loader2, AlertCircle, Trash2, RefreshCw,
  Eye, Search, Filter, ChevronLeft, ChevronRight, X as CloseIcon,
} from 'lucide-react'
import { api } from '@/lib/api'

// ── Tipos ──────────────────────────────────────────────────────────────

interface UploadItem {
  id: string
  file: File
  status: 'pending' | 'uploading' | 'done' | 'error'
  progress: number
  error?: string
  docId?: string
}

interface DocumentListItem {
  id: string
  fileName?: string
  title?: string
  type?: string
  area?: string[]
  tags?: string[]
  status?: string
  storageSize?: number
  originalSize?: number
  compressedSize?: number
  compressionGain?: string
  format?: string
  pages?: number
  paragraphs?: number
  compressionRatio?: number
  classification?: {
    natureza?: string
    areaDireito?: string[]
    assuntos?: string[]
    tipoDocumento?: string
    contexto?: string[]
  } | null
  ementa?: {
    tipo?: string
    tipoDocumento?: string
    assunto?: string
    sintese?: string
    /** Fundamentação jurídica principal (tese, ratio) — para documentos jurídicos */
    fundamentacao?: string
    areas?: string[]
    topicos?: string[]
    conclusao?: string
    keywords?: string[]
  } | null
  keyPoints?: {
    items?: string[]
    reusableContent?: string
  } | null
  analyzedAt?: string
  analysisError?: string
  createdAt?: string
  updatedAt?: string
  createdBy?: string
}

const ACCEPTED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
  'text/markdown',
  'text/html',
  'application/rtf',
]
const ACCEPTED_EXT = ['.pdf', '.docx', '.doc', '.txt', '.md', '.markdown', '.html', '.rtf']


// ── Componente principal ───────────────────────────────────────────────

export function DocumentCatalog() {
  // Upload state
  const [items, setItems] = useState<UploadItem[]>([])
  const [dragging, setDragging] = useState(false)
  const [defaultType, setDefaultType] = useState('ato')
  const [defaultArea, setDefaultArea] = useState('geral')
  const [defaultTags, setDefaultTags] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Lista state
  const [docs, setDocs] = useState<DocumentListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState<number>(20)
  const [savingPageSize, setSavingPageSize] = useState(false)
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set())
  const [reanalyzingBatch, setReanalyzingBatch] = useState(false)

  // Viewer state
  const [selected, setSelected] = useState<DocumentListItem | null>(null)
  const [viewerTab, setViewerTab] = useState<'info' | 'json' | 'analise'>('info')
  const [fullDoc, setFullDoc] = useState<any>(null)
  const [loadingFull, setLoadingFull] = useState(false)

  useEffect(() => {
    loadDocs()
    void loadPageSize()
  }, [])

  async function loadPageSize() {
    try {
      const r = await api.adminGetPageSize()
      const size = (r.data as { pageSize: number }).pageSize
      if (size && [20, 50, 100].includes(size)) setPageSize(size)
    } catch (err) {
      console.warn('Falha ao carregar pageSize, usando default 20', err)
    }
  }

  async function changePageSize(size: number) {
    setSavingPageSize(true)
    try {
      await api.adminSetPageSize(size)
      setPageSize(size)
      setPage(0)
    } catch (err: any) {
      alert('Erro ao salvar page size: ' + (err.message || 'desconhecido'))
    } finally {
      setSavingPageSize(false)
    }
  }

  async function loadDocs() {
    setLoading(true)
    try {
      const r = await api.adminListDocuments()
      setDocs((r.data as DocumentListItem[]) || [])
    } catch (err: any) {
      console.error('Erro ao listar docs:', err)
    } finally {
      setLoading(false)
    }
  }

  // ── Upload (do DocumentUpload original) ─────────────────────────────

  function addFiles(files: FileList | File[]) {
    const arr = Array.from(files)
    const newItems: UploadItem[] = arr
      .filter((f) => {
        const ext = '.' + (f.name.split('.').pop() || '').toLowerCase()
        return ACCEPTED_TYPES.includes(f.type) || ACCEPTED_EXT.includes(ext)
      })
      .map((f) => ({
        id: `${Date.now()}-${Math.random()}`,
        file: f,
        status: 'pending' as const,
        progress: 0,
      }))
    setItems((prev) => [...prev, ...newItems])
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
    if (e.dataTransfer.files) addFiles(e.dataTransfer.files)
  }

  function handleSelect(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files) addFiles(e.target.files)
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  async function uploadItem(item: UploadItem) {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: 'uploading', progress: 30 } : i)))
    try {
      const arrayBuffer = await item.file.arrayBuffer()
      const contentBase64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ''),
      )
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, progress: 60 } : i)))
      const tags = defaultTags.split(',').map((t) => t.trim()).filter(Boolean)
      const result = await api.adminUploadDocument({
        fileName: item.file.name,
        contentBase64,
        mimeType: item.file.type || 'application/octet-stream',
        type: defaultType,
        area: [defaultArea],
        tags,
      })
      setItems((prev) => prev.map((i) =>
        i.id === item.id
          ? { ...i, status: 'done', progress: 100, docId: result.data.docId }
          : i,
      ))
      // Recarregar lista
      void loadDocs()
    } catch (err: any) {
      setItems((prev) => prev.map((i) =>
        i.id === item.id
          ? { ...i, status: 'error', error: err.message ?? 'Erro no upload' }
          : i,
      ))
    }
  }

  async function uploadAll() {
    const pending = items.filter((i) => i.status === 'pending')
    for (const item of pending) {
      await uploadItem(item)
    }
  }

  function clearDone() {
    setItems((prev) => prev.filter((i) => i.status !== 'done' && i.status !== 'error'))
  }

  // ── Viewer ─────────────────────────────────────────────────────────

  async function openViewer(doc: DocumentListItem) {
    setSelected(doc)
    setViewerTab('info')
    setLoadingFull(true)
    try {
      const r = await api.adminGetDocument(doc.id)
      setFullDoc(r.data)
    } catch (err: any) {
      console.error('Erro ao carregar doc:', err)
    } finally {
      setLoadingFull(false)
    }
  }

  function closeViewer() {
    setSelected(null)
    setFullDoc(null)
  }

  async function deleteDoc(docId: string) {
    if (!confirm('Tem certeza que deseja deletar este documento?')) return
    try {
      await api.adminDeleteDocument(docId)
      void loadDocs()
      if (selected?.id === docId) closeViewer()
    } catch (err: any) {
      alert('Erro ao deletar: ' + (err.message || 'desconhecido'))
    }
  }

  async function reanalyzeDoc(docId: string) {
    try {
      await api.adminReanalyzeDocument(docId)
      alert('Re-analise iniciada em background. A lista sera atualizada em 3s.')
      setTimeout(() => {
        void loadDocs()
        if (selected?.id === docId) void openViewer(docs.find(d => d.id === docId)!)
      }, 3000)
    } catch (err: any) {
      alert('Erro ao re-analisar: ' + (err.message || 'desconhecido'))
    }
  }

  function toggleSelectDoc(docId: string) {
    setSelectedDocIds(prev => {
      const next = new Set(prev)
      if (next.has(docId)) next.delete(docId)
      else next.add(docId)
      return next
    })
  }

  function toggleSelectAllVisible() {
    setSelectedDocIds(prev => {
      const allVisibleIds = pageItems.map(d => d.id)
      const allSelected = allVisibleIds.every(id => prev.has(id))
      if (allSelected) {
        const next = new Set(prev)
        allVisibleIds.forEach(id => next.delete(id))
        return next
      } else {
        const next = new Set(prev)
        allVisibleIds.forEach(id => next.add(id))
        return next
      }
    })
  }

  function clearSelection() {
    setSelectedDocIds(new Set())
  }

  async function reanalyzeBatch(payload: { docIds?: string[]; selectAll?: boolean }) {
    setReanalyzingBatch(true)
    try {
      const r = await api.adminReanalyzeBatch(payload)
      const data = r.data as { queued: number; failed: number; message: string; queuedIds: string[]; failures: { docId: string; reason: string }[] }
      let msg = data.message || `${data.queued} documento(s) enfileirado(s) para re-analise em background.`
      if (data.failed > 0) {
        msg += `\n${data.failed} falharam (sem texto ou outro erro).`
        if (data.failures && data.failures.length > 0) {
          console.warn('Re-analise failures:', data.failures)
        }
      }
      alert(msg)
      // Recarregar lista em 4s para pegar o status novo (analise_processando)
      setTimeout(() => void loadDocs(), 4000)
      // Limpar selecao se nao for selectAll
      if (!payload.selectAll) clearSelection()
    } catch (err: any) {
      alert('Erro ao re-analisar em batch: ' + (err.message || 'desconhecido'))
    } finally {
      setReanalyzingBatch(false)
    }
  }

  function onReanalyzeSelected() {
    if (selectedDocIds.size === 0) {
      alert('Selecione pelo menos 1 documento para re-analisar.')
      return
    }
    const ok = window.confirm(
      `Re-analisar ${selectedDocIds.size} documento(s)?\n\n` +
      `Ira usar o modelo LLM configurado para o acervo e gerar classification + ementa + keyPoints novamente.\n` +
      `Pode demorar alguns minutos para todos serem processados.`
    )
    if (!ok) return
    void reanalyzeBatch({ docIds: Array.from(selectedDocIds) })
  }

  function onReanalyzeAll() {
    const ok = window.confirm(
      'Re-analisar TODOS os documentos do acervo?\n\n' +
      'Esta operacao pode levar MUITO tempo dependendo do volume.\n' +
      'Recomendado apenas se voce acabou de trocar o modelo LLM ou se muitos docs estao sem analise.'
    )
    if (!ok) return
    void reanalyzeBatch({ selectAll: true })
  }

  // ── Filtros / paginacao ────────────────────────────────────────────

  const filtered = docs.filter((d) => {
    if (filterStatus !== 'all' && d.status !== filterStatus) return false
    if (search) {
      const q = search.toLowerCase()
      const matchTitle = (d.title || '').toLowerCase().includes(q)
      const matchFile = (d.fileName || '').toLowerCase().includes(q)
      const matchAssunto = (d.ementa?.assunto || '').toLowerCase().includes(q)
      const matchKeyword = d.ementa?.keywords?.some(k => k.toLowerCase().includes(q)) || false
      if (!matchTitle && !matchFile && !matchAssunto && !matchKeyword) return false
    }
    return true
  })

  const totalPages = Math.ceil(filtered.length / pageSize)
  const pageItems = filtered.slice(page * pageSize, (page + 1) * pageSize)

  // Ao mudar pageSize, voltar para primeira pagina
  useEffect(() => { setPage(0) }, [pageSize])

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div>
      {/* Upload zone */}
      <div style={defaultsBarStyle}>
        <div style={fieldGroupStyle}>
          <label style={labelStyle}>Tipo padrao</label>
          <select value={defaultType} onChange={(e) => setDefaultType(e.target.value)} style={selectStyle}>
            <option value="ato">Ato normativo</option>
            <option value="tese">Tese</option>
            <option value="parecer">Parecer</option>
            <option value="legislacao">Legislacao</option>
            <option value="manual">Manual</option>
            <option value="doutrina">Doutrina</option>
            <option value="jurisprudencia">Jurisprudencia</option>
          </select>
        </div>
        <div style={fieldGroupStyle}>
          <label style={labelStyle}>Area padrao</label>
          <select value={defaultArea} onChange={(e) => setDefaultArea(e.target.value)} style={selectStyle}>
            <option value="geral">Geral</option>
            <option value="civel">Civel</option>
            <option value="patrimonio">Patrimonio Publico</option>
            <option value="improbidade">Improbidade</option>
            <option value="consumidor">Consumidor</option>
            <option value="familia">Familia</option>
            <option value="ambiental">Ambiental</option>
          </select>
        </div>
        <div style={{ ...fieldGroupStyle, flex: 1 }}>
          <label style={labelStyle}>Tags (virgula)</label>
          <input
            type="text"
            value={defaultTags}
            onChange={(e) => setDefaultTags(e.target.value)}
            placeholder="lei-14133, licitacao"
            style={inputStyle}
          />
        </div>
      </div>

      <div
        style={dragging ? dropzoneActiveStyle : dropzoneStyle}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <Upload size={32} color="#9ca3af" />
        <div style={dropzoneTextStyle}>Arraste arquivos ou clique para selecionar</div>
        <div style={dropzoneHintStyle}>PDF, DOCX, TXT, MD, HTML, RTF</div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED_EXT.join(',')}
          onChange={handleSelect}
          style={{ display: 'none' }}
        />
      </div>

      {items.length > 0 && (
        <>
          <div style={itemsBarStyle}>
            <div style={{ fontSize: 13, color: '#374151' }}>
              {items.filter((i) => i.status === 'pending').length} pendente(s), {' '}
              {items.filter((i) => i.status === 'done').length} ok, {' '}
              {items.filter((i) => i.status === 'error').length} erro
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={uploadAll} style={uploadAllBtnStyle} disabled={!items.some((i) => i.status === 'pending')}>
                Enviar todos
              </button>
              <button onClick={clearDone} style={clearBtnStyle}>Limpar concluidos</button>
            </div>
          </div>
          <div style={itemsListStyle}>
            {items.map((item) => (
              <div key={item.id} style={itemStyle}>
                {item.status === 'done' ? <Check size={16} color="#16a34a" /> :
                 item.status === 'error' ? <AlertCircle size={16} color="#dc2626" /> :
                 item.status === 'uploading' ? <Loader2 size={16} color="#1a4d8f" className="spin" /> :
                 <FileText size={16} color="#9ca3af" />}
                <div style={{ flex: 1 }}>
                  <div style={itemNameStyle}>{item.file.name}</div>
                  <div style={itemMetaStyle}>
                    {(item.file.size / 1024).toFixed(1)} KB
                    {item.error && <span style={{ color: '#dc2626' }}> · {item.error}</span>}
                  </div>
                  {item.status === 'uploading' && (
                    <div style={progressBarBgStyle}>
                      <div style={{ ...progressBarStyle, width: `${item.progress}%` }} />
                    </div>
                  )}
                </div>
                <button onClick={() => removeItem(item.id)} style={removeBtnStyle} aria-label="Remover">
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Planilha */}
      <div style={{ marginTop: 32 }}>
        <h3 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 12 }}>
          Acervo ({docs.length} documento{docs.length !== 1 ? 's' : ''})
        </h3>

        {/* Filtros */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={16} color="#9ca3af" style={{ position: 'absolute', left: 10, top: 9 }} />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0) }}
              placeholder="Buscar por titulo, filename, assunto, keyword..."
              style={{ ...inputStyle, paddingLeft: 32 }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Filter size={14} color="#6b7280" />
            <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(0) }} style={selectStyle}>
              <option value="all">Todos os status</option>
              <option value="analisado">Analisados</option>
              <option value="analise_pendente">Analise pendente</option>
              <option value="analise_processando">Processando</option>
              <option value="erro_analise">Erro analise</option>
            </select>
          </div>
        </div>

        {/* Barra de acoes em batch */}
        <div style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          padding: '8px 12px',
          background: '#f0f9ff',
          border: '1px solid #bae6fd',
          borderRadius: 8,
          marginBottom: 12,
          flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 12, color: '#0c4a6e', fontWeight: 500 }}>
            {selectedDocIds.size > 0
              ? `${selectedDocIds.size} selecionado(s)`
              : 'Nenhum selecionado'}
          </span>
          <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexWrap: 'wrap' }}>
            {selectedDocIds.size > 0 && (
              <button onClick={clearSelection} style={clearBtnStyle}>
                Limpar seleção
              </button>
            )}
            <button
              onClick={onReanalyzeSelected}
              disabled={selectedDocIds.size === 0 || reanalyzingBatch}
              style={{
                ...uploadAllBtnStyle,
                opacity: (selectedDocIds.size === 0 || reanalyzingBatch) ? 0.5 : 1,
                cursor: (selectedDocIds.size === 0 || reanalyzingBatch) ? 'not-allowed' : 'pointer',
              }}
              title="Refazer classificação + ementa + pontos relevantes dos documentos selecionados (usa o LLM configurado)"
            >
              <RefreshCw size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
              Re-analisar selecionados
            </button>
            <button
              onClick={onReanalyzeAll}
              disabled={reanalyzingBatch}
              style={{
                ...uploadAllBtnStyle,
                background: '#ffffff',
                color: '#1a4d8f',
                border: '1px solid #1a4d8f',
                opacity: reanalyzingBatch ? 0.5 : 1,
                cursor: reanalyzingBatch ? 'not-allowed' : 'pointer',
              }}
              title="Refazer análise de TODOS os documentos ativos do acervo"
            >
              Re-analisar todos
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#6b7280' }}>
            <Loader2 size={24} className="spin" /> Carregando...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#6b7280' }}>
            Nenhum documento encontrado.
          </div>
        ) : (
          <>
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, width: 36, textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={pageItems.length > 0 && pageItems.every(d => selectedDocIds.has(d.id))}
                        onChange={toggleSelectAllVisible}
                        title="Selecionar todos os visíveis"
                        style={{ cursor: 'pointer' }}
                      />
                    </th>
                    <th style={thStyle}>Arquivo</th>
                    <th style={thStyle}>Status</th>
                    <th style={thStyle}>Tipo Doc</th>
                    <th style={thStyle}>Natureza</th>
                    <th style={thStyle}>Assunto / Ementa</th>
                    <th style={thStyle}>Pontos-chave</th>
                    <th style={thStyle}>Areas</th>
                    <th style={thStyle}>Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((d) => (
                    <tr key={d.id} style={trStyle}>
                      <td style={{ ...tdStyle, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedDocIds.has(d.id)}
                          onChange={() => toggleSelectDoc(d.id)}
                          style={{ cursor: 'pointer' }}
                        />
                      </td>
                      <td style={tdStyle} onClick={() => openViewer(d)}>
                        <div style={{ fontWeight: 500 }}>{d.title || d.fileName || d.id}</div>
                        {d.fileName && d.title && d.title !== d.fileName && (
                          <div style={{ fontSize: 11, color: '#6b7280' }}>{d.fileName}</div>
                        )}
                        <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>
                          {d.pages ? `${d.pages} pags` : '—'} · {d.compressionGain || '—'}
                        </div>
                      </td>
                      <td style={tdStyle} onClick={() => openViewer(d)}>
                        <StatusBadge status={d.status} />
                      </td>
                      <td style={tdStyle} onClick={() => openViewer(d)}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: '#0f172a' }}>
                          {d.classification?.tipoDocumento || d.ementa?.tipo || '—'}
                        </div>
                      </td>
                      <td style={tdStyle} onClick={() => openViewer(d)}>
                        <div style={{ fontSize: 12, color: '#6b7280' }}>
                          {d.classification?.natureza || '—'}
                        </div>
                      </td>
                      <td style={tdStyle} onClick={() => openViewer(d)}>
                        <div style={{ maxWidth: 280 }}>
                          <div style={{
                            fontSize: 12,
                            fontWeight: 500,
                            color: '#0f172a',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }} title={d.ementa?.assunto || ''}>
                            {d.ementa?.assunto || '—'}
                          </div>
                          {d.ementa?.sintese && (
                            <div style={{
                              fontSize: 11,
                              color: '#6b7280',
                              marginTop: 2,
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                            }} title={d.ementa.sintese}>
                              {d.ementa.sintese}
                            </div>
                          )}
                        </div>
                      </td>
                      <td style={tdStyle} onClick={() => openViewer(d)}>
                        <div style={{ maxWidth: 200 }}>
                          {d.keyPoints?.items && d.keyPoints.items.length > 0 ? (
                            <div style={{
                              fontSize: 11,
                              color: '#374151',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                            }} title={d.keyPoints.items.join(' • ')}>
                              {d.keyPoints.items.slice(0, 3).join(' • ')}
                              {d.keyPoints.items.length > 3 && ` (+${d.keyPoints.items.length - 3})`}
                            </div>
                          ) : (
                            <span style={{ fontSize: 11, color: '#9ca3af' }}>—</span>
                          )}
                        </div>
                      </td>
                      <td style={tdStyle} onClick={() => openViewer(d)}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {(d.classification?.areaDireito || d.area || []).slice(0, 2).map((a) => (
                            <span key={a} style={tagStyle}>{a}</span>
                          ))}
                          {(d.classification?.areaDireito || d.area || []).length > 2 && (
                            <span style={{ ...tagStyle, background: '#f3f4f6' }}>
                              +{(d.classification?.areaDireito || d.area || []).length - 2}
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', gap: 4 }} onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => openViewer(d)}
                            style={iconBtnStyle}
                            title="Ver detalhes"
                          >
                            <Eye size={14} />
                          </button>
                          <button
                            onClick={() => reanalyzeDoc(d.id)}
                            style={iconBtnStyle}
                            title="Re-analisar"
                          >
                            <RefreshCw size={14} />
                          </button>
                          <button
                            onClick={() => deleteDoc(d.id)}
                            style={{ ...iconBtnStyle, color: '#dc2626' }}
                            title="Deletar"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Paginacao + page size */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 12,
              flexWrap: 'wrap',
              gap: 8,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, color: '#6b7280' }}>Documentos por página:</span>
                <select
                  value={pageSize}
                  onChange={(e) => changePageSize(Number(e.target.value))}
                  disabled={savingPageSize}
                  style={{ ...selectStyle, padding: '4px 8px', fontSize: 12, opacity: savingPageSize ? 0.5 : 1 }}
                  title="Tamanho da página (configurável pelo admin)"
                >
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
              {totalPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                    style={pageBtnStyle}
                  >
                    <ChevronLeft size={16} /> Anterior
                  </button>
                  <span style={{ fontSize: 13, color: '#6b7280' }}>
                    Página {page + 1} de {totalPages}
                  </span>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    style={pageBtnStyle}
                  >
                    Próxima <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Viewer (drawer lateral) */}
      {selected && (
        <div style={drawerOverlayStyle} onClick={closeViewer}>
          <div style={drawerStyle} onClick={(e) => e.stopPropagation()}>
            <div style={drawerHeaderStyle}>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0f172a' }}>
                {selected.title || selected.fileName || selected.id}
              </h3>
              <button onClick={closeViewer} style={iconBtnStyle} aria-label="Fechar">
                <CloseIcon size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb' }}>
              {(['info', 'json', 'analise'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setViewerTab(tab)}
                  style={{
                    ...tabBtnStyle,
                    ...(viewerTab === tab ? activeTabBtnStyle : {}),
                  }}
                >
                  {tab === 'info' ? 'Info' : tab === 'json' ? 'JSON v1' : 'Analise'}
                </button>
              ))}
            </div>

            <div style={drawerBodyStyle}>
              {loadingFull ? (
                <div style={{ padding: 32, textAlign: 'center', color: '#6b7280' }}>
                  <Loader2 size={24} className="spin" /> Carregando...
                </div>
              ) : viewerTab === 'info' ? (
                <InfoTab doc={selected} full={fullDoc} />
              ) : viewerTab === 'json' ? (
                <JsonTab full={fullDoc} />
              ) : (
                <AnaliseTab doc={selected} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-componentes do viewer ──────────────────────────────────────────

function StatusBadge({ status }: { status?: string }) {
  const colors: Record<string, { bg: string; fg: string; label: string }> = {
    analisado: { bg: '#dcfce7', fg: '#166534', label: 'Analisado' },
    analise_pendente: { bg: '#fef3c7', fg: '#92400e', label: 'Pendente' },
    analise_processando: { bg: '#dbeafe', fg: '#1e40af', label: 'Processando' },
    erro_analise: { bg: '#fee2e2', fg: '#991b1b', label: 'Erro' },
    erro_ingestao: { bg: '#fee2e2', fg: '#991b1b', label: 'Erro ingestao' },
  }
  const c = colors[status || ''] || { bg: '#f3f4f6', fg: '#6b7280', label: status || '?' }
  return (
    <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 500, background: c.bg, color: c.fg }}>
      {c.label}
    </span>
  )
}

function InfoTab({ doc, full }: { doc: DocumentListItem; full: any }) {
  return (
    <div>
      <Field label="ID">{doc.id}</Field>
      <Field label="File name">{doc.fileName || '—'}</Field>
      <Field label="Titulo">{doc.title || '—'}</Field>
      <Field label="Tipo">{doc.type || '—'}</Field>
      <Field label="Status"><StatusBadge status={doc.status} /></Field>
      <Field label="Storage path">{full?.storagePath || '—'}</Field>
      <Field label="Formato">{doc.format || '—'}</Field>
      <Field label="Paginas">{doc.pages || '—'}</Field>
      <Field label="Paragrafos">{doc.paragraphs || '—'}</Field>
      <Field label="Tamanho original">{doc.originalSize ? `${(doc.originalSize / 1024).toFixed(1)} KB` : '—'}</Field>
      <Field label="Tamanho compactado">{doc.compressedSize ? `${(doc.compressedSize / 1024).toFixed(1)} KB` : '—'}</Field>
      <Field label="Compressao">{doc.compressionGain || '—'}</Field>
      <Field label="Chunks criados">{full?.chunksCount ?? '—'}</Field>
      <Field label="Criado em">{doc.createdAt ? new Date(doc.createdAt).toLocaleString('pt-BR') : '—'}</Field>
      <Field label="Atualizado em">{doc.updatedAt ? new Date(doc.updatedAt).toLocaleString('pt-BR') : '—'}</Field>
      {doc.analysisError && (
        <div style={{ marginTop: 12, padding: 12, background: '#fee2e2', borderRadius: 6, fontSize: 12, color: '#991b1b' }}>
          Erro: {doc.analysisError}
        </div>
      )}
    </div>
  )
}

function JsonTab({ full }: { full: any }) {
  if (!full?.textContent) return <div style={{ color: '#6b7280' }}>JSON estruturado nao disponivel.</div>
  let pretty = ''
  try {
    const parsed = typeof full.textContent === 'string' ? JSON.parse(full.textContent) : full.textContent
    pretty = JSON.stringify(parsed, null, 2)
  } catch {
    pretty = String(full.textContent)
  }
  return (
    <pre style={{
      fontSize: 11,
      fontFamily: 'ui-monospace, SFMono-Regular, monospace',
      background: '#0f172a',
      color: '#e2e8f0',
      padding: 12,
      borderRadius: 6,
      overflow: 'auto',
      maxHeight: 'calc(100vh - 200px)',
      margin: 0,
    }}>
      {pretty}
    </pre>
  )
}

function AnaliseTab({ doc }: { doc: DocumentListItem }) {
  return (
    <div>
      <h4 style={sectionTitleStyle}>Classificacao</h4>
      {doc.classification ? (
        <>
          <Field label="Natureza">{doc.classification.natureza || '—'}</Field>
          <Field label="Tipo">{doc.classification.tipoDocumento || '—'}</Field>
          <Field label="Areas">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {(doc.classification.areaDireito || []).map((a) => <span key={a} style={tagStyle}>{a}</span>)}
            </div>
          </Field>
          <Field label="Assuntos">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {(doc.classification.assuntos || []).map((a) => <span key={a} style={tagStyle}>{a}</span>)}
            </div>
          </Field>
          {doc.classification.contexto && doc.classification.contexto.length > 0 && (
            <Field label="Contexto">
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#374151' }}>
                {doc.classification.contexto.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            </Field>
          )}
        </>
      ) : (
        <div style={{ color: '#6b7280', fontSize: 13, marginBottom: 16 }}>
          Sem classificacao (analise nao rodada ou falhou).
        </div>
      )}

      <h4 style={sectionTitleStyle}>Ementa</h4>
      {doc.ementa ? (
        <>
          <Field label="Tipo">{doc.ementa.tipo || '—'}</Field>
          <Field label="Assunto">{doc.ementa.assunto || '—'}</Field>
          <Field label="Sintese">{doc.ementa.sintese || '—'}</Field>
          {doc.ementa.fundamentacao && (
            <Field label="Fundamentação">
              <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6 }}>{doc.ementa.fundamentacao}</div>
            </Field>
          )}
          <Field label="Conclusao">{doc.ementa.conclusao || '—'}</Field>
          <Field label="Topicos">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {(doc.ementa.topicos || []).map((t) => <span key={t} style={tagStyle}>{t}</span>)}
            </div>
          </Field>
          <Field label="Keywords">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {(doc.ementa.keywords || []).map((k) => <span key={k} style={{ ...tagStyle, background: '#dbeafe', color: '#1e40af' }}>{k}</span>)}
            </div>
          </Field>
        </>
      ) : (
        <div style={{ color: '#6b7280', fontSize: 13, marginBottom: 16 }}>
          Sem ementa.
        </div>
      )}

      <h4 style={sectionTitleStyle}>Pontos Relevantes</h4>
      {doc.keyPoints && doc.keyPoints.items && doc.keyPoints.items.length > 0 ? (
        <>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#374151' }}>
            {doc.keyPoints.items.map((item, i) => <li key={i}>{item}</li>)}
          </ul>
          {doc.keyPoints.reusableContent && (
            <div style={{ marginTop: 12 }}>
              <strong style={{ fontSize: 12, color: '#6b7280', textTransform: 'uppercase' }}>Citavel</strong>
              <div style={{
                marginTop: 6,
                padding: 12,
                background: '#f9fafb',
                borderLeft: '3px solid #1a4d8f',
                fontSize: 13,
                color: '#374151',
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
              }}>
                {doc.keyPoints.reusableContent}
              </div>
            </div>
          )}
        </>
      ) : (
        <div style={{ color: '#6b7280', fontSize: 13 }}>
          Sem pontos relevantes.
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, color: '#0f172a' }}>{children}</div>
    </div>
  )
}

// ── Estilos ────────────────────────────────────────────────────────────

const defaultsBarStyle: React.CSSProperties = {
  display: 'flex',
  gap: 12,
  alignItems: 'flex-end',
  marginBottom: 12,
  padding: 12,
  background: '#f9fafb',
  borderRadius: 8,
}
const fieldGroupStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 140 }
const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }
const selectStyle: React.CSSProperties = {
  padding: '6px 8px',
  borderRadius: 6,
  border: '1px solid #d1d5db',
  fontSize: 13,
  fontFamily: 'inherit',
  background: '#ffffff',
}
const inputStyle: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 6,
  border: '1px solid #d1d5db',
  fontSize: 13,
  fontFamily: 'inherit',
  background: '#ffffff',
}
const dropzoneStyle: React.CSSProperties = {
  border: '2px dashed #d1d5db',
  borderRadius: 8,
  padding: 32,
  textAlign: 'center',
  cursor: 'pointer',
  background: '#fafafa',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 8,
}
const dropzoneActiveStyle: React.CSSProperties = {
  ...dropzoneStyle,
  borderColor: '#1a4d8f',
  background: '#eef2ff',
}
const dropzoneTextStyle: React.CSSProperties = { fontSize: 14, fontWeight: 500, color: '#0f172a' }
const dropzoneHintStyle: React.CSSProperties = { fontSize: 12, color: '#6b7280' }
const itemsBarStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '8px 12px',
  background: '#f9fafb',
  borderRadius: 8,
  marginTop: 16,
  marginBottom: 8,
}
const uploadAllBtnStyle: React.CSSProperties = {
  background: '#1a4d8f',
  color: '#ffffff',
  border: 'none',
  borderRadius: 6,
  padding: '6px 12px',
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
}
const clearBtnStyle: React.CSSProperties = {
  background: 'transparent',
  color: '#6b7280',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  padding: '6px 12px',
  fontSize: 12,
  cursor: 'pointer',
  fontFamily: 'inherit',
}
const itemsListStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 }
const itemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: 10,
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
}
const itemNameStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  color: '#0f172a',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}
const itemMetaStyle: React.CSSProperties = { fontSize: 11, color: '#6b7280', marginTop: 2 }
const progressBarBgStyle: React.CSSProperties = {
  width: '100%',
  height: 3,
  background: '#f1f5f9',
  borderRadius: 2,
  marginTop: 4,
  overflow: 'hidden',
}
const progressBarStyle: React.CSSProperties = { height: '100%', background: '#1a4d8f', transition: 'width 0.2s' }
const removeBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#9ca3af',
  cursor: 'pointer',
  padding: 4,
  borderRadius: 4,
  display: 'flex',
}

const tableWrapStyle: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  overflow: 'hidden',
  background: '#ffffff',
}
const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 }
const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 12px',
  fontSize: 11,
  fontWeight: 600,
  color: '#6b7280',
  textTransform: 'uppercase',
  borderBottom: '1px solid #e5e7eb',
  background: '#f9fafb',
}
const trStyle: React.CSSProperties = {
  borderBottom: '1px solid #f3f4f6',
  cursor: 'pointer',
}
const tdStyle: React.CSSProperties = { padding: '10px 12px', verticalAlign: 'middle' }
const tagStyle: React.CSSProperties = {
  padding: '2px 6px',
  borderRadius: 4,
  fontSize: 11,
  fontWeight: 500,
  background: '#eef2ff',
  color: '#3730a3',
}
const iconBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid #e5e7eb',
  borderRadius: 4,
  padding: 4,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  color: '#374151',
}
const pageBtnStyle: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  padding: '4px 10px',
  fontSize: 12,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  fontFamily: 'inherit',
}
const drawerOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.4)',
  zIndex: 1000,
  display: 'flex',
  justifyContent: 'flex-end',
}
const drawerStyle: React.CSSProperties = {
  background: '#ffffff',
  width: 'min(720px, 90vw)',
  height: '100vh',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '-4px 0 16px rgba(0,0,0,0.1)',
}
const drawerHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: 16,
  borderBottom: '1px solid #e5e7eb',
}
const drawerBodyStyle: React.CSSProperties = {
  flex: 1,
  overflow: 'auto',
  padding: 16,
}
const tabBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  padding: '10px 16px',
  fontSize: 13,
  fontWeight: 500,
  color: '#6b7280',
  cursor: 'pointer',
  fontFamily: 'inherit',
  borderBottom: '2px solid transparent',
}
const activeTabBtnStyle: React.CSSProperties = {
  color: '#1a4d8f',
  borderBottomColor: '#1a4d8f',
}
const sectionTitleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: '#0f172a',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  marginTop: 20,
  marginBottom: 10,
  paddingBottom: 6,
  borderBottom: '1px solid #e5e7eb',
}
