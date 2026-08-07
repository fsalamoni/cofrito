/**
 * SourcePaths — configuração de pastas (local/WebDAV/rede) para o agente
 * pesquisar documentos.
 */
import { useEffect, useState } from 'react'
import { Plus, Trash2, Save, RefreshCw, Folder, MapPin, Globe, HardDrive, Cloud, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'

interface SourcePath {
  id: string
  name: string
  type: 'local' | 'webdav' | 'smb' | 'google-drive' | 'onedrive'
  uri: string
  enabled: boolean
  schedule: 'manual' | 'hourly' | 'daily' | 'weekly'
  lastSyncAt?: string | null
}

const TYPE_ICONS: Record<SourcePath['type'], any> = {
  local: HardDrive,
  webdav: Globe,
  smb: MapPin,
  'google-drive': Cloud,
  onedrive: Cloud,
}

const TYPE_LABELS: Record<SourcePath['type'], string> = {
  local: 'Pasta local',
  webdav: 'WebDAV',
  smb: 'SMB / Rede Windows',
  'google-drive': 'Google Drive',
  onedrive: 'OneDrive',
}

export function SourcePaths() {
  const [paths, setPaths] = useState<SourcePath[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)

  useEffect(() => {
    loadPaths()
  }, [])

  async function loadPaths() {
    setLoading(true)
    setError(null)
    try {
      const result = await api.adminGetSourcePaths()
      setPaths(result.data.paths || [])
    } catch (err: any) {
      setError(err.message ?? 'Erro ao carregar paths')
    } finally {
      setLoading(false)
    }
  }

  function addPath() {
    setPaths((prev) => [
      ...prev,
      {
        id: `path-${Date.now()}`,
        name: `Pasta ${prev.length + 1}`,
        type: 'local',
        uri: '',
        enabled: true,
        schedule: 'manual',
        lastSyncAt: null,
      },
    ])
  }

  function updatePath(id: string, patch: Partial<SourcePath>) {
    setPaths((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  }

  function removePath(id: string) {
    setPaths((prev) => prev.filter((p) => p.id !== id))
  }

  async function saveAll() {
    setSaving(true)
    setError(null)
    try {
      await api.adminSetSourcePaths(paths)
      setSavedAt(new Date().toLocaleTimeString('pt-BR'))
    } catch (err: any) {
      setError(err.message ?? 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  async function syncNow(id: string) {
    try {
      await api.adminSyncSourcePath(id)
      await loadPaths()
    } catch (err: any) {
      setError(err.message ?? 'Erro ao sincronizar')
    }
  }

  return (
    <div>
      <div style={infoBoxStyle}>
        <strong>📁 Configuração de pastas para pesquisa</strong>
        <p style={{ margin: '8px 0 0', fontSize: 12, lineHeight: 1.5 }}>
          Defina aqui os caminhos onde o agente deve procurar documentos.
          Você pode configurar pastas locais (no host do servidor), pastas
          de rede (SMB/WebDAV), ou serviços de nuvem (Google Drive, OneDrive).
        </p>
        <p style={{ margin: '8px 0 0', fontSize: 12, lineHeight: 1.5 }}>
          <em>Nota:</em> a sincronização real de pastas locais/rede precisa de
          um agente CLI rodando no host que tem acesso aos arquivos. O Cofrito
          também suporta upload direto pela aba <strong>Upload de Documentos</strong>.
        </p>
      </div>

      {loading && (
        <div style={{ padding: 24, textAlign: 'center' }}>
          <Loader2 size={20} className="cofrito-spin" />
        </div>
      )}

      {error && (
        <div style={errorBoxStyle}>{error}</div>
      )}

      {!loading && (
        <>
          {paths.length === 0 && (
            <div style={emptyStateStyle}>
              <Folder size={32} color="#9ca3af" />
              <p style={{ marginTop: 8, color: '#6b7280', fontSize: 13 }}>
                Nenhuma pasta configurada. Clique em &quot;Adicionar pasta&quot; para começar.
              </p>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {paths.map((p) => {
              const Icon = TYPE_ICONS[p.type]
              return (
                <div key={p.id} style={pathCardStyle}>
                  <Icon size={20} color="#1a4d8f" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={pathHeaderStyle}>
                      <input
                        type="text"
                        value={p.name}
                        onChange={(e) => updatePath(p.id, { name: e.target.value })}
                        style={pathNameInputStyle}
                        placeholder="Nome da pasta"
                      />
                      <label style={enableLabelStyle}>
                        <input
                          type="checkbox"
                          checked={p.enabled}
                          onChange={(e) => updatePath(p.id, { enabled: e.target.checked })}
                        />
                        <span style={{ fontSize: 12 }}>Ativo</span>
                      </label>
                    </div>
                    <div style={pathRowStyle}>
                      <select
                        value={p.type}
                        onChange={(e) => updatePath(p.id, { type: e.target.value as SourcePath['type'] })}
                        style={pathSelectStyle}
                      >
                        {(Object.keys(TYPE_LABELS) as SourcePath['type'][]).map((t) => (
                          <option key={t} value={t}>
                            {TYPE_LABELS[t]}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={p.uri}
                        onChange={(e) => updatePath(p.id, { uri: e.target.value })}
                        placeholder={
                          p.type === 'local' ? '/mnt/corpus/caocipp'
                            : p.type === 'webdav' ? 'https://servidor/webdav/corpus'
                            : p.type === 'smb' ? '\\\\servidor\\corpus'
                            : p.type === 'google-drive' ? 'https://drive.google.com/folders/ID'
                            : 'https://onedrive.live.com/?cid=ID'
                        }
                        style={pathUriInputStyle}
                      />
                      <select
                        value={p.schedule}
                        onChange={(e) => updatePath(p.id, { schedule: e.target.value as any })}
                        style={{ ...pathSelectStyle, width: 110 }}
                      >
                        <option value="manual">Manual</option>
                        <option value="hourly">A cada hora</option>
                        <option value="daily">Diário</option>
                        <option value="weekly">Semanal</option>
                      </select>
                      <button onClick={() => syncNow(p.id)} style={syncBtnStyle} title="Sincronizar agora">
                        <RefreshCw size={13} />
                      </button>
                      <button onClick={() => removePath(p.id)} style={removeBtnStyle} title="Remover">
                        <Trash2 size={13} />
                      </button>
                    </div>
                    {p.lastSyncAt && (
                      <div style={lastSyncStyle}>
                        Última sincronização: {new Date(p.lastSyncAt).toLocaleString('pt-BR')}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <div style={actionsBarStyle}>
            <button onClick={addPath} style={addBtnStyle}>
              <Plus size={14} />
              Adicionar pasta
            </button>
            <button onClick={saveAll} disabled={saving} style={saveBtnStyle}>
              {saving ? <Loader2 size={14} className="cofrito-spin" /> : <Save size={14} />}
              {saving ? 'Salvando...' : 'Salvar configurações'}
            </button>
            {savedAt && (
              <span style={savedHintStyle}>✓ Salvo às {savedAt}</span>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────

const infoBoxStyle: React.CSSProperties = {
  background: '#eef2ff',
  border: '1px solid #c7d2fe',
  borderRadius: 8,
  padding: 12,
  marginBottom: 16,
  color: '#0f172a',
  fontSize: 13,
}

const errorBoxStyle: React.CSSProperties = {
  background: '#fee2e2',
  color: '#991b1b',
  padding: 10,
  borderRadius: 8,
  fontSize: 12,
  marginBottom: 12,
}

const emptyStateStyle: React.CSSProperties = {
  padding: 32,
  textAlign: 'center',
  background: '#f9fafb',
  border: '1px dashed #d1d5db',
  borderRadius: 8,
  marginBottom: 16,
}

const pathCardStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 10,
  padding: 12,
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
}

const pathHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  marginBottom: 8,
}

const pathNameInputStyle: React.CSSProperties = {
  flex: 1,
  padding: '4px 8px',
  fontSize: 14,
  fontWeight: 600,
  border: '1px solid transparent',
  background: 'transparent',
  outline: 'none',
  borderRadius: 4,
  color: '#0f172a',
  fontFamily: 'inherit',
}

const enableLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  fontSize: 12,
  color: '#374151',
  cursor: 'pointer',
}

const pathRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 6,
  alignItems: 'center',
}

const pathSelectStyle: React.CSSProperties = {
  padding: '5px 8px',
  fontSize: 12,
  border: '1px solid #d1d5db',
  borderRadius: 6,
  background: '#ffffff',
  fontFamily: 'inherit',
  outline: 'none',
}

const pathUriInputStyle: React.CSSProperties = {
  flex: 1,
  padding: '5px 10px',
  fontSize: 12,
  border: '1px solid #d1d5db',
  borderRadius: 6,
  background: '#f9fafb',
  fontFamily: 'ui-monospace, monospace',
  outline: 'none',
}

const syncBtnStyle: React.CSSProperties = {
  background: '#ffffff',
  color: '#1a4d8f',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  padding: '5px 8px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
}

const removeBtnStyle: React.CSSProperties = {
  background: 'transparent',
  color: '#dc2626',
  border: '1px solid #fca5a5',
  borderRadius: 6,
  padding: '5px 8px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
}

const lastSyncStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#6b7280',
  marginTop: 6,
}

const actionsBarStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'center',
  marginTop: 16,
  padding: 12,
  background: '#f9fafb',
  borderRadius: 8,
}

const addBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  background: '#ffffff',
  color: '#1a4d8f',
  border: '1px solid #1a4d8f',
  borderRadius: 6,
  padding: '7px 12px',
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const saveBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  background: '#1a4d8f',
  color: '#ffffff',
  border: 'none',
  borderRadius: 6,
  padding: '7px 14px',
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const savedHintStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#059669',
  marginLeft: 'auto',
}
