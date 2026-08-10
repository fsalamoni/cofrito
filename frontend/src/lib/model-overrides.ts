/**
 * Model overrides — preços (USD/1M tokens), tier, capabilities e descrições
 * conhecidos para os modelos mais usados.
 *
 * Estes overrides têm PRIORIDADE sobre a inferência automática.
 * Modelos sem override ainda recebem inferência automática (tier, capabilities,
 * agentFit, isFree) a partir do id + label — apenas preços não são inferidos.
 *
 * Preços cotados em USD por 1 milhão de tokens. 0 = gratuito.
 * Última atualização: 2026-08-10.
 */

import type { ModelCapability } from '@/types'

export interface ModelOverride {
  /** Tier (perfil) — substitui a inferência. */
  tier?: 'fast' | 'balanced' | 'premium'
  /** Capacidades (texto, imagem, áudio, vídeo) — substitui a inferência. */
  capabilities?: ModelCapability[]
  /** Preço por 1M tokens de ENTRADA (USD). */
  inputCost?: number
  /** Preço por 1M tokens de SAÍDA (USD). */
  outputCost?: number
  /** Descrição curta opcional. */
  description?: string
}

export const MODEL_OVERRIDES: Record<string, ModelOverride> = {
  // ── Google Gemini ─────────────────────────────────────────────────────────
  'gemini-2.5-pro':            { tier: 'premium',  inputCost: 1.25,  outputCost: 10.0,  capabilities: ['text', 'image'], description: 'Topo de linha do Google — raciocínio avançado + contexto de 2M tokens.' },
  'gemini-2.5-flash':          { tier: 'balanced', inputCost: 0.30,  outputCost: 2.50,  capabilities: ['text', 'image'], description: 'Equilíbrio ideal entre preço e capacidade — multimodal.' },
  'gemini-2.5-flash-lite':     { tier: 'fast',     inputCost: 0.10,  outputCost: 0.40,  capabilities: ['text', 'image'], description: 'Versão ultra-econômica do Flash — para alto volume.' },
  'gemini-2.0-flash':          { tier: 'fast',     inputCost: 0.10,  outputCost: 0.40,  capabilities: ['text', 'image'], description: 'Geração anterior — ainda útil e muito barato.' },
  'gemini-2.0-flash-lite':     { tier: 'fast',     inputCost: 0.025, outputCost: 0.10,  capabilities: ['text', 'image'], description: 'Lite da geração 2.0 — mais barato que o Flash Lite 2.5.' },
  'gemini-2.0-pro-exp':        { tier: 'premium',  inputCost: 1.25,  outputCost: 5.0,   capabilities: ['text', 'image'], description: 'Pro experimental — descontinuado, use 2.5 Pro.' },
  'gemini-1.5-pro':            { tier: 'balanced', inputCost: 1.25,  outputCost: 5.0,   capabilities: ['text', 'image'], description: 'Geração anterior, ainda robusto. Contexto 2M.' },
  'gemini-1.5-flash':          { tier: 'fast',     inputCost: 0.075, outputCost: 0.30,  capabilities: ['text', 'image'], description: 'Flash da geração 1.5 — barato e capaz.' },
  'gemini-1.5-flash-8b':       { tier: 'fast',     inputCost: 0.0375, outputCost: 0.15, capabilities: ['text', 'image'], description: 'Versão 8B — ultra-econômico.' },
  'gemini-1.0-pro':            { tier: 'fast',     inputCost: 0.50,  outputCost: 1.50,  capabilities: ['text'] },
  'imagen-3.0-generate-002':   { tier: 'balanced', inputCost: 0.03,  outputCost: 0.03,  capabilities: ['image'], description: 'Geração de imagens do Google (por imagem).' },
  'imagen-4.0-generate-preview-06-06': { tier: 'premium', inputCost: 0.04, outputCost: 0.04, capabilities: ['image'] },
  'imagen-4.0-ultra-generate-preview-06-06': { tier: 'premium', inputCost: 0.06, outputCost: 0.06, capabilities: ['image'] },
  'veo-2.0-generate-001':      { tier: 'premium',  inputCost: 0.35,  outputCost: 0.35,  capabilities: ['video'], description: 'Geração de vídeo do Google — por segundo.' },
  'veo-3.0-generate-preview':  { tier: 'premium',  inputCost: 0.75,  outputCost: 0.75,  capabilities: ['video'] },
  'veo-3.0-fast-generate-preview': { tier: 'balanced', inputCost: 0.40, outputCost: 0.40, capabilities: ['video'] },

  // ── OpenAI ────────────────────────────────────────────────────────────────
  'gpt-5':                     { tier: 'premium',  inputCost: 5.0,   outputCost: 15.0,  capabilities: ['text', 'image'] },
  'gpt-5-mini':                { tier: 'balanced', inputCost: 0.25,  outputCost: 2.0,   capabilities: ['text', 'image'] },
  'gpt-5-nano':                { tier: 'fast',     inputCost: 0.05,  outputCost: 0.40,  capabilities: ['text', 'image'] },
  'gpt-5-codex':               { tier: 'premium',  inputCost: 5.0,   outputCost: 15.0,  capabilities: ['text'] },
  'gpt-4.1':                   { tier: 'premium',  inputCost: 2.0,   outputCost: 8.0,   capabilities: ['text', 'image'], description: 'Topo da família GPT-4 — 1M contexto.' },
  'gpt-4.1-mini':              { tier: 'fast',     inputCost: 0.40,  outputCost: 1.60,  capabilities: ['text', 'image'], description: 'Mini do 4.1 — excelente custo-benefício.' },
  'gpt-4.1-nano':              { tier: 'fast',     inputCost: 0.10,  outputCost: 0.40,  capabilities: ['text', 'image'] },
  'gpt-4o':                    { tier: 'balanced', inputCost: 2.50,  outputCost: 10.0,  capabilities: ['text', 'image', 'audio'], description: 'Multimodal nativo — texto, imagem, áudio.' },
  'gpt-4o-mini':               { tier: 'fast',     inputCost: 0.15,  outputCost: 0.60,  capabilities: ['text', 'image', 'audio'] },
  'gpt-4-turbo':               { tier: 'balanced', inputCost: 10.0,  outputCost: 30.0,  capabilities: ['text', 'image'] },
  'o1':                        { tier: 'premium',  inputCost: 15.0,  outputCost: 60.0,  capabilities: ['text'], description: 'Raciocínio profundo — OpenAI.' },
  'o1-pro':                    { tier: 'premium',  inputCost: 150.0, outputCost: 600.0, capabilities: ['text'] },
  'o1-mini':                   { tier: 'balanced', inputCost: 3.0,   outputCost: 12.0,  capabilities: ['text'] },
  'o1-preview':                { tier: 'premium',  inputCost: 15.0,  outputCost: 60.0,  capabilities: ['text'] },
  'o3':                        { tier: 'premium',  inputCost: 10.0,  outputCost: 40.0,  capabilities: ['text'], description: 'Raciocínio avançado (substituiu o1).' },
  'o3-pro':                    { tier: 'premium',  inputCost: 20.0,  outputCost: 80.0,  capabilities: ['text'] },
  'o3-mini':                   { tier: 'balanced', inputCost: 1.10,  outputCost: 4.40,  capabilities: ['text'] },
  'o3-deep-research':          { tier: 'premium',  inputCost: 10.0,  outputCost: 40.0,  capabilities: ['text'] },
  'o4-mini':                   { tier: 'balanced', inputCost: 1.10,  outputCost: 4.40,  capabilities: ['text', 'image'] },
  'gpt-3.5-turbo':             { tier: 'fast',     inputCost: 0.50,  outputCost: 1.50,  capabilities: ['text'] },

  // ── Anthropic Claude ─────────────────────────────────────────────────────
  'claude-opus-4-1-20250805':  { tier: 'premium',  inputCost: 15.0,  outputCost: 75.0,  capabilities: ['text', 'image'], description: 'Topo da Anthropic — Opus 4.1.' },
  'claude-opus-4-20250514':    { tier: 'premium',  inputCost: 15.0,  outputCost: 75.0,  capabilities: ['text', 'image'] },
  'claude-sonnet-4-5':         { tier: 'premium',  inputCost: 3.0,   outputCost: 15.0,  capabilities: ['text', 'image'] },
  'claude-sonnet-4-5-20250929':{ tier: 'premium',  inputCost: 3.0,   outputCost: 15.0,  capabilities: ['text', 'image'] },
  'claude-sonnet-4-20250514':  { tier: 'balanced', inputCost: 3.0,   outputCost: 15.0,  capabilities: ['text', 'image'] },
  'claude-3-7-sonnet-20250219':{ tier: 'premium',  inputCost: 3.0,   outputCost: 15.0,  capabilities: ['text', 'image'] },
  'claude-3-5-sonnet-20241022':{ tier: 'balanced', inputCost: 3.0,   outputCost: 15.0,  capabilities: ['text', 'image'] },
  'claude-3-5-haiku-20241022': { tier: 'fast',     inputCost: 0.80,  outputCost: 4.0,   capabilities: ['text'] },
  'claude-3-haiku-20240307':   { tier: 'fast',     inputCost: 0.25,  outputCost: 1.25,  capabilities: ['text'] },
  'claude-3-opus-20240229':    { tier: 'premium',  inputCost: 15.0,  outputCost: 75.0,  capabilities: ['text', 'image'] },
  'claude-3-sonnet-20240229':  { tier: 'balanced', inputCost: 3.0,   outputCost: 15.0,  capabilities: ['text', 'image'] },

  // ── DeepSeek ────────────────────────────────────────────────────────────
  'deepseek-chat':             { tier: 'balanced', inputCost: 0.27,  outputCost: 1.10,  capabilities: ['text'], description: 'DeepSeek V3 — excelente custo-benefício.' },
  'deepseek-reasoner':         { tier: 'premium',  inputCost: 0.55,  outputCost: 2.19,  capabilities: ['text'], description: 'DeepSeek R1 — raciocínio aberto.' },
  'deepseek-coder':            { tier: 'balanced', inputCost: 0.27,  outputCost: 1.10,  capabilities: ['text'] },

  // ── Kimi / Moonshot ──────────────────────────────────────────────────────
  'moonshot-v1-128k':          { tier: 'balanced', inputCost: 2.0,   outputCost: 2.0,   capabilities: ['text'] },
  'moonshot-v1-32k':           { tier: 'fast',     inputCost: 1.0,   outputCost: 1.0,   capabilities: ['text'] },
  'moonshot-v1-8k':            { tier: 'fast',     inputCost: 1.0,   outputCost: 1.0,   capabilities: ['text'] },
  'kimi-k2-instruct':          { tier: 'premium',  inputCost: 0.60,  outputCost: 2.50,  capabilities: ['text'] },
  'kimi-k2-0711-preview':      { tier: 'premium',  inputCost: 0.60,  outputCost: 2.50,  capabilities: ['text'] },
  'kimi-latest':               { tier: 'premium',  inputCost: 2.0,   outputCost: 5.0,   capabilities: ['text'] },

  // ── Qwen (Alibaba) ──────────────────────────────────────────────────────
  'qwen-max':                  { tier: 'premium',  inputCost: 0.40,  outputCost: 1.20,  capabilities: ['text'] },
  'qwen-plus':                 { tier: 'balanced', inputCost: 0.0008,outputCost: 0.002, capabilities: ['text'] },
  'qwen-turbo':                { tier: 'fast',     inputCost: 0.0003,outputCost: 0.0006, capabilities: ['text'] },
  'qwen3-max':                 { tier: 'premium',  inputCost: 0.60,  outputCost: 1.80,  capabilities: ['text'] },
  'qwen3-235b-a22b':           { tier: 'premium',  inputCost: 0.20,  outputCost: 0.60,  capabilities: ['text'] },
  'qwen3-30b-a3b':             { tier: 'balanced', inputCost: 0.08,  outputCost: 0.24,  capabilities: ['text'] },
  'qwen3-coder-plus':          { tier: 'balanced', inputCost: 0.40,  outputCost: 1.20,  capabilities: ['text'] },
  'qwen-long':                 { tier: 'balanced', inputCost: 0.0005,outputCost: 0.002, capabilities: ['text'] },

  // ── Groq ────────────────────────────────────────────────────────────────
  'llama-3.3-70b-versatile':   { tier: 'balanced', inputCost: 0.59,  outputCost: 0.79,  capabilities: ['text'] },
  'llama-3.1-8b-instant':      { tier: 'fast',     inputCost: 0.05,  outputCost: 0.08,  capabilities: ['text'] },
  'llama-3.1-70b-versatile':   { tier: 'balanced', inputCost: 0.59,  outputCost: 0.79,  capabilities: ['text'] },
  'mixtral-8x7b-32768':        { tier: 'fast',     inputCost: 0.24,  outputCost: 0.24,  capabilities: ['text'] },
  'gemma2-9b-it':              { tier: 'fast',     inputCost: 0.20,  outputCost: 0.20,  capabilities: ['text'] },

  // ── Mistral ─────────────────────────────────────────────────────────────
  'mistral-large-latest':      { tier: 'premium',  inputCost: 2.0,   outputCost: 6.0,   capabilities: ['text'] },
  'mistral-medium-latest':     { tier: 'balanced', inputCost: 2.7,   outputCost: 8.1,   capabilities: ['text'] },
  'mistral-small-latest':      { tier: 'fast',     inputCost: 0.20,  outputCost: 0.60,  capabilities: ['text'] },
  'open-mistral-nemo':         { tier: 'fast',     inputCost: 0.15,  outputCost: 0.15,  capabilities: ['text'] },
  'codestral-latest':          { tier: 'balanced', inputCost: 0.30,  outputCost: 0.90,  capabilities: ['text'] },
  'pixtral-large-latest':      { tier: 'premium',  inputCost: 2.0,   outputCost: 6.0,   capabilities: ['text', 'image'] },

  // ── xAI Grok ────────────────────────────────────────────────────────────
  'grok-4':                    { tier: 'premium',  inputCost: 3.0,   outputCost: 15.0,  capabilities: ['text', 'image'] },
  'grok-3':                    { tier: 'premium',  inputCost: 3.0,   outputCost: 15.0,  capabilities: ['text', 'image'] },
  'grok-3-mini':               { tier: 'fast',     inputCost: 0.30,  outputCost: 0.50,  capabilities: ['text'] },
  'grok-2':                    { tier: 'balanced', inputCost: 2.0,   outputCost: 10.0,  capabilities: ['text', 'image'] },
  'grok-2-vision':             { tier: 'balanced', inputCost: 2.0,   outputCost: 10.0,  capabilities: ['text', 'image'] },

  // ── Cohere ─────────────────────────────────────────────────────────────
  'command-a-03-2025':         { tier: 'premium',  inputCost: 2.50,  outputCost: 10.0,  capabilities: ['text'] },
  'command-r-plus-08-2024':    { tier: 'balanced', inputCost: 2.50,  outputCost: 10.0,  capabilities: ['text'] },
  'command-r-08-2024':         { tier: 'fast',     inputCost: 0.15,  outputCost: 0.60,  capabilities: ['text'] },
  'command-light':             { tier: 'fast',     inputCost: 0.30,  outputCost: 0.60,  capabilities: ['text'] },
  'embed-english-v3.0':        { tier: 'fast',     inputCost: 0.10,  outputCost: 0.0,   capabilities: ['text'] },

  // ── Together ───────────────────────────────────────────────────────────
  'meta-llama/Llama-3.3-70B-Instruct-Turbo': { tier: 'balanced', inputCost: 0.88, outputCost: 0.88, capabilities: ['text'] },
  'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo': { tier: 'premium', inputCost: 3.50, outputCost: 3.50, capabilities: ['text'] },
  'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo': { tier: 'balanced', inputCost: 0.88, outputCost: 0.88, capabilities: ['text'] },
  'Qwen/Qwen2.5-72B-Instruct-Turbo': { tier: 'balanced', inputCost: 0.88, outputCost: 0.88, capabilities: ['text'] },
  'deepseek-ai/DeepSeek-V3':   { tier: 'premium',  inputCost: 0.90,  outputCost: 0.90,  capabilities: ['text'] },
  'deepseek-ai/DeepSeek-R1':   { tier: 'premium',  inputCost: 3.0,   outputCost: 7.0,   capabilities: ['text'] },

  // ── Fireworks ──────────────────────────────────────────────────────────
  'accounts/fireworks/models/llama-v3p3-70b-instruct': { tier: 'balanced', inputCost: 0.90, outputCost: 0.90, capabilities: ['text'] },
  'accounts/fireworks/models/deepseek-v3': { tier: 'premium', inputCost: 0.90, outputCost: 0.90, capabilities: ['text'] },
  'accounts/fireworks/models/deepseek-r1': { tier: 'premium', inputCost: 3.0, outputCost: 8.0, capabilities: ['text'] },

  // ── Perplexity ─────────────────────────────────────────────────────────
  'sonar-pro':                 { tier: 'premium',  inputCost: 3.0,   outputCost: 15.0,  capabilities: ['text'] },
  'sonar':                     { tier: 'balanced', inputCost: 1.0,   outputCost: 1.0,   capabilities: ['text'] },
  'sonar-reasoning-pro':       { tier: 'premium',  inputCost: 2.0,   outputCost: 8.0,   capabilities: ['text'] },
  'sonar-reasoning':           { tier: 'balanced', inputCost: 1.0,   outputCost: 5.0,   capabilities: ['text'] },

  // ── NVIDIA NIM ─────────────────────────────────────────────────────────
  'nvidia/llama-3.3-nemotron-super-49b-v1': { tier: 'balanced', inputCost: 0.10, outputCost: 0.40, capabilities: ['text'] },
  'nvidia/llama-3.1-nemotron-70b-instruct': { tier: 'premium', inputCost: 1.20, outputCost: 1.20, capabilities: ['text'] },
  'meta/llama-3.1-405b-instruct': { tier: 'premium', inputCost: 2.70, outputCost: 2.70, capabilities: ['text'] },
  'meta/llama-3.1-70b-instruct': { tier: 'balanced', inputCost: 0.40, outputCost: 0.40, capabilities: ['text'] },
  'mistralai/mixtral-8x7b-instruct-v0.1': { tier: 'fast', inputCost: 0.10, outputCost: 0.10, capabilities: ['text'] },

  // ── Ollama (gratuito, local) ───────────────────────────────────────────
  'llama3.2':                  { tier: 'balanced', inputCost: 0, outputCost: 0, capabilities: ['text'] },
  'qwen2.5:14b':               { tier: 'balanced', inputCost: 0, outputCost: 0, capabilities: ['text'] },
  'mistral':                   { tier: 'fast',     inputCost: 0, outputCost: 0, capabilities: ['text'] },
  'llama3.1':                  { tier: 'balanced', inputCost: 0, outputCost: 0, capabilities: ['text'] },
  'gemma2:27b':                { tier: 'balanced', inputCost: 0, outputCost: 0, capabilities: ['text'] },
  'gemma2:9b':                 { tier: 'fast',     inputCost: 0, outputCost: 0, capabilities: ['text'] },
  'gemma3:27b':                { tier: 'balanced', inputCost: 0, outputCost: 0, capabilities: ['text'] },
  'gemma3:12b':                { tier: 'balanced', inputCost: 0, outputCost: 0, capabilities: ['text'] },
  'gemma3:4b':                 { tier: 'fast',     inputCost: 0, outputCost: 0, capabilities: ['text'] },
  'phi3:14b':                  { tier: 'balanced', inputCost: 0, outputCost: 0, capabilities: ['text'] },
  'phi3:3.8b':                 { tier: 'fast',     inputCost: 0, outputCost: 0, capabilities: ['text'] },
  'codellama:34b':             { tier: 'balanced', inputCost: 0, outputCost: 0, capabilities: ['text'] },
  'codellama:13b':             { tier: 'fast',     inputCost: 0, outputCost: 0, capabilities: ['text'] },
  'deepseek-r1':               { tier: 'premium',  inputCost: 0, outputCost: 0, capabilities: ['text'] },
  'deepseek-coder-v2':         { tier: 'balanced', inputCost: 0, outputCost: 0, capabilities: ['text'] },
  'qwen2.5:7b':                { tier: 'fast',     inputCost: 0, outputCost: 0, capabilities: ['text'] },
  'qwen2.5:32b':               { tier: 'balanced', inputCost: 0, outputCost: 0, capabilities: ['text'] },
  'qwen2.5:72b':               { tier: 'premium',  inputCost: 0, outputCost: 0, capabilities: ['text'] },
  'qwen3:30b':                 { tier: 'balanced', inputCost: 0, outputCost: 0, capabilities: ['text'] },
  'qwen3:32b':                 { tier: 'balanced', inputCost: 0, outputCost: 0, capabilities: ['text'] },
  'qwen3:235b':                { tier: 'premium',  inputCost: 0, outputCost: 0, capabilities: ['text'] },
  'llama3.3':                  { tier: 'balanced', inputCost: 0, outputCost: 0, capabilities: ['text'] },
  'llama3.3:70b':              { tier: 'balanced', inputCost: 0, outputCost: 0, capabilities: ['text'] },
  'llama-guard3:8b':           { tier: 'fast',     inputCost: 0, outputCost: 0, capabilities: ['text'] },
  'nomic-embed-text':          { tier: 'fast',     inputCost: 0, outputCost: 0, capabilities: ['text'] },

  // ── OpenRouter (preços REAIS por 1M tokens, fonte: openrouter.ai) ──────────
  // Estes são os preços cobrados pelo OpenRouter para CADA modelo.
  // Formato: 'provider/modelo' como id (ex: 'openai/gpt-4o').

  // OpenAI via OpenRouter
  'openai/gpt-5':                       { tier: 'premium',  inputCost: 1.25,  outputCost: 10.0,  capabilities: ['text', 'image'] },
  'openai/gpt-5-chat':                  { tier: 'premium',  inputCost: 1.25,  outputCost: 10.0,  capabilities: ['text', 'image'] },
  'openai/gpt-5-mini':                  { tier: 'balanced', inputCost: 0.25,  outputCost: 2.0,   capabilities: ['text', 'image'] },
  'openai/gpt-5-nano':                  { tier: 'fast',     inputCost: 0.05,  outputCost: 0.40,  capabilities: ['text', 'image'] },
  'openai/gpt-4.1':                     { tier: 'premium',  inputCost: 2.0,   outputCost: 8.0,   capabilities: ['text', 'image'] },
  'openai/gpt-4.1-mini':                { tier: 'fast',     inputCost: 0.40,  outputCost: 1.60,  capabilities: ['text', 'image'] },
  'openai/gpt-4.1-nano':                { tier: 'fast',     inputCost: 0.10,  outputCost: 0.40,  capabilities: ['text', 'image'] },
  'openai/gpt-4o':                      { tier: 'balanced', inputCost: 2.50,  outputCost: 10.0,  capabilities: ['text', 'image', 'audio'] },
  'openai/gpt-4o-mini':                 { tier: 'fast',     inputCost: 0.15,  outputCost: 0.60,  capabilities: ['text', 'image', 'audio'] },
  'openai/o1':                          { tier: 'premium',  inputCost: 15.0,  outputCost: 60.0,  capabilities: ['text'] },
  'openai/o1-mini':                     { tier: 'balanced', inputCost: 3.0,   outputCost: 12.0,  capabilities: ['text'] },
  'openai/o1-pro':                      { tier: 'premium',  inputCost: 150.0, outputCost: 600.0, capabilities: ['text'] },
  'openai/o3':                          { tier: 'premium',  inputCost: 10.0,  outputCost: 40.0,  capabilities: ['text'] },
  'openai/o3-mini':                     { tier: 'balanced', inputCost: 1.10,  outputCost: 4.40,  capabilities: ['text'] },
  'openai/o3-pro':                      { tier: 'premium',  inputCost: 20.0,  outputCost: 80.0,  capabilities: ['text'] },
  'openai/o4-mini':                     { tier: 'balanced', inputCost: 1.10,  outputCost: 4.40,  capabilities: ['text', 'image'] },
  'openai/gpt-3.5-turbo':               { tier: 'fast',     inputCost: 0.50,  outputCost: 1.50,  capabilities: ['text'] },
  'openai/gpt-3.5-turbo-instruct':      { tier: 'fast',     inputCost: 0.50,  outputCost: 1.50,  capabilities: ['text'] },
  'openai/gpt-4-turbo':                 { tier: 'balanced', inputCost: 10.0,  outputCost: 30.0,  capabilities: ['text', 'image'] },
  'openai/gpt-4':                       { tier: 'balanced', inputCost: 30.0,  outputCost: 60.0,  capabilities: ['text', 'image'] },

  // Anthropic via OpenRouter
  'anthropic/claude-opus-4':            { tier: 'premium',  inputCost: 15.0,  outputCost: 75.0,  capabilities: ['text', 'image'] },
  'anthropic/claude-opus-4.1':          { tier: 'premium',  inputCost: 15.0,  outputCost: 75.0,  capabilities: ['text', 'image'] },
  'anthropic/claude-sonnet-4':          { tier: 'premium',  inputCost: 3.0,   outputCost: 15.0,  capabilities: ['text', 'image'] },
  'anthropic/claude-sonnet-4.5':        { tier: 'premium',  inputCost: 3.0,   outputCost: 15.0,  capabilities: ['text', 'image'] },
  'anthropic/claude-3.7-sonnet':        { tier: 'premium',  inputCost: 3.0,   outputCost: 15.0,  capabilities: ['text', 'image'] },
  'anthropic/claude-3.5-sonnet':        { tier: 'balanced', inputCost: 3.0,   outputCost: 15.0,  capabilities: ['text', 'image'] },
  'anthropic/claude-3.5-haiku':         { tier: 'fast',     inputCost: 0.80,  outputCost: 4.0,   capabilities: ['text'] },
  'anthropic/claude-3-haiku':           { tier: 'fast',     inputCost: 0.25,  outputCost: 1.25,  capabilities: ['text'] },
  'anthropic/claude-3-opus':            { tier: 'premium',  inputCost: 15.0,  outputCost: 75.0,  capabilities: ['text', 'image'] },
  'anthropic/claude-3-sonnet':          { tier: 'balanced', inputCost: 3.0,   outputCost: 15.0,  capabilities: ['text', 'image'] },

  // Google via OpenRouter
  'google/gemini-2.5-pro':              { tier: 'premium',  inputCost: 1.25,  outputCost: 10.0,  capabilities: ['text', 'image'] },
  'google/gemini-2.5-flash':            { tier: 'balanced', inputCost: 0.30,  outputCost: 2.50,  capabilities: ['text', 'image'] },
  'google/gemini-2.5-flash-lite':       { tier: 'fast',     inputCost: 0.10,  outputCost: 0.40,  capabilities: ['text', 'image'] },
  'google/gemini-2.0-flash':            { tier: 'fast',     inputCost: 0.10,  outputCost: 0.40,  capabilities: ['text', 'image'] },
  'google/gemini-2.0-flash-lite':       { tier: 'fast',     inputCost: 0.025, outputCost: 0.10,  capabilities: ['text', 'image'] },
  'google/gemini-2.0-pro-exp':          { tier: 'premium',  inputCost: 1.25,  outputCost: 5.0,   capabilities: ['text', 'image'] },
  'google/gemini-1.5-pro':              { tier: 'balanced', inputCost: 1.25,  outputCost: 5.0,   capabilities: ['text', 'image'] },
  'google/gemini-1.5-flash':            { tier: 'fast',     inputCost: 0.075, outputCost: 0.30,  capabilities: ['text', 'image'] },
  'google/gemini-1.5-flash-8b':         { tier: 'fast',     inputCost: 0.0375, outputCost: 0.15, capabilities: ['text', 'image'] },
  'google/gemini-pro-vision':           { tier: 'balanced', inputCost: 0.50,  outputCost: 1.50,  capabilities: ['text', 'image'] },
  'google/gemini-3.5-flash':            { tier: 'balanced', inputCost: 0.30,  outputCost: 2.50,  capabilities: ['text', 'image'] },
  'google/gemini-3.5-flash-lite':       { tier: 'fast',     inputCost: 0.10,  outputCost: 0.40,  capabilities: ['text', 'image'] },
  'google/gemini-3.6-flash':            { tier: 'balanced', inputCost: 0.30,  outputCost: 2.50,  capabilities: ['text', 'image'] },

  // DeepSeek via OpenRouter
  'deepseek/deepseek-chat':             { tier: 'balanced', inputCost: 0.27,  outputCost: 1.10,  capabilities: ['text'] },
  'deepseek/deepseek-chat-v3':          { tier: 'balanced', inputCost: 0.27,  outputCost: 1.10,  capabilities: ['text'] },
  'deepseek/deepseek-reasoner':         { tier: 'premium',  inputCost: 0.55,  outputCost: 2.19,  capabilities: ['text'] },
  'deepseek/deepseek-r1':               { tier: 'premium',  inputCost: 0.55,  outputCost: 2.19,  capabilities: ['text'] },
  'deepseek/deepseek-v3':               { tier: 'balanced', inputCost: 0.27,  outputCost: 1.10,  capabilities: ['text'] },
  'deepseek/deepseek-v3-flash':         { tier: 'fast',     inputCost: 0.10,  outputCost: 0.40,  capabilities: ['text'] },
  'deepseek/deepseek-v3-flash-latest':  { tier: 'fast',     inputCost: 0.10,  outputCost: 0.40,  capabilities: ['text'] },
  'deepseek/deepseek-v3.1':             { tier: 'balanced', inputCost: 0.27,  outputCost: 1.10,  capabilities: ['text'] },
  'deepseek/deepseek-v3.1-terminus':    { tier: 'balanced', inputCost: 0.27,  outputCost: 1.10,  capabilities: ['text'] },
  'deepseek/deepseek-v3.2':             { tier: 'balanced', inputCost: 0.27,  outputCost: 1.10,  capabilities: ['text'] },
  'deepseek/deepseek-v3.2-exp':         { tier: 'balanced', inputCost: 0.27,  outputCost: 1.10,  capabilities: ['text'] },
  'deepseek/deepseek-coder':            { tier: 'balanced', inputCost: 0.27,  outputCost: 1.10,  capabilities: ['text'] },
  'deepseek/deepseek-coder-v2':         { tier: 'balanced', inputCost: 0.27,  outputCost: 1.10,  capabilities: ['text'] },
  'deepseek/deepseek-v4-flash':         { tier: 'fast',     inputCost: 0.10,  outputCost: 0.40,  capabilities: ['text'] },
  'deepseek/deepseek-v4-flash-latest':  { tier: 'fast',     inputCost: 0.10,  outputCost: 0.40,  capabilities: ['text'] },
  'deepseek/deepseek-v4-flash-0731':    { tier: 'fast',     inputCost: 0.10,  outputCost: 0.40,  capabilities: ['text'] },

  // Meta (Llama) via OpenRouter
  'meta-llama/llama-3.3-70b-instruct':  { tier: 'balanced', inputCost: 0.12,  outputCost: 0.30,  capabilities: ['text'] },
  'meta-llama/llama-3.3-8b-instruct':   { tier: 'fast',     inputCost: 0.02,  outputCost: 0.025, capabilities: ['text'] },
  'meta-llama/llama-3.2-90b-vision-instruct': { tier: 'premium', inputCost: 0.35, outputCost: 0.40, capabilities: ['text', 'image'] },
  'meta-llama/llama-3.2-11b-vision-instruct': { tier: 'fast', inputCost: 0.05, outputCost: 0.05, capabilities: ['text', 'image'] },
  'meta-llama/llama-3.2-3b-instruct':   { tier: 'fast',     inputCost: 0.01,  outputCost: 0.02,  capabilities: ['text'] },
  'meta-llama/llama-3.2-1b-instruct':   { tier: 'fast',     inputCost: 0.005, outputCost: 0.01,  capabilities: ['text'] },
  'meta-llama/llama-3.1-405b-instruct': { tier: 'premium',  inputCost: 2.0,   outputCost: 2.0,   capabilities: ['text'] },
  'meta-llama/llama-3.1-70b-instruct':  { tier: 'balanced', inputCost: 0.40,  outputCost: 0.40,  capabilities: ['text'] },
  'meta-llama/llama-3.1-8b-instruct':   { tier: 'fast',     inputCost: 0.02,  outputCost: 0.02,  capabilities: ['text'] },
  'meta-llama/llama-3-70b-instruct':    { tier: 'balanced', inputCost: 0.30,  outputCost: 0.40,  capabilities: ['text'] },
  'meta-llama/llama-3-8b-instruct':     { tier: 'fast',     inputCost: 0.02,  outputCost: 0.02,  capabilities: ['text'] },
  'meta-llama/llama-3.2-90b-instruct':  { tier: 'premium',  inputCost: 0.35,  outputCost: 0.40,  capabilities: ['text'] },
  'meta-llama/llama-4-maverick':        { tier: 'premium',  inputCost: 0.20,  outputCost: 0.60,  capabilities: ['text', 'image'] },
  'meta-llama/llama-4-scout':           { tier: 'balanced', inputCost: 0.10,  outputCost: 0.30,  capabilities: ['text', 'image'] },
  'meta/muse-spark-1.1':                { tier: 'balanced', inputCost: 0.10,  outputCost: 0.30,  capabilities: ['text'] },
  'meta/muse-spark-1.2':                { tier: 'balanced', inputCost: 0.10,  outputCost: 0.30,  capabilities: ['text'] },

  // Mistral via OpenRouter
  'mistralai/mistral-large-latest':     { tier: 'premium',  inputCost: 2.0,   outputCost: 6.0,   capabilities: ['text'] },
  'mistralai/mistral-large-2407':       { tier: 'premium',  inputCost: 2.0,   outputCost: 6.0,   capabilities: ['text'] },
  'mistralai/mistral-medium':           { tier: 'balanced', inputCost: 2.7,   outputCost: 8.1,   capabilities: ['text'] },
  'mistralai/mistral-small-latest':     { tier: 'fast',     inputCost: 0.20,  outputCost: 0.60,  capabilities: ['text'] },
  'mistralai/mistral-small-2409':       { tier: 'fast',     inputCost: 0.20,  outputCost: 0.60,  capabilities: ['text'] },
  'mistralai/mistral-nemo':             { tier: 'fast',     inputCost: 0.15,  outputCost: 0.15,  capabilities: ['text'] },
  'mistralai/mistral-7b-instruct':      { tier: 'fast',     inputCost: 0.03,  outputCost: 0.05,  capabilities: ['text'] },
  'mistralai/mixtral-8x7b-instruct':    { tier: 'fast',     inputCost: 0.10,  outputCost: 0.10,  capabilities: ['text'] },
  'mistralai/mixtral-8x22b-instruct':   { tier: 'balanced', inputCost: 0.40,  outputCost: 0.40,  capabilities: ['text'] },
  'mistralai/codestral-latest':         { tier: 'balanced', inputCost: 0.30,  outputCost: 0.90,  capabilities: ['text'] },
  'mistralai/pixtral-large-2411':       { tier: 'premium',  inputCost: 2.0,   outputCost: 6.0,   capabilities: ['text', 'image'] },
  'mistralai/ministral-8b':             { tier: 'fast',     inputCost: 0.10,  outputCost: 0.10,  capabilities: ['text'] },
  'mistralai/ministral-3b':             { tier: 'fast',     inputCost: 0.04,  outputCost: 0.04,  capabilities: ['text'] },

  // Qwen via OpenRouter
  'qwen/qwen-2.5-72b-instruct':         { tier: 'balanced', inputCost: 0.13,  outputCost: 0.40,  capabilities: ['text'] },
  'qwen/qwen-2.5-32b-instruct':         { tier: 'balanced', inputCost: 0.08,  outputCost: 0.24,  capabilities: ['text'] },
  'qwen/qwen-2.5-14b-instruct':         { tier: 'fast',     inputCost: 0.05,  outputCost: 0.15,  capabilities: ['text'] },
  'qwen/qwen-2.5-7b-instruct':          { tier: 'fast',     inputCost: 0.02,  outputCost: 0.04,  capabilities: ['text'] },
  'qwen/qwen-2-72b-instruct':           { tier: 'balanced', inputCost: 0.40,  outputCost: 0.40,  capabilities: ['text'] },
  'qwen/qwen-2-7b-instruct':            { tier: 'fast',     inputCost: 0.05,  outputCost: 0.10,  capabilities: ['text'] },
  'qwen/qwen-vl-plus':                  { tier: 'balanced', inputCost: 0.21,  outputCost: 0.63,  capabilities: ['text', 'image'] },
  'qwen/qwen-vl-max':                   { tier: 'premium',  inputCost: 0.40,  outputCost: 1.20,  capabilities: ['text', 'image'] },
  'qwen/qwen3-235b-a22b':               { tier: 'premium',  inputCost: 0.20,  outputCost: 0.60,  capabilities: ['text'] },
  'qwen/qwen3-30b-a3b':                 { tier: 'balanced', inputCost: 0.08,  outputCost: 0.24,  capabilities: ['text'] },
  'qwen/qwen3-32b':                     { tier: 'balanced', inputCost: 0.08,  outputCost: 0.24,  capabilities: ['text'] },
  'qwen/qwen3-coder-plus':              { tier: 'balanced', inputCost: 0.40,  outputCost: 1.20,  capabilities: ['text'] },
  'qwen/qwen3-max':                     { tier: 'premium',  inputCost: 0.60,  outputCost: 1.80,  capabilities: ['text'] },
  'qwen/qwen3.5-flash':                 { tier: 'fast',     inputCost: 0.05,  outputCost: 0.40,  capabilities: ['text'] },
  'qwen/qwen3.7-flash':                 { tier: 'fast',     inputCost: 0.05,  outputCost: 0.40,  capabilities: ['text'] },
  'qwen/qwen3.8-max':                   { tier: 'premium',  inputCost: 0.60,  outputCost: 1.80,  capabilities: ['text'] },
  'qwen/qwen-long':                     { tier: 'balanced', inputCost: 0.05,  outputCost: 0.20,  capabilities: ['text'] },

  // xAI (Grok) via OpenRouter
  'x-ai/grok-4':                        { tier: 'premium',  inputCost: 3.0,   outputCost: 15.0,  capabilities: ['text', 'image'] },
  'x-ai/grok-3':                        { tier: 'premium',  inputCost: 3.0,   outputCost: 15.0,  capabilities: ['text', 'image'] },
  'x-ai/grok-3-mini':                   { tier: 'fast',     inputCost: 0.30,  outputCost: 0.50,  capabilities: ['text'] },
  'x-ai/grok-2':                        { tier: 'balanced', inputCost: 2.0,   outputCost: 10.0,  capabilities: ['text', 'image'] },
  'x-ai/grok-2-vision':                 { tier: 'balanced', inputCost: 2.0,   outputCost: 10.0,  capabilities: ['text', 'image'] },
  'x-ai/grok-vision-beta':              { tier: 'balanced', inputCost: 5.0,   outputCost: 15.0,  capabilities: ['text', 'image'] },

  // Perplexity via OpenRouter
  'perplexity/sonar-pro':               { tier: 'premium',  inputCost: 3.0,   outputCost: 15.0,  capabilities: ['text'] },
  'perplexity/sonar':                   { tier: 'balanced', inputCost: 1.0,   outputCost: 1.0,   capabilities: ['text'] },
  'perplexity/sonar-reasoning-pro':     { tier: 'premium',  inputCost: 2.0,   outputCost: 8.0,   capabilities: ['text'] },
  'perplexity/sonar-reasoning':         { tier: 'balanced', inputCost: 1.0,   outputCost: 5.0,   capabilities: ['text'] },

  // Cohere via OpenRouter
  'cohere/command-a':                   { tier: 'premium',  inputCost: 2.50,  outputCost: 10.0,  capabilities: ['text'] },
  'cohere/command-r-plus':              { tier: 'balanced', inputCost: 2.50,  outputCost: 10.0,  capabilities: ['text'] },
  'cohere/command-r':                   { tier: 'fast',     inputCost: 0.15,  outputCost: 0.60,  capabilities: ['text'] },
  'cohere/command-light':               { tier: 'fast',     inputCost: 0.30,  outputCost: 0.60,  capabilities: ['text'] },

  // Microsoft via OpenRouter
  'microsoft/phi-4':                    { tier: 'balanced', inputCost: 0.07,  outputCost: 0.14,  capabilities: ['text'] },
  'microsoft/phi-4-mini':               { tier: 'fast',     inputCost: 0.02,  outputCost: 0.04,  capabilities: ['text'] },
  'microsoft/phi-3.5-mini':             { tier: 'fast',     inputCost: 0.01,  outputCost: 0.02,  capabilities: ['text'] },
  'microsoft/phi-3-medium':             { tier: 'fast',     inputCost: 0.05,  outputCost: 0.10,  capabilities: ['text'] },
  'microsoft/wizardlm-2-8x22b':         { tier: 'premium',  inputCost: 0.50,  outputCost: 0.50,  capabilities: ['text'] },

  // Moonshot/Kimi via OpenRouter
  'moonshotai/kimi-k2':                 { tier: 'premium',  inputCost: 0.60,  outputCost: 2.50,  capabilities: ['text'] },
  'moonshotai/kimi-k2-0711':            { tier: 'premium',  inputCost: 0.60,  outputCost: 2.50,  capabilities: ['text'] },
  'moonshotai/kimi-k2-instruct':        { tier: 'premium',  inputCost: 0.60,  outputCost: 2.50,  capabilities: ['text'] },
  'moonshotai/kimi-k3':                 { tier: 'premium',  inputCost: 0.60,  outputCost: 2.50,  capabilities: ['text'] },
  'moonshotai/moonlight-2':             { tier: 'balanced', inputCost: 0.20,  outputCost: 0.60,  capabilities: ['text'] },

  // Open source menores via OpenRouter
  'allenai/llama-3.1-tulu-3-405b':     { tier: 'premium',  inputCost: 2.0,   outputCost: 2.0,   capabilities: ['text'] },
  'inflection/inflection-3-pi':         { tier: 'balanced', inputCost: 2.50,  outputCost: 10.0,  capabilities: ['text'] },
  'inflection/inflection-3-productivity': { tier: 'balanced', inputCost: 2.50, outputCost: 10.0, capabilities: ['text'] },
  'ai21/jamba-1-5-large':               { tier: 'premium',  inputCost: 2.0,   outputCost: 8.0,   capabilities: ['text'] },
  'ai21/jamba-1-5-mini':                { tier: 'fast',     inputCost: 0.20,  outputCost: 0.40,  capabilities: ['text'] },
  'amazon/nova-pro-v1':                 { tier: 'premium',  inputCost: 0.80,  outputCost: 3.20,  capabilities: ['text', 'image'] },
  'amazon/nova-lite-v1':                { tier: 'fast',     inputCost: 0.06,  outputCost: 0.24,  capabilities: ['text', 'image'] },
  'amazon/nova-micro-v1':               { tier: 'fast',     inputCost: 0.035, outputCost: 0.14,  capabilities: ['text'] },
}

/**
 * Aplica os overrides conhecidos a uma lista de modelos antes da inferência.
 * Não substitui o que já está definido no LLMModelInfo (tier, capabilities, etc.),
 * apenas preenche o que está faltando.
 */
export function applyOverrides<T extends { id: string; tier?: string; capabilities?: ModelCapability[]; inputCost?: number; outputCost?: number; description?: string }>(models: T[]): T[] {
  return models.map((m) => {
    const ov = MODEL_OVERRIDES[m.id]
    if (!ov) return m
    return {
      ...m,
      tier: (m.tier as 'fast' | 'balanced' | 'premium') ?? ov.tier ?? m.tier,
      capabilities: m.capabilities && m.capabilities.length > 0 ? m.capabilities : (ov.capabilities ?? m.capabilities),
      inputCost: m.inputCost ?? ov.inputCost ?? 0,
      outputCost: m.outputCost ?? ov.outputCost ?? 0,
      description: m.description ?? ov.description,
    } as T
  })
}
