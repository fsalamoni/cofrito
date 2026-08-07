/**
 * LLM multi-provider service.
 *
 * Suporta 16+ providers via dois formatos:
 *  - **OpenAI-compatible** (openai, anthropic-via-proxy, openrouter, deepseek, kimi,
 *    qwen, groq, nvidia, mistral, xai, cohere, together, fireworks, perplexity, ollama)
 *  - **Google Gemini** (formato nativo)
 *  - **Anthropic** (formato nativo)
 *  - **Stub** (quando não há API key — usado em dev)
 *
 * Inspirado em Lexio (https://github.com/fsalamoni/Lexio).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * LLM multi-provider service.
 * (system prompt construído pelo caller; este módulo só executa chamadas HTTP/SDK)
 */

export type LLMProvider =
  | 'google' | 'openai' | 'anthropic' | 'openrouter'
  | 'deepseek' | 'kimi' | 'qwen' | 'groq' | 'nvidia'
  | 'mistral' | 'xai' | 'cohere' | 'together'
  | 'fireworks' | 'perplexity' | 'ollama' | 'custom'

export interface LLMConfigLike {
  provider: LLMProvider
  model: string
  apiKey: string
  baseUrl?: string
  temperature?: number
  maxTokens?: number
  systemPromptOverride?: string
}

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface LLMGenerateInput {
  systemPrompt: string
  messages: LLMMessage[]
  config: LLMConfigLike
  /** Chave do Google Gemini (admin) — usada apenas se config.provider === 'google' e config.apiKey vazia. */
  geminiApiKey?: string
}

export interface LLMGenerateOutput {
  content: string
  tokens: { input: number; output: number; total: number }
  model: string
  provider: LLMProvider
}

/**
 * Gera resposta via provider configurado.
 * Se config.provider === 'google' e config.apiKey está vazia, usa geminiApiKey (admin).
 */
export async function generateWithProvider(input: LLMGenerateInput): Promise<LLMGenerateOutput> {
  const cfg = input.config
  // Fallback para API key admin (Gemini do projeto) se for google e user não setou
  const effectiveApiKey = cfg.apiKey || (cfg.provider === 'google' ? input.geminiApiKey || '' : '')

  if (!effectiveApiKey && cfg.provider !== 'ollama') {
    return stubResponse(cfg, input.messages)
  }

  const temperature = cfg.temperature ?? 0.3
  const maxTokens = cfg.maxTokens ?? 2000

  switch (cfg.provider) {
    case 'google':
      return callGoogle({ ...cfg, apiKey: effectiveApiKey, temperature, maxTokens }, input)
    case 'anthropic':
      return callAnthropic({ ...cfg, apiKey: effectiveApiKey, temperature, maxTokens }, input)
    case 'openai':
    case 'openrouter':
    case 'deepseek':
    case 'kimi':
    case 'qwen':
    case 'groq':
    case 'nvidia':
    case 'mistral':
    case 'xai':
    case 'cohere':
    case 'together':
    case 'fireworks':
    case 'perplexity':
    case 'ollama':
    case 'custom':
      return callOpenAICompat({ ...cfg, apiKey: effectiveApiKey, temperature, maxTokens }, input)
  }
}

function stubResponse(cfg: LLMConfigLike, _msgs: LLMMessage[]): LLMGenerateOutput {
  const content =
    '⚠️ Nenhuma API key configurada para o LLM. Para usar ' +
    (cfg.provider === 'google' ? 'Google Gemini' : cfg.provider) +
    ', adicione sua chave em Configurações. O agente está pronto para responder assim que uma chave for fornecida.'
  return {
    content,
    tokens: { input: 0, output: 0, total: 0 },
    model: cfg.model,
    provider: cfg.provider,
  }
}

// ── Google Gemini ─────────────────────────────────────────────────────────

async function callGoogle(cfg: LLMConfigLike & { apiKey: string; temperature: number; maxTokens: number }, input: LLMGenerateInput): Promise<LLMGenerateOutput> {
  const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = await import('@google/generative-ai')
  const genai = new GoogleGenerativeAI(cfg.apiKey)
  const model = genai.getGenerativeModel({
    model: cfg.model,
    generationConfig: {
      temperature: cfg.temperature,
      maxOutputTokens: cfg.maxTokens,
    },
    systemInstruction: cfg.systemPromptOverride || input.systemPrompt,
    safetySettings: [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    ],
  })

  const chat = model.startChat({ history: input.messages
    .filter((m) => m.role !== 'system')
    .slice(0, -1)
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
  })
  const lastMsg = input.messages[input.messages.length - 1]
  const result = await chat.sendMessage(lastMsg.content)
  const text = result.response.text()
  const usage = result.response.usageMetadata
  return {
    content: text,
    tokens: {
      input: usage?.promptTokenCount ?? 0,
      output: usage?.candidatesTokenCount ?? 0,
      total: usage?.totalTokenCount ?? 0,
    },
    model: cfg.model,
    provider: cfg.provider,
  }
}

