/**
 * SourcePaths — configuração de fontes de documentos para o corpus.
 *
 * Esta página apresenta DUAS formas de adicionar documentos ao corpus:
 *
 * 1. **Upload de arquivos** (RECOMENDADO — mais fácil e imediato)
 *    → Use a aba "Upload de Documentos" para enviar PDFs, DOCX, MD, TXT.
 *    → O sistema ingere automaticamente (chunks + embeddings).
 *    → Os documentos ficam disponíveis no corpus para pesquisa.
 *
 * 2. **Pastas remotas** (AVANÇADO — precisa de agente local ou OAuth)
 *    → WebDAV, SMB/rede, Google Drive, OneDrive
 *    → O COFRITO NÃO ACESSA DIRETAMENTE pastas remotas porque
 *      é executado no Firebase (sem acesso à rede local do MP).
 *    → Para usar essa opção, o admin master precisa:
 *      a) Instalar um agente CLI no PC do MP que sincroniza a pasta
 *         com o Firestore (work in progress), OU
 *      b) Usar WebDAV público (servidor na internet) que o Cloud Function
 *         consegue acessar, OU
 *      c) Para Google Drive/OneDrive: configurar OAuth client_id
 *         (mais complexo, requer aprovação do Google/Microsoft).
 *
 * SE NENHUMA PASTA REMOTA ESTIVER HABILITADA, o agente simplesmente
 * IGNORA essa parte e foca nos uploads + intranet MPRS (se configurada).
 * Não há erro, não há fallback confuso — o corpus é formado só pelo
 * que estiver configurado e ativo.
 */
