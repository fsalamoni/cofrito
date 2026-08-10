/**
 * LLMSettings — configuração de LLM pessoal do usuário.
 *
 *  - Escolha o provider (Google, OpenAI, Anthropic, OpenRouter, etc.)
 *  - Liste modelos (catálogo local ou API do provider)
 *  - Insira API key (mascarada, com toggle "mostrar")
 *  - Customize baseUrl, temperature, maxTokens
 *  - Salva em users/{uid}/llmConfig
 */
import { useState, useEffect, useMemo } from 'react'
import { Eye, EyeOff, Save, Trash2, RefreshCw, Check, X, AlertTriangle, ExternalLink, Loader2 } from 'lucide-react'
import { PROVIDERS, getProviderInfo, getEnrichedModelsForProvider } from '@/lib/providers'
import { useLLMConfig } from '@/hooks/useLLMConfig'
import type { LLMConfig, LLMProvider } from '@/types'
import { ModelSelectorTable } from './ModelSelectorTable'
import { InfoModal } from '@/components/InfoModal'
import { TemperatureInfo, MaxTokensInfo } from '@/components/llm-info-content'

export function LLMSettings() {
  const {
    userConfig,
    globalConfig,
    globalForcesConfig,
    effectiveConfig,
    saveUserConfig,
    deleteUserConfig,
    listModels,
  } = useLLMConfig()

  const [provider, setProvider] = useState<LLMProvider>(userConfig?.provider ?? 'google')
  const [model, setModel] = useState<string>(userConfig?.model ?? 'gemini-2.5-flash')
  const [apiKey, setApiKey] = useState<string>(userConfig?.apiKey ?? '')
  const [baseUrl, setBaseUrl] = useState<string>(userConfig?.baseUrl ?? '')
  const [temperature, setTemperature] = useState<number>(userConfig?.temperature ?? 0.3)
  const [maxTokens, setMaxTokens] = useState<number>(userConfig?.maxTokens ?? 2000)
  const [showKey, setShowKey] = useState(false)
  const [loadingModels, setLoadingModels] = useState(false)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null)

  const providerInfo = getProviderInfo(provider)

  // Modelos enriquecidos do provider selecionado (com tier, scores, custos)
  const enrichedModels = useMemo(
    () => getEnrichedModelsForProvider(provider),
    [provider],
  )

  useEffect(() => {
    if (userConfig) {
      setProvider(userConfig.provider)
      setModel(userConfig.model)
      setApiKey(userConfig.apiKey)
      setBaseUrl(userConfig.baseUrl ?? '')
      setTemperature(userConfig.temperature ?? 0.3)
      setMaxTokens(userConfig.maxTokens ?? 2000)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userConfig?.provider, userConfig?.model])

  async function handleLoadModels() {
    if (!apiKey && provider !== 'ollama') {
      setFeedback({ ok: false, msg: 'Insira a API key para listar modelos' })
      return
    }
    setLoadingModels(true)
    try {
      const models = await listModels(provider, apiKey, baseUrl || providerInfo?.defaultBaseUrl)
      setFeedback({ ok: true, msg: `${models.length} modelos do provider retornados (catálogo local: ${enrichedModels.length})` })
    } catch (err: any) {
      setFeedback({ ok: false, msg: err.message ?? 'Erro ao listar modelos' })
    } finally {
      setLoadingModels(false)
    }
  }

  async function handleSave() {
    if (!apiKey && provider !== 'ollama') {
      setFeedback({ ok: false, msg: 'API key é obrigatória' })
      return
    }
    if (!model) {
      setFeedback({ ok: false, msg: 'Selecione um modelo' })
      return
    }
    setSaving(true)
    setFeedback(null)
    try {
      const config: LLMConfig = {
        provider,
        model,
        apiKey,
        baseUrl: baseUrl || undefined,
        temperature,
        maxTokens,
        scope: 'user',
        updatedAt: new Date().toISOString(),
      }
      await saveUserConfig(config)
      setFeedback({ ok: true, msg: 'Configuração salva!' })
    } catch (err: any) {
      setFeedback({ ok: false, msg: err.message ?? 'Erro ao salvar' })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm('Remover sua configuração pessoal?')) return
    try {
      await deleteUserConfig()
      setFeedback({ ok: true, msg: 'Configuração removida' })
      setApiKey('')
      setModel('')
    } catch (err: any) {
      setFeedback({ ok: false, msg: err.message ?? 'Erro ao remover' })
    }
  }

  // Se global está setado, mostra aviso
  if (globalForcesConfig) {
    return (
      <div style={{ padding: 12 }}>
        <div style={bannerStyle}>
          <AlertTriangle size={16} color="#b45309" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#92400e' }}>
              Configuração global ativa
            </div>
            <div style={{ fontSize: 11, color: '#78350f', marginTop: 4 }}>
              O administrador master definiu um LLM padrão para todos os usuários.
              Sua configuração pessoal está desabilitada.
            </div>
          </div>
        </div>
        {globalConfig && (
          <div style={{ marginTop: 12, padding: 10, background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8 }}>
            <div style={fieldLabelStyle}>Em uso agora</div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{globalConfig.model}</div>
            <div style={{ fontSize: 11, color: '#6b7280' }}>Provider: {globalConfig.provider}</div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ padding: 12 }}>
      <div style={headerStyle}>
        <div>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#0f172a' }}>
            Provedor de IA
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: 11, color: '#6b7280' }}>
            Use sua própria API key. Padrão do sistema: {effectiveConfig?.provider ?? 'Google Gemini'}.
          </p>
        </div>
      </div>

      {/* Provider */}
      <div style={fieldStyle}>
        <label style={fieldLabelStyle}>Provedor</label>
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value as LLMProvider)}
          style={inputStyle}
        >
          {PROVIDERS.map((p: { id: string; label: string }) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        {providerInfo && (
          <div style={hintStyle}>{providerInfo.description}</div>
        )}
      </div>

      {/* API Key */}
      <div style={fieldStyle}>
        <label style={fieldLabelStyle}>
          API Key
          {providerInfo?.apiKeyUrl && (
            <a
              href={providerInfo.apiKeyUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={extLinkStyle}
            >
              Obter key <ExternalLink size={10} style={{ verticalAlign: 'middle' }} />
            </a>
          )}
        </label>
        <div style={{ position: 'relative' }}>
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
            style={{ ...inputStyle, paddingRight: 36 }}
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            style={eyeBtnStyle}
            tabIndex={-1}
          >
            {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>

      {/* Base URL (apenas se custom ou openrouter/ollama) */}
      {(provider === 'custom' || providerInfo?.defaultBaseUrl) && (
        <div style={fieldStyle}>
          <label style={fieldLabelStyle}>
            Endpoint (Base URL)
            {providerInfo?.defaultBaseUrl && (
              <span style={{ color: '#9ca3af', fontWeight: 400, marginLeft: 4 }}>
                · padrão: {providerInfo.defaultBaseUrl}
              </span>
            )}
          </label>
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={providerInfo?.defaultBaseUrl ?? 'https://api.example.com/v1'}
            style={inputStyle}
            spellCheck={false}
          />
        </div>
      )}

      {/* Model — TABELA RICA */}
      <div style={fieldStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <label style={fieldLabelStyle}>
            Modelo
            {enrichedModels.length > 0 && (
              <span style={{ color: '#9ca3af', fontWeight: 400, marginLeft: 4 }}>
                · {enrichedModels.length} com notas e custos
              </span>
            )}
          </label>
          {providerInfo?.supportsModelListing && (
            <button
              type="button"
              onClick={handleLoadModels}
              disabled={loadingModels || !apiKey}
              style={smallBtnStyle}
            >
              {loadingModels ? <Loader2 size={11} className="cofrito-spin" /> : <RefreshCw size={11} />}
              Listar modelos
            </button>
          )}
        </div>
        {enrichedModels.length > 0 ? (
          <ModelSelectorTable
            models={enrichedModels}
            selectedId={model}
            onSelect={(m) => setModel(m.id)}
            showProvider={false}
            maxHeight={360}
            compact
            providerId={provider}
          />
        ) : (
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="gemini-2.5-flash"
            style={inputStyle}
            spellCheck={false}
          />
        )}
      </div>

      {/* Temperature */}
      <div style={fieldStyle}>
        <label style={fieldLabelStyle}>
          Temperatura: {temperature.toFixed(2)}
          <InfoModal title="Temperatura"><TemperatureInfo /></InfoModal>
        </label>
        <input
          type="range"
          min="0"
          max="2"
          step="0.05"
          value={temperature}
          onChange={(e) => setTemperature(parseFloat(e.target.value))}
          style={{ width: '100%' }}
        />
        <div style={hintStyle}>
          0 = determinístico · 2 = caótico. <strong>Recomendado: 0.1–0.3</strong> para peças jurídicas.
        </div>
      </div>

      {/* Max tokens */}
      <div style={fieldStyle}>
        <label style={fieldLabelStyle}>
          Max tokens
          <InfoModal title="Max tokens (tamanho da resposta)"><MaxTokensInfo /></InfoModal>
        </label>
        <input
          type="number"
          min="100"
          max="32000"
          step="100"
          value={maxTokens}
          onChange={(e) => setMaxTokens(parseInt(e.target.value) || 2000)}
          style={inputStyle}
        />
        <div style={hintStyle}>
          ≈ {Math.round(maxTokens * 0.75).toLocaleString('pt-BR')} palavras. <strong>Padrão: 2.000</strong>.
        </div>
      </div>

      {/* Feedback */}
      {feedback && (
        <div style={{
          ...feedbackStyle,
          background: feedback.ok ? '#d1fae5' : '#fee2e2',
          color: feedback.ok ? '#065f46' : '#991b1b',
        }}>
          {feedback.ok ? <Check size={14} /> : <X size={14} />}
          <span style={{ fontSize: 12 }}>{feedback.msg}</span>
        </div>
      )}

      {/* Ações */}
      <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
        <button onClick={handleSave} disabled={saving} style={saveBtnStyle}>
          {saving ? <Loader2 size={13} className="cofrito-spin" /> : <Save size={13} />}
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
        {userConfig && (
          <button onClick={handleDelete} style={deleteBtnStyle}>
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────

const headerStyle: React.CSSProperties = {
  marginBottom: 12,
}

const fieldStyle: React.CSSProperties = {
  marginBottom: 12,
}

const fieldLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  fontSize: 11,
  fontWeight: 600,
  color: '#374151',
  marginBottom: 4,
  textTransform: 'uppercase',
  letterSpacing: 0.3,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '7px 10px',
  fontSize: 13,
  border: '1px solid #d1d5db',
  borderRadius: 6,
  fontFamily: 'inherit',
  background: '#ffffff',
  color: '#0f172a',
  outline: 'none',
  boxSizing: 'border-box',
}

const hintStyle: React.CSSProperties = {
  fontSize: 10,
  color: '#9ca3af',
  marginTop: 4,
}

const extLinkStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 500,
  color: '#1a4d8f',
  textDecoration: 'none',
  textTransform: 'none',
  letterSpacing: 0,
}

const eyeBtnStyle: React.CSSProperties = {
  position: 'absolute',
  right: 8,
  top: '50%',
  transform: 'translateY(-50%)',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  padding: 4,
  color: '#6b7280',
  display: 'flex',
}

const smallBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 3,
  background: 'transparent',
  border: '1px solid #d1d5db',
  borderRadius: 4,
  padding: '2px 6px',
  fontSize: 10,
  color: '#6b7280',
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const saveBtnStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  background: '#1a4d8f',
  color: '#ffffff',
  border: 'none',
  borderRadius: 6,
  padding: '8px 12px',
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const deleteBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid #fca5a5',
  color: '#dc2626',
  borderRadius: 6,
  padding: '8px 10px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
}

const feedbackStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: 8,
  borderRadius: 6,
  marginBottom: 8,
}

const bannerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  background: '#fef3c7',
  border: '1px solid #fde68a',
  borderRadius: 8,
  padding: 10,
}