// ── Anthropic Claude ──────────────────────────────────────────────────────

async function callAnthropic(cfg: LLMConfigLike & { apiKey: string; temperature: number; maxTokens: number }, input: LLMGenerateInput): Promise<LLMGenerateOutput> {
  const baseUrl = cfg.baseUrl || 'https://api.anthropic.com/v1'
  const res = await fetch(`${baseUrl}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: cfg.maxTokens,
      temperature: cfg.temperature,
      system: cfg.systemPromptOverride || input.systemPrompt,
      messages: input.messages.filter((m) => m.role !== 'system').map((m) => ({
        role: m.role,
        content: m.content,
      })),
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Anthropic error ${res.status}: ${err}`)
  }
  const data: any = await res.json()
  return {
    content: data.content?.[0]?.text ?? '',
    tokens: {
      input: data.usage?.input_tokens ?? 0,
      output: data.usage?.output_tokens ?? 0,
      total: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
    },
    model: cfg.model,
    provider: cfg.provider,
  }
}

// ── OpenAI-compatible (todos os outros) ───────────────────────────────────

async function callOpenAICompat(cfg: LLMConfigLike & { apiKey: string; temperature: number; maxTokens: number }, input: LLMGenerateInput): Promise<LLMGenerateOutput> {
  const baseUrl = cfg.baseUrl || defaultBaseUrl(cfg.provider)
  if (!baseUrl) {
    throw new Error(`Provider ${cfg.provider} sem baseUrl configurado`)
  }
  const messages: any[] = []
  if (cfg.systemPromptOverride || input.systemPrompt) {
    messages.push({ role: 'system', content: cfg.systemPromptOverride || input.systemPrompt })
  }
  for (const m of input.messages) {
    if (m.role === 'system') continue
    messages.push({ role: m.role, content: m.content })
  }
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      temperature: cfg.temperature,
      max_tokens: cfg.maxTokens,
      stream: false,
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`${cfg.provider} error ${res.status}: ${err}`)
  }
  const data: any = await res.json()
  return {
    content: data.choices?.[0]?.message?.content ?? '',
    tokens: {
      input: data.usage?.prompt_tokens ?? 0,
      output: data.usage?.completion_tokens ?? 0,
      total: data.usage?.total_tokens ?? 0,
    },
    model: cfg.model,
    provider: cfg.provider,
  }
}

function defaultBaseUrl(provider: LLMProvider): string {
  const map: Record<LLMProvider, string> = {
    google: '',
    openai: 'https://api.openai.com/v1',
    anthropic: 'https://api.anthropic.com/v1',
    openrouter: 'https://openrouter.ai/api/v1',
    deepseek: 'https://api.deepseek.com/v1',
    kimi: 'https://api.moonshot.cn/v1',
    qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    groq: 'https://api.groq.com/openai/v1',
    nvidia: 'https://integrate.api.nvidia.com/v1',
    mistral: 'https://api.mistral.ai/v1',
    xai: 'https://api.x.ai/v1',
    cohere: 'https://api.cohere.ai/v1',
    together: 'https://api.together.xyz/v1',
    fireworks: 'https://api.fireworks.ai/inference/v1',
    perplexity: 'https://api.perplexity.ai',
    ollama: 'http://localhost:11434/v1',
    custom: '',
  }
  return map[provider] ?? ''
}

// ── Model listing (OpenAI-compat) ─────────────────────────────────────────

/**
 * Lista modelos disponíveis de um provider via API.
 * Apenas providers OpenAI-compat que expõem /models.
 */
export async function listModelsForProvider(
  provider: LLMProvider,
  apiKey: string,
  baseUrl?: string,
): Promise<Array<{ id: string; name?: string; contextWindow?: number }>> {
  const url = baseUrl || defaultBaseUrl(provider)
  if (!url) return []
  if (provider === 'google') {
    // Gemini: usa API key via REST
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`)
    if (!res.ok) throw new Error(`Google models error ${res.status}`)
    const data: any = await res.json()
    return (data.models ?? []).map((m: any) => ({
      id: m.name?.replace('models/', '') ?? m.name,
      name: m.displayName,
      contextWindow: m.inputTokenLimit,
    }))
  }
  if (provider === 'anthropic') {
    // Anthropic não tem endpoint de listagem; retorna catálogo conhecido
    return [
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', contextWindow: 200_000 },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', contextWindow: 200_000 },
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', contextWindow: 200_000 },
    ]
  }
  // OpenAI-compat
  try {
    const res = await fetch(`${url}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!res.ok) throw new Error(`${res.status}`)
    const data: any = await res.json()
    return (data.data ?? []).map((m: any) => ({ id: m.id, name: m.id }))
  } catch {
    return []
  }
}
