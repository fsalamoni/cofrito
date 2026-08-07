/**
 * DocumentUpload — upload drag-and-drop de documentos para o corpus.
 *
 *  - Aceita múltiplos arquivos
 *  - Mostra progresso
 *  - Categoriza por tipo (ato, tese, manual, etc.)
 *  - Tags livres
 */
import { useState, useRef, type DragEvent, type ChangeEvent } from 'react'
import { Upload, FileText, X, Check, Loader2, AlertCircle } from 'lucide-react'
import { api } from '@/lib/api'

interface UploadItem {
  id: string
  file: File
  status: 'pending' | 'uploading' | 'done' | 'error'
  progress: number
  error?: string
  docId?: string
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

export function DocumentUpload() {
  const [items, setItems] = useState<UploadItem[]>([])
  const [dragging, setDragging] = useState(false)
  const [defaultType, setDefaultType] = useState('ato')
  const [defaultArea, setDefaultArea] = useState('geral')
  const [defaultTags, setDefaultTags] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

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
        status: 'pending',
        progress: 0,
      }))
    setItems((prev) => [...newItems, ...prev])
  }

  function handleDrop(e: DragEvent) {
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
          : i
      ))
    } catch (err: any) {
      setItems((prev) => prev.map((i) =>
        i.id === item.id
          ? { ...i, status: 'error', error: err.message ?? 'Erro no upload' }
          : i
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

  return (
    <div>
      <div style={defaultsBarStyle}>
        <div style={fieldGroupStyle}>
          <label style={labelStyle}>Tipo padrão</label>
          <select value={defaultType} onChange={(e) => setDefaultType(e.target.value)} style={selectStyle}>
            <option value="ato">Ato normativo</option>
            <option value="tese">Tese</option>
            <option value="parecer">Parecer</option>
            <option value="legislacao">Legislação</option>
            <option value="manual">Manual</option>
            <option value="manual-institucional">Manual institucional</option>
            <option value="template">Modelo/Template</option>
            <option value="faq">FAQ</option>
            <option value="doutrina">Doutrina</option>
            <option value="jurisprudencia">Jurisprudência</option>
          </select>
        </div>
        <div style={fieldGroupStyle}>
          <label style={labelStyle}>Área padrão</label>
          <select value={defaultArea} onChange={(e) => setDefaultArea(e.target.value)} style={selectStyle}>
            <option value="geral">Geral</option>
            <option value="civel">Cível</option>
            <option value="patrimonio">Patrimônio Público</option>
            <option value="improbidade">Improbidade</option>
            <option value="consumidor">Consumidor</option>
            <option value="familia">Família</option>
            <option value="ambiental">Ambiental</option>
          </select>
        </div>
        <div style={{ ...fieldGroupStyle, flex: 1 }}>
          <label style={labelStyle}>Tags (separadas por vírgula)</label>
          <input
            type="text"
            value={defaultTags}
            onChange={(e) => setDefaultTags(e.target.value)}
            placeholder="lei-14133, licitacao, 2024"
            style={inputStyle}
          />
        </div>
      </div>

      <div
        style={{
          ...dropzoneStyle,
          ...(dragging ? dropzoneActiveStyle : {}),
        }}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED_EXT.join(',')}
          onChange={handleSelect}
          style={{ display: 'none' }}
        />
        <Upload size={36} color={dragging ? '#1a4d8f' : '#9ca3af'} />
        <div style={dropzoneTextStyle}>
          {dragging ? 'Solte os arquivos aqui' : 'Arraste arquivos ou clique para selecionar'}
        </div>
        <div style={dropzoneHintStyle}>
          PDF, DOCX, TXT, MD, HTML, RTF · até 50MB cada
        </div>
      </div>

      {items.length > 0 && (
        <>
          <div style={itemsBarStyle}>
            <strong style={{ fontSize: 13 }}>{items.length} arquivo(s)</strong>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={uploadAll} style={uploadAllBtnStyle}>
                Enviar pendentes
              </button>
              <button onClick={clearDone} style={clearBtnStyle}>
                Limpar concluídos
              </button>
            </div>
          </div>

          <div style={itemsListStyle}>
            {items.map((item) => (
              <div key={item.id} style={itemStyle}>
                <FileText size={20} color="#1a4d8f" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={itemNameStyle}>{item.file.name}</div>
                  <div style={itemMetaStyle}>
                    {formatBytes(item.file.size)} · {item.status === 'uploading' && `Enviando... ${item.progress}%`}
                    {item.status === 'pending' && 'Aguardando'}
                    {item.status === 'done' && <span style={{ color: '#059669' }}>✓ Enviado (docId: {item.docId?.slice(0, 16)}...)</span>}
                    {item.status === 'error' && <span style={{ color: '#dc2626' }}>✗ {item.error}</span>}
                  </div>
                  {item.status === 'uploading' && (
                    <div style={progressBarBgStyle}>
                      <div style={{ ...progressBarStyle, width: `${item.progress}%` }} />
                    </div>
                  )}
                </div>
                {item.status === 'uploading' ? (
                  <Loader2 size={16} className="cofrito-spin" />
                ) : item.status === 'done' ? (
                  <Check size={16} color="#059669" />
                ) : item.status === 'error' ? (
                  <AlertCircle size={16} color="#dc2626" />
                ) : null}
                <button onClick={() => removeItem(item.id)} style={removeBtnStyle} title="Remover">
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={infoBoxStyle}>
        <strong>📌 Próximo passo após upload:</strong>
        <br />
        Após enviar os documentos, eles ficam com status <em>pendente_ingestao</em>.
        O sistema faz embeddings automaticamente na próxima execução do job de
        ingestão, ou você pode usar o botão <strong>&quot;Re-ingerir corpus&quot;</strong> na
        aba de Administração para processar agora.
      </div>
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// ── Styles ────────────────────────────────────────────────────────────────

const defaultsBarStyle: React.CSSProperties = {
  display: 'flex',
  gap: 12,
  padding: 12,
  background: '#f9fafb',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  marginBottom: 12,
  alignItems: 'flex-end',
}

const fieldGroupStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
}

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: '#374151',
}

const inputStyle: React.CSSProperties = {
  padding: '6px 10px',
  fontSize: 13,
  border: '1px solid #d1d5db',
  borderRadius: 6,
  fontFamily: 'inherit',
  outline: 'none',
}

const selectStyle: React.CSSProperties = { ...inputStyle, minWidth: 140 }

const dropzoneStyle: React.CSSProperties = {
  border: '2px dashed #d1d5db',
  borderRadius: 12,
  padding: 32,
  textAlign: 'center',
  cursor: 'pointer',
  background: '#fafafa',
  transition: 'all 0.15s',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 8,
}

const dropzoneActiveStyle: React.CSSProperties = {
  borderColor: '#1a4d8f',
  background: '#eef2ff',
}

const dropzoneTextStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  color: '#0f172a',
}

const dropzoneHintStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#6b7280',
}

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

const itemsListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
}

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

const itemMetaStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#6b7280',
  marginTop: 2,
}

const progressBarBgStyle: React.CSSProperties = {
  width: '100%',
  height: 3,
  background: '#f1f5f9',
  borderRadius: 2,
  marginTop: 4,
  overflow: 'hidden',
}

const progressBarStyle: React.CSSProperties = {
  height: '100%',
  background: '#1a4d8f',
  transition: 'width 0.2s',
}

const removeBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#9ca3af',
  cursor: 'pointer',
  padding: 4,
  borderRadius: 4,
  display: 'flex',
}

const infoBoxStyle: React.CSSProperties = {
  marginTop: 16,
  padding: 12,
  background: '#fef3c7',
  border: '1px solid #fde68a',
  borderRadius: 8,
  fontSize: 12,
  color: '#78350f',
  lineHeight: 1.5,
}