import { useEffect, useState } from 'react'
import {
  Trash2, Save, RefreshCw, FolderOpen, MapPin, Globe, HardDrive, Cloud,
  Upload, AlertCircle, CheckCircle2, Info, Loader2, ChevronDown, ChevronUp,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api'

interface SourcePath {
  id: string
  name: string
  type: 'webdav' | 'smb' | 'google-drive' | 'onedrive' | 'local-cli'
  uri: string
  enabled: boolean
  schedule: 'manual' | 'hourly' | 'daily' | 'weekly'
  lastSyncAt?: string | null
  status?: 'configured' | 'pending-agent' | 'pending-oauth'
  notes?: string
}

const TYPE_INFO: Record<SourcePath['type'], { label: string; Icon: any; description: string; status: 'supported' | 'needs-agent' | 'needs-oauth' }> = {
  'webdav': {
    label: 'WebDAV (servidor público)',
    Icon: Globe,
    description: 'Servidor WebDAV acessível pela internet. O Cloud Function do Cofrito consegue acessar diretamente.',
    status: 'supported',
  },
  'smb': {
    label: 'SMB / Rede Windows',
    Icon: MapPin,
    description: 'Pasta compartilhada na rede do MP/RS. PRECISA de um agente CLI rodando no PC do MP (não funciona diretamente do Firebase).',
    status: 'needs-agent',
  },
  'local-cli': {
    label: 'Pasta local com agente CLI',
    Icon: HardDrive,
    description: 'Pasta em um PC local com o agente CLI do Cofrito instalado. O agente faz upload automático para o corpus.',
    status: 'needs-agent',
  },
  'google-drive': {
    label: 'Google Drive',
    Icon: Cloud,
    description: 'Pasta do Google Drive. PRECISA configurar OAuth client_id (avançado — requer aprovação do Google Cloud Console).',
    status: 'needs-oauth',
  },
  'onedrive': {
    label: 'OneDrive / SharePoint',
    Icon: Cloud,
    description: 'Pasta do OneDrive/SharePoint. PRECISA configurar OAuth client_id (avançado — requer app no Azure AD).',
    status: 'needs-oauth',
  },
}

const SCHEDULE_LABELS: Record<SourcePath['schedule'], string> = {
  manual: 'Manual (admin clica em "Sincronizar")',
  hourly: 'A cada 1 hora',
  daily: 'Diariamente',
  weekly: 'Semanalmente',
}

export function SourcePaths() {
  const [paths, setPaths] = useState<SourcePath[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [showHelp, setShowHelp] = useState(false)

  useEffect(() => {
    loadPaths()
  }, [])

  async function loadPaths() {
    setLoading(true)
    setError(null)
    try {
      const result: any = await api.adminGetSourcePaths()
      setPaths(result.paths || [])
    } catch (err: any) {
      setError(err.message ?? 'Erro ao carregar pastas')
    } finally {
      setLoading(false)
    }
  }

  async function savePaths() {
    setSaving(true)
    setError(null)
    try {
      const r = await api.adminSetSourcePaths(paths)
      setSavedAt(new Date().toLocaleString('pt-BR'))
      console.info('Pastas salvas:', r)
    } catch (err: any) {
      setError(err.message ?? 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  function addPath(type: SourcePath['type']) {
    const newPath: SourcePath = {
      id: `path-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: TYPE_INFO[type].label,
      type,
      uri: '',
      enabled: false, // começa desabilitado até configurar
      schedule: 'manual',
      status: TYPE_INFO[type].status === 'supported' ? 'configured' : 'pending-agent',
      notes: '',
    }
    setPaths([...paths, newPath])
  }

  function updatePath(id: string, updates: Partial<SourcePath>) {
    setPaths(paths.map((p) => (p.id === id ? { ...p, ...updates } : p)))
  }

  function removePath(id: string) {
    setPaths(paths.filter((p) => p.id !== id))
  }

  async function syncPath(id: string) {
    try {
      await api.adminSyncSourcePath(id)
      await loadPaths()
    } catch (err: any) {
      setError(err.message ?? 'Erro ao sincronizar')
    }
  }

  if (loading) {
    return <div style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>Carregando…</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 800 }}>
      {/* BLOCO 1: Forma mais fácil — Upload */}
      <div style={{
        padding: 20,
        background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
        border: '1px solid #6ee7b7',
        borderRadius: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <Upload size={24} color="#065f46" style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#065f46' }}>
              Caminho mais fácil: Upload de Documentos
            </h3>
            <p style={{ fontSize: 12, color: '#047857', margin: '6px 0', lineHeight: 1.5 }}>
              A forma <strong>mais simples e imediata</strong> de alimentar o corpus é enviar arquivos
              (PDF, DOCX, MD, TXT) pela aba <strong>Upload de Documentos</strong>.
              Os documentos são processados automaticamente (chunks + embeddings) e ficam
              disponíveis para pesquisa imediatamente.
            </p>
            <Link
              to="#/admin/documents"
              onClick={() => { window.location.hash = '#/admin/documents' }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                background: '#065f46',
                color: '#ffffff',
                borderRadius: 6,
                textDecoration: 'none',
                fontSize: 12,
                fontWeight: 600,
                marginTop: 8,
              }}
            >
              <Upload size={14} /> Ir para Upload de Documentos
            </Link>
          </div>
        </div>
      </div>

      {/* BLOCO 2: Pastas remotas (avançado) */}
      <div style={{
        padding: 16,
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: 8,
      }}>
        <button
          onClick={() => setShowHelp((v) => !v)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            fontFamily: 'inherit',
            color: '#0f172a',
          }}
        >
          {showHelp ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          <Info size={14} color="#1a4d8f" />
          <span style={{ fontSize: 13, fontWeight: 600 }}>
            Sobre pastas remotas (WebDAV, SMB, Google Drive, OneDrive)
          </span>
        </button>
        {showHelp && (
          <div style={{ marginTop: 12, padding: 12, background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 6 }}>
            <p style={{ fontSize: 12, color: '#78350f', margin: '0 0 8px', lineHeight: 1.6 }}>
              <strong>Importante</strong>: o Cofrito é executado no <strong>Firebase (nuvem)</strong> e
              <strong> não tem acesso direto à rede interna do MP/RS</strong> nem ao seu PC.
              Por isso, pastas remotas exigem uma das seguintes configurações:
            </p>
            <ul style={{ fontSize: 12, color: '#78350f', margin: '0 0 8px', paddingLeft: 20, lineHeight: 1.6 }}>
              <li><strong>WebDAV público</strong> (servidor acessível pela internet) — funciona direto do Cloud Function.</li>
              <li><strong>Agente CLI no PC do MP</strong> — pequeno programa que fica rodando no PC e sincroniza a pasta com o Firestore (em desenvolvimento).</li>
              <li><strong>Google Drive / OneDrive</strong> — requer configurar OAuth client_id (avançado).</li>
            </ul>
            <p style={{ fontSize: 12, color: '#78350f', margin: 0, lineHeight: 1.6 }}>
              <strong>Se nenhuma pasta estiver configurada e habilitada</strong>, o agente simplesmente
              ignora esta parte e foca nos <strong>uploads</strong> e na <strong>intranet MPRS</strong> (se habilitada).
              Não há erro ou comportamento estranho.
            </p>
          </div>
        )}
      </div>

      {/* Lista de pastas */}
      <div style={{
        padding: 20,
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#0f172a' }}>
            Pastas configuradas
          </h3>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <AddButton onClick={() => addPath('webdav')} label="WebDAV" Icon={Globe} />
            <AddButton onClick={() => addPath('local-cli')} label="Agente local" Icon={HardDrive} />
            <AddButton onClick={() => addPath('smb')} label="SMB" Icon={MapPin} />
            <AddButton onClick={() => addPath('google-drive')} label="Drive" Icon={Cloud} />
            <AddButton onClick={() => addPath('onedrive')} label="OneDrive" Icon={Cloud} />
          </div>
        </div>

        {error && (
          <div style={{ padding: 12, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: 6, marginBottom: 12, fontSize: 12 }}>
            {error}
          </div>
        )}

        {paths.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>
            <FolderOpen size={32} style={{ marginBottom: 8 }} />
            <p style={{ fontSize: 13, margin: 0 }}>Nenhuma pasta configurada.</p>
            <p style={{ fontSize: 11, margin: '4px 0 0' }}>
              Use o <strong>Upload de Documentos</strong> para a forma mais fácil, ou adicione uma pasta remota acima.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {paths.map((p) => (
              <PathCard
                key={p.id}
                path={p}
                onUpdate={(u) => updatePath(p.id, u)}
                onRemove={() => removePath(p.id)}
                onSync={() => syncPath(p.id)}
              />
            ))}
          </div>
        )}

        {paths.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginTop: 16, alignItems: 'center' }}>
            <button
              onClick={savePaths}
              disabled={saving}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 16px',
                background: '#1a4d8f',
                color: '#ffffff',
                border: 'none',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 500,
                cursor: saving ? 'wait' : 'pointer',
                opacity: saving ? 0.6 : 1,
                fontFamily: 'inherit',
              }}
            >
              {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
              {saving ? 'Salvando…' : 'Salvar configurações'}
            </button>
            <button onClick={loadPaths} style={secondaryBtnStyle}>
              <RefreshCw size={14} /> Recarregar
            </button>
            {savedAt && (
              <span style={{ fontSize: 11, color: '#059669', display: 'flex', alignItems: 'center', gap: 4 }}>
                <CheckCircle2 size={12} /> Salvo às {savedAt}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function AddButton({ onClick, label, Icon }: { onClick: () => void; label: string; Icon: any }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 8px',
        background: '#f3f4f6',
        color: '#374151',
        border: '1px solid #e5e7eb',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 500,
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      <Icon size={12} /> {label}
    </button>
  )
}

function PathCard({
  path, onUpdate, onRemove, onSync,
}: {
  path: SourcePath
  onUpdate: (u: Partial<SourcePath>) => void
  onRemove: () => void
  onSync: () => void
}) {
  const info = TYPE_INFO[path.type]
  const Icon = info.Icon
  const needsAgent = info.status === 'needs-agent'
  const needsOauth = info.status === 'needs-oauth'

  return (
    <div style={{
      padding: 14,
      background: '#f8fafc',
      border: '1px solid #e5e7eb',
      borderRadius: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <Icon size={18} color="#1a4d8f" />
        <input
          value={path.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          placeholder="Nome da pasta"
          style={{ ...inputStyle, fontWeight: 500, flex: 1 }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={path.enabled}
            onChange={(e) => onUpdate({ enabled: e.target.checked })}
          />
          <span style={{ color: path.enabled ? '#065f46' : '#6b7280' }}>
            {path.enabled ? 'Ativo' : 'Desabilitado'}
          </span>
        </label>
        <button onClick={onRemove} style={iconBtnStyle} title="Remover">
          <Trash2 size={14} color="#dc2626" />
        </button>
      </div>

      <p style={{ fontSize: 11, color: '#6b7280', margin: '0 0 10px' }}>{info.description}</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px', gap: 8 }}>
        <div>
          <label style={labelStyle}>URI / Caminho</label>
          <input
            value={path.uri}
            onChange={(e) => onUpdate({ uri: e.target.value })}
            placeholder={
              path.type === 'webdav' ? 'https://servidor.com.br/arquivos' :
              path.type === 'smb' ? '\\\\servidor\\pasta' :
              path.type === 'local-cli' ? '/home/user/documentos' :
              path.type === 'google-drive' ? 'gdrive://folder_id' :
              'onedrive://item_id'
            }
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Agendamento</label>
          <select
            value={path.schedule}
            onChange={(e) => onUpdate({ schedule: e.target.value as any })}
            style={inputStyle}
          >
            {(Object.keys(SCHEDULE_LABELS) as Array<keyof typeof SCHEDULE_LABELS>).map((k) => (
              <option key={k} value={k}>{SCHEDULE_LABELS[k]}</option>
            ))}
          </select>
        </div>
      </div>

      {(needsAgent || needsOauth) && (
        <div style={{ marginTop: 10, padding: 10, background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 4, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <AlertCircle size={14} color="#92400e" style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: 11, color: '#78350f', lineHeight: 1.5 }}>
            <strong>{needsAgent ? 'Requer agente CLI' : 'Requer OAuth'}</strong>: {needsAgent
              ? 'Instale o agente CLI do Cofrito no PC de origem (instruções no README).'
              : 'Configure OAuth client_id do Google/Microsoft (variáveis de ambiente no deploy).'}
            <br />A pasta será listada mas <strong>não será consultada</strong> até que o pré-requisito seja atendido.
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 11, color: '#6b7280' }}>
        <span>Última sincronização: {path.lastSyncAt ? new Date(path.lastSyncAt).toLocaleString('pt-BR') : 'nunca'}</span>
        <button
          onClick={onSync}
          disabled={!path.enabled || !path.uri}
          style={{
            ...smallBtnStyle,
            opacity: !path.enabled || !path.uri ? 0.4 : 1,
          }}
        >
          <RefreshCw size={11} /> Sincronizar agora
        </button>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  fontSize: 12,
  border: '1px solid #d1d5db',
  borderRadius: 4,
  fontFamily: 'inherit',
  background: '#ffffff',
  outline: 'none',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 10,
  fontWeight: 600,
  color: '#374151',
  marginBottom: 3,
  textTransform: 'uppercase',
  letterSpacing: 0.3,
}

const iconBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  background: 'transparent',
  border: '1px solid #e5e7eb',
  borderRadius: 4,
  cursor: 'pointer',
}

const secondaryBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '8px 12px',
  background: '#ffffff',
  color: '#374151',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const smallBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '3px 8px',
  background: '#f3f4f6',
  color: '#374151',
  border: '1px solid #e5e7eb',
  borderRadius: 4,
  fontSize: 11,
  cursor: 'pointer',
  fontFamily: 'inherit',
}
