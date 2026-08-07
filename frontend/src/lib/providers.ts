/**
 * Catálogo de providers de LLM suportados.
 *
 * Inspirado em Lexio (https://github.com/fsalamoni/Lexio).
 * Cada provider define:
 *  - id, label, baseUrl padrão
 *  - lista de modelos populares (a UI pode listar e o user pode customizar)
 *  - se suporta listagem dinâmica de modelos via API
 *  - formato do request (openai-compatible vs nativo)
 */
import type { LLMProvider, LLMModelInfo } from '@/types'

export interface ProviderInfo {
  id: LLMProvider
  label: string
  /** Descrição curta exibida no seletor. */
  description: string
  /** URL base padrão (vazio = inferido). */
  defaultBaseUrl?: string
  /** Onde o usuário consegue a API key. */
  apiKeyUrl: string
  /** Modelos populares pré-cadastrados. */
  models: LLMModelInfo[]
  /** Se true, o app pode listar modelos dinamicamente via API. */
  supportsModelListing: boolean
  /** Formato do body. */
  format: 'openai' | 'anthropic' | 'google' | 'custom'
}

export const PROVIDERS: ProviderInfo[] = [
  {
    id: 'google',
    label: 'Google Gemini',
    description: 'Gemini 2.5 Flash, Pro e variantes',
    apiKeyUrl: 'https://aistudio.google.com/apikey',
    format: 'google',
    supportsModelListing: true,
    models: [
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', contextWindow: 1_000_000, supportsTools: true, supportsVision: true },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', contextWindow: 2_000_000, supportsTools: true, supportsVision: true },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', contextWindow: 1_000_000, supportsTools: true, supportsVision: true },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', contextWindow: 2_000_000, supportsTools: true, supportsVision: true },
    ],
  },
  {
    id: 'openai',
    label: 'OpenAI',
    description: 'GPT-4o, GPT-4 Turbo, o1',
    defaultBaseUrl: 'https://api.openai.com/v1',
    apiKeyUrl: 'https://platform.openai.com/api-keys',
    format: 'openai',
    supportsModelListing: true,
    models: [
      { id: 'gpt-4o-mini', name: 'GPT-4o mini', contextWindow: 128_000, supportsTools: true, supportsVision: true },
      { id: 'gpt-4o', name: 'GPT-4o', contextWindow: 128_000, supportsTools: true, supportsVision: true },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', contextWindow: 128_000, supportsTools: true, supportsVision: true },
      { id: 'o1-mini', name: 'o1 mini', contextWindow: 128_000, supportsTools: true },
      { id: 'o1', name: 'o1', contextWindow: 200_000, supportsTools: true },
    ],
  },
  {
    id: 'anthropic',
    label: 'Anthropic Claude',
    description: 'Claude 3.5 Sonnet, Opus, Haiku',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    apiKeyUrl: 'https://console.anthropic.com/settings/keys',
    format: 'anthropic',
    supportsModelListing: false,
    models: [
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', contextWindow: 200_000, supportsTools: true, supportsVision: true },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', contextWindow: 200_000, supportsTools: true },
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', contextWindow: 200_000, supportsTools: true, supportsVision: true },
    ],
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    description: '300+ modelos via uma API',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    apiKeyUrl: 'https://openrouter.ai/keys',
    format: 'openai',
    supportsModelListing: true,
    models: [
      { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', contextWindow: 200_000, supportsTools: true },
      { id: 'openai/gpt-4o-mini', name: 'GPT-4o mini', contextWindow: 128_000, supportsTools: true },
      { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', contextWindow: 1_000_000, supportsTools: true },
      { id: 'meta-llama/llama-3.1-70b-instruct', name: 'Llama 3.1 70B', contextWindow: 131_000 },
    ],
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    description: 'DeepSeek V3 e R1',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    apiKeyUrl: 'https://platform.deepseek.com/api_keys',
    format: 'openai',
    supportsModelListing: false,
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek V3', contextWindow: 64_000, supportsTools: true },
      { id: 'deepseek-reasoner', name: 'DeepSeek R1', contextWindow: 64_000 },
    ],
  },
  {
    id: 'kimi',
    label: 'Kimi (Moonshot)',
    description: 'Modelos Moonshot v1, k2',
    defaultBaseUrl: 'https://api.moonshot.cn/v1',
    apiKeyUrl: 'https://platform.moonshot.cn/console/api-keys',
    format: 'openai',
    supportsModelListing: false,
    models: [
      { id: 'moonshot-v1-128k', name: 'Moonshot v1 128k', contextWindow: 131_000 },
      { id: 'moonshot-v1-32k', name: 'Moonshot v1 32k', contextWindow: 32_000 },
    ],
  },
  {
    id: 'qwen',
    label: 'Alibaba Qwen (DashScope)',
    description: 'Compatível com OpenAI',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKeyUrl: 'https://dashscope.console.aliyun.com/apiKey',
    format: 'openai',
    supportsModelListing: true,
    models: [
      { id: 'qwen-plus', name: 'Qwen Plus', contextWindow: 128_000 },
      { id: 'qwen-turbo', name: 'Qwen Turbo', contextWindow: 1_000_000 },
      { id: 'qwen-max', name: 'Qwen Max', contextWindow: 32_000 },
    ],
  },
  {
    id: 'groq',
    label: 'Groq',
    description: 'Inferência ultrarrápida',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    apiKeyUrl: 'https://console.groq.com/keys',
    format: 'openai',
    supportsModelListing: true,
    models: [
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', contextWindow: 128_000, supportsTools: true },
      { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B', contextWindow: 128_000, supportsTools: true },
      { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B', contextWindow: 32_000 },
    ],
  },
  {
    id: 'nvidia',
    label: 'NVIDIA NIM',
    description: 'Modelos NVIDIA via NIM',
    defaultBaseUrl: 'https://integrate.api.nvidia.com/v1',
    apiKeyUrl: 'https://build.nvidia.com/explore/discover',
    format: 'openai',
    supportsModelListing: true,
    models: [
      { id: 'meta/llama-3.1-70b-instruct', name: 'Llama 3.1 70B', contextWindow: 131_000 },
      { id: 'nvidia/nemotron-4-340b-instruct', name: 'Nemotron 340B', contextWindow: 4_096 },
    ],
  },
  {
    id: 'mistral',
    label: 'Mistral AI',
    description: 'Mistral Large, Medium, Small',
    defaultBaseUrl: 'https://api.mistral.ai/v1',
    apiKeyUrl: 'https://console.mistral.ai/api-keys',
    format: 'openai',
    supportsModelListing: true,
    models: [
      { id: 'mistral-large-latest', name: 'Mistral Large', contextWindow: 128_000, supportsTools: true },
      { id: 'mistral-small-latest', name: 'Mistral Small', contextWindow: 128_000, supportsTools: true },
    ],
  },
  {
    id: 'xai',
    label: 'xAI (Grok)',
    description: 'Grok 2 e variantes',
    defaultBaseUrl: 'https://api.x.ai/v1',
    apiKeyUrl: 'https://console.x.ai',
    format: 'openai',
    supportsModelListing: true,
    models: [
      { id: 'grok-2-latest', name: 'Grok 2', contextWindow: 131_000, supportsTools: true },
      { id: 'grok-2-mini', name: 'Grok 2 mini', contextWindow: 131_000, supportsTools: true },
    ],
  },
  {
    id: 'cohere',
    label: 'Cohere',
    description: 'Command R+, R',
    defaultBaseUrl: 'https://api.cohere.ai/v1',
    apiKeyUrl: 'https://dashboard.cohere.com/api-keys',
    format: 'openai',
    supportsModelListing: true,
    models: [
      { id: 'command-r-plus', name: 'Command R+', contextWindow: 128_000, supportsTools: true },
      { id: 'command-r', name: 'Command R', contextWindow: 128_000, supportsTools: true },
    ],
  },
  {
    id: 'together',
    label: 'Together AI',
    description: 'Open-source models hospedados',
    defaultBaseUrl: 'https://api.together.xyz/v1',
    apiKeyUrl: 'https://api.together.xyz/settings/api-keys',
    format: 'openai',
    supportsModelListing: true,
    models: [
      { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', name: 'Llama 3.3 70B Turbo', contextWindow: 131_000 },
      { id: 'Qwen/Qwen2.5-72B-Instruct-Turbo', name: 'Qwen 2.5 72B Turbo', contextWindow: 32_000 },
    ],
  },
  {
    id: 'fireworks',
    label: 'Fireworks AI',
    description: 'Modelos rápidos e baratos',
    defaultBaseUrl: 'https://api.fireworks.ai/inference/v1',
    apiKeyUrl: 'https://fireworks.ai/account/api-keys',
    format: 'openai',
    supportsModelListing: true,
    models: [
      { id: 'accounts/fireworks/models/llama-v3p3-70b-instruct', name: 'Llama 3.3 70B', contextWindow: 131_000 },
    ],
  },
  {
    id: 'perplexity',
    label: 'Perplexity',
    description: 'Modelos com busca online',
    defaultBaseUrl: 'https://api.perplexity.ai',
    apiKeyUrl: 'https://www.perplexity.ai/settings/api',
    format: 'openai',
    supportsModelListing: false,
    models: [
      { id: 'llama-3.1-sonar-large-128k-online', name: 'Sonar Large Online', contextWindow: 127_000 },
      { id: 'llama-3.1-sonar-small-128k-online', name: 'Sonar Small Online', contextWindow: 127_000 },
    ],
  },
  {
    id: 'ollama',
    label: 'Ollama (local)',
    description: 'Modelos rodando localmente',
    defaultBaseUrl: 'http://localhost:11434/v1',
    apiKeyUrl: '',
    format: 'openai',
    supportsModelListing: true,
    models: [
      { id: 'llama3.2', name: 'Llama 3.2', contextWindow: 128_000 },
      { id: 'qwen2.5', name: 'Qwen 2.5', contextWindow: 32_000 },
      { id: 'mistral', name: 'Mistral', contextWindow: 32_000 },
    ],
  },
  {
    id: 'custom',
    label: 'Endpoint customizado',
    description: 'Qualquer API OpenAI-compatible',
    apiKeyUrl: '',
    format: 'openai',
    supportsModelListing: false,
    models: [],
  },
]

export function getProviderInfo(id: LLMProvider): ProviderInfo | undefined {
  return PROVIDERS.find((p) => p.id === id)
}
