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
    assunto?: string
    sintese?: string
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

const PAGE_SIZE = 20

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

  // Viewer state
  const [selected, setSelected] = useState<DocumentListItem | null>(null)
  const [viewerTab, setViewerTab] = useState<'info' | 'json' | 'analise'>('info')
  const [fullDoc, setFullDoc] = useState<any>(null)
  const [loadingFull, setLoadingFull] = useState(false)

  useEffect(() => {
    loadDocs()
  }, [])

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

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

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
                    <th style={thStyle}>Arquivo</th>
                    <th style={thStyle}>Status</th>
                    <th style={thStyle}>Natureza</th>
                    <th style={thStyle}>Assunto</th>
                    <th style={thStyle}>Areas</th>
                    <th style={thStyle}>Pags</th>
                    <th style={thStyle}>Comp.</th>
                    <th style={thStyle}>Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((d) => (
                    <tr key={d.id} style={trStyle} onClick={() => openViewer(d)}>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 500 }}>{d.title || d.fileName || d.id}</div>
                        {d.fileName && d.title && d.title !== d.fileName && (
                          <div style={{ fontSize: 11, color: '#6b7280' }}>{d.fileName}</div>
                        )}
                      </td>
                      <td style={tdStyle}>
                        <StatusBadge status={d.status} />
                      </td>
                      <td style={tdStyle}>{d.classification?.natureza || '—'}</td>
                      <td style={tdStyle}>
                        <div style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {d.ementa?.assunto || '—'}
                        </div>
                      </td>
                      <td style={tdStyle}>
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
                      <td style={tdStyle}>{d.pages || '—'}</td>
                      <td style={tdStyle}>{d.compressionGain || '—'}</td>
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

            {/* Paginacao */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 12 }}>
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  style={pageBtnStyle}
                >
                  <ChevronLeft size={16} /> Anterior
                </button>
                <span style={{ fontSize: 13, color: '#6b7280' }}>
                  Pagina {page + 1} de {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  style={pageBtnStyle}
                >
                  Proxima <ChevronRight size={16} />
                </button>
              </div>
            )}
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
