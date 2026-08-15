/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/consistent-type-imports */
/**
 * Pipeline multi-agente — orquestra a execução sequencial de todas as skills.
 *
 * Inspirado no padrão do Lexio (orchestrator + critic + loop de iteração).
 *
 * Fluxo (esforço 'medio' como padrão):
 *   1. Orchestrator        — classifica intenção, extrai pontos
 *   2. Researcher-Internal — busca no corpus interno
 *   3. Researcher-Web      — busca web (se aplicável)
 *   4. Compiler            — organiza fontes por ponto
 *   5. Legal-Writer        — gera resposta
 *   6. Critic              — avalia; se score < threshold e iteration < max, re-iterar
 *
 * Esforços:
 *  - rapido:   3 iterações, sem crítico, sem legal-writer
 *  - medio:    6 iterações, crítico a cada 1, sem legal-writer (padrão)
 *  - profundo: 10 iterações, crítico a cada 2, com legal-writer
 */

import { runOrchestrator } from './orchestrator'
import { runResearcherInternal } from './researcher-internal'
import { searchCorpusFourLevel } from './corpus-search'
import { runResearcherWeb } from './researcher-web'
import { runCompiler } from './compiler'
import { runLegalWriter, buildRefusalAnswer } from './legal-writer'
import { runCritic } from './critic'
import { buildSystemPrompt } from '../prompts/system'
import { buildFallbackMessage } from './prompts'
import { getFirestore, FieldValue } from '../services/firestore'
import type {
  AgentRun,
  AgentRole,
  PipelineInput,
  PipelineResult,
  TrailEvent,
  EffortPreset,
} from './types'
import { EFFORT_PRESETS, type OrchestratorPlan } from './types'
import { isAboutItself, getIdentityResponse } from './self-detect'

export async function runAgentPipeline(input: PipelineInput): Promise<PipelineResult> {
  const {
    userId,
    conversationId,
    question,
    allowExternal,
    requiresLegalWriting,
    effort = 'medio',
    userAreas,
    llmConfig,
    geminiApiKey,
    researchConfig,
    webSearchConfig,
    intranetConfig,
    logger,
    onTrail,
  } = input

  const preset: EffortPreset = EFFORT_PRESETS[effort]
  const trail: TrailEvent[] = []
  const emit = (e: TrailEvent) => {
    trail.push(e)
    try { onTrail?.(e) } catch { /* silencioso */ }
    logger.info(`trail.${e.type}`, e as any)
  }

  // FAST-PATH: deteccao de "pergunta sobre o proprio agente".
  // Se a pergunta e sobre o Cofrito (identidade, funcao, como funciona),
  // responde IMEDIATAMENTE com o bloco # IDENTIDADE, sem passar pelo pipeline.
  // Garante que o bot NUNCA diz "nao encontrei material sobre mim".
  if (isAboutItself(question)) {
    logger.info('pipeline.fastpath.identity', { question: question.slice(0, 100) })
    const identityAnswer = getIdentityResponse(false)
    const startedAt = new Date().toISOString()
    emit({ type: 'agent_start', role: 'orchestrator', ts: startedAt })
    emit({ type: 'agent_end', role: 'orchestrator', ts: startedAt, status: 'success', durationMs: 0 })
    emit({ type: 'final_answer', length: identityAnswer.length, ts: startedAt })
    // Plano mock para a fast-path (estrutura compativel com OrchestratorPlan)
    const identityPlan: OrchestratorPlan = {
      intent: 'simple-question',
      reasoning: 'Fast-path: pergunta sobre o proprio agente (identidade, funcao, como funciona).',
      points: [],
      requiresWebSearch: false,
      requiresLegalWriting: false,
      requiresCompilation: false,
      requiresInternalSearch: false,
      isAboutItself: true,
    }
    return {
      orchestratorPlan: identityPlan,
      agentRuns: [{
        id: 'identity-fastpath',
        role: 'orchestrator',
        startedAt,
        finishedAt: startedAt,
        durationMs: 0,
        input: { question },
        output: { answer: identityAnswer, sources: [] },
        status: 'success',
      }],
      compiledSources: [],
      finalAnswer: identityAnswer,
      needsLegalWriting: false,
      iterations: 0,
      trail,
    }
  }

  // Watchdog geral: se o pipeline demorar mais que o esperado, NAO trava.
  // Cloud Functions Gen 2 tem timeout de 300s no onCall (configurado no chatV2).
  // Se por algum motivo chegar perto do limite, abrimos mao e finalizamos com o que temos.
  const PIPELINE_DEADLINE_MS = 240_000  // 4 min (margem de seguranca)
  const pipelineDeadline = Date.now() + PIPELINE_DEADLINE_MS

  const runs: AgentRun[] = []
  const allSources: import('./types').SourceRef[] = []
  const iterationLog: string[] = []

  // 1) ORCHESTRATOR ─────────────────────────────────────────────────────────
  emit({ type: 'agent_start', role: 'orchestrator', ts: new Date().toISOString() })
  const orchRun = await runAgent('orchestrator', async () => {
    const plan = await runOrchestrator({
      question,
      allowExternal,
      hasCorpus: true,
      llmConfig,
      geminiApiKey,
      logger,
    })
    return { plan, output: { intent: plan.intent, pointsCount: plan.points.length, reasoning: plan.reasoning } }
  }, logger)
  runs.push(orchRun.run)
  emit({ type: 'agent_end', role: 'orchestrator', ts: new Date().toISOString(), status: (orchRun.run.status === 'pending' ? 'error' : orchRun.run.status), durationMs: orchRun.run.durationMs ?? 0 })
  const plan = orchRun.result?.plan

  if (plan) emit({ type: 'plan', plan, ts: new Date().toISOString() })

  // Casos especiais (saída imediata)
  if (plan?.intent === 'refusal') {
    return finalize(runs, plan, [], buildRefusalAnswer(), false, 0, trail, logger, userId, conversationId)
  }
  if (plan?.intent === 'out-of-scope') {
    return finalize(runs, plan, [], `Esta pergunta está fora do escopo do CAOCIPP. ${plan.outOfScopeReason || ''}\n\nO Cofrito pode ajudar com atos normativos, teses, modelos de parecer, legislação federal/estadual sobre matérias cíveis e patrimônio público, e identidade/estrutura do MPRS.`, false, 0, trail, logger, userId, conversationId)
  }
  if (plan?.intent === 'simple-question') {
    const sysPrompt = buildSystemPrompt({ allowExternal, hasCorpusChunks: true, userAreas })
    try {
      const out = await import('../services/llm-providers').then((m) =>
        m.generateWithProvider({
          systemPrompt: sysPrompt,
          messages: [{ role: 'user', content: question }],
          config: { ...llmConfig, maxTokens: 1500, temperature: 0.3 },
          geminiApiKey,
        }),
      )
      return finalize(runs, plan, [], out.content, false, 0, trail, logger, userId, conversationId)
    } catch (err: any) {
      logger.error('pipeline.simpleQuestion.failed', { err: err?.message })
      return finalize(runs, plan, [], 'Não foi possível processar a pergunta no momento.', false, 0, trail, logger, userId, conversationId)
    }
  }

  // 2a) CORPUS 4-LEVEL SEARCH (rapido, sem LLM, filtros progressivos) ──
  // OTIMIZACAO: faz busca em 4 niveis no nivel do DOCUMENTO:
  //   L1 = classification (natureza, tipo, area, assuntos)
  //   L2 = keyPoints + ementa.keywords
  //   L3 = ementa (sintese, fundamentacao, conclusao)
  //   L4 = textContent (apenas dos finalistas)
  // Vantagem: nao carrega textContent ate saber que o doc e' RELEVANTE.
  const fourLevelSources: import('./types').SourceRef[] = []
  if (plan?.requiresInternalSearch !== false && plan?.points && plan.points.length > 0) {
    try {
      for (const point of plan.points) {
        const result = await searchCorpusFourLevel({
          point,
          maxResults: preset.maxSourcesPerPoint || 5,
          logger,
        })
        for (const d of result.docs) {
          // Relevancia proporcional ao score (normalizada). Fallback "mais proximo"
          // recebe relevancia baixa e o snippet leva uma ressalva explicita.
          const relevance = d.isClosestMatch
            ? 0.3
            : Math.min(0.95, 0.55 + Math.min(0.4, (d.matchScore || 0) / 40))
          const baseSnippet = (d.ementa?.sintese || d.ementa?.assunto || d.fileName || '').slice(0, 800)
          const snippet = d.isClosestMatch
            ? `[Correspondência aproximada — não há documento que se encaixe perfeitamente na busca] ${baseSnippet}`
            : baseSnippet
          fourLevelSources.push({
            id: d.id,
            docId: d.id,
            title: d.title || d.fileName || d.id,
            section: 'corpus-search-4level',
            url: d.storagePath,
            type: 'internal-document',
            relevance,
            snippet,
            fullText: d.textContent || d.textOriginal,
            date: d.updatedAt || d.createdAt,
            sourcePath: 'corpus/',
            verified: true,
          })
        }
        if (result.docs.length > 0) {
          logger.info('pipeline.corpus-4level.found', {
            point: point.id,
            docs: result.docs.length,
            stats: result.stats,
            ms: result.totalMs,
          })
        }
      }
    } catch (err) {
      logger.warn('pipeline.corpus-4level.failed', { err: (err as Error).message })
    }
  }

  // 2b) RESEARCHER-INTERNAL (busca em CHUNKS com embeddings) ────────────
  let internalSources: import('./types').SourceRef[] = fourLevelSources
  if (plan?.requiresInternalSearch !== false && plan?.points && plan.points.length > 0) {
    emit({ type: 'agent_start', role: 'researcher-internal', ts: new Date().toISOString() })
    const intRun = await runAgent('researcher-internal', async () => {
      const sources = await runResearcherInternal({
        userId,
        points: plan.points,
        config: { ...researchConfig, maxTotalSources: preset.maxTotalSources, maxSourcesPerPoint: preset.maxSourcesPerPoint },
        logger,
        llmConfig,
      })
      // Combina com 4-level (4-level ja' vem com docs mais relevantes, nao duplica)
      const fourLevelIds = new Set(fourLevelSources.map(s => s.docId))
      const newSources = sources.filter(s => !fourLevelIds.has(s.docId))
      return { sources: [...fourLevelSources, ...newSources], output: { count: sources.length, fromFourLevel: fourLevelSources.length } }
    }, logger)
    runs.push(intRun.run)
    internalSources = intRun.result?.sources ?? []
    allSources.push(...internalSources)
    emit({ type: 'agent_end', role: 'researcher-internal', ts: new Date().toISOString(), status: (intRun.run.status === 'pending' ? 'error' : intRun.run.status), durationMs: intRun.run.durationMs ?? 0 })
    emit({ type: 'sources_found', count: internalSources.length, ts: new Date().toISOString(), source: 'internal', titles: internalSources.slice(0, 6).map((s) => s.title) })
  } else {
    runs.push(makeSkippedRun('researcher-internal', 'skipped by orchestrator'))
  }

  // 3) RESEARCHER-WEB ──────────────────────────────────────────────────────
  let webSources: import('./types').SourceRef[] = []
  if (plan?.requiresWebSearch && allowExternal) {
    emit({ type: 'agent_start', role: 'researcher-web', ts: new Date().toISOString() })
    const webRun = await runAgent('researcher-web', async () => {
      const sources = await runResearcherWeb({
        points: plan.points,
        webConfig: webSearchConfig,
        intranetConfig,
        allowExternal,
        logger,
      })
      return { sources, output: { count: sources.length, provider: webSearchConfig.provider } }
    }, logger)
    runs.push(webRun.run)
    webSources = webRun.result?.sources ?? []
    allSources.push(...webSources)
    emit({ type: 'agent_end', role: 'researcher-web', ts: new Date().toISOString(), status: (webRun.run.status === 'pending' ? 'error' : webRun.run.status), durationMs: webRun.run.durationMs ?? 0 })
    emit({ type: 'sources_found', count: webSources.length, ts: new Date().toISOString(), source: 'web', titles: webSources.slice(0, 6).map((s) => s.title) })
  } else {
    runs.push(makeSkippedRun('researcher-web', !allowExternal ? 'external search disabled' : 'not required'))
  }

  // 4) COMPILER ────────────────────────────────────────────────────────────
  emit({ type: 'agent_start', role: 'compiler', ts: new Date().toISOString() })
  const compRun = await runAgent('compiler', async () => {
    const compiled = runCompiler({
      points: plan?.points ?? [],
      internalSources,
      webSources,
      config: { ...researchConfig, maxTotalSources: preset.maxTotalSources, maxSourcesPerPoint: preset.maxSourcesPerPoint },
      logger,
    })
    return { compiled, output: { count: compiled.sources.length, hasEnough: compiled.hasEnoughMaterial, warnings: compiled.warnings } }
  }, logger)
  runs.push(compRun.run)
  emit({ type: 'agent_end', role: 'compiler', ts: new Date().toISOString(), status: (compRun.run.status === 'pending' ? 'error' : compRun.run.status), durationMs: compRun.run.durationMs ?? 0 })
  const compiled = compRun.result?.compiled
  const compiledSources = compiled?.sources ?? []
  emit({ type: 'sources_found', count: compiledSources.length, ts: new Date().toISOString(), source: 'compiled', titles: compiledSources.slice(0, 8).map((s) => s.title) })

  // 5) LOOP: LEGAL-WRITER → CRITIC ─────────────────────────────────────────
  let finalAnswer: string = buildFallbackMessage(internalSources.length > 0, webSources.length > 0, allowExternal)
  let iterations = 0
  let criticScore: number | undefined
  let lastDraft: string | null = null

  for (let iter = 1; iter <= preset.maxIterations; iter++) {
    iterations = iter
    emit({ type: 'iteration_start', i: iter, ts: new Date().toISOString() })

    // Decidir se precisa de legal-writer nesta iteração
    const needLegal = requiresLegalWriting || preset.enableLegalWriting

    if (needLegal) {
      emit({ type: 'agent_start', role: 'legal-writer', ts: new Date().toISOString() })
      const lwRun = await runAgent('legal-writer', async () => {
        const { answer } = await runLegalWriter({
          question,
          requiresLegalWriting,
          allowExternal,
          compiled: compiled!,
          llmConfig,
          geminiApiKey,
          logger,
        })
        return { answer, output: { length: answer.length } }
      }, logger)
      runs.push(lwRun.run)
      finalAnswer = lwRun.result?.answer ?? finalAnswer
      lastDraft = finalAnswer
      emit({ type: 'agent_end', role: 'legal-writer', ts: new Date().toISOString(), status: (lwRun.run.status === 'pending' ? 'error' : lwRun.run.status), durationMs: lwRun.run.durationMs ?? 0 })
    } else if (iter === 1) {
      // 1ª iteração sem legal-writer: entrega com análise do pedido + docs
      finalAnswer = buildDeliveryAnswer(compiledSources, plan, allowExternal, compiled?.hasEnoughMaterial ?? true)
      lastDraft = finalAnswer
      runs.push(makeSkippedRun('legal-writer', 'not required at this effort level'))
    }

    // 6) CRITIC — avalia o draft (se habilitado e na iteração correta)
    if (preset.enableCritic && iter % preset.criticIterations === 0 && lastDraft) {
      emit({ type: 'agent_start', role: 'critic', ts: new Date().toISOString() })
      const criticRun = await runCritic({
        question,
        draft: lastDraft,
        sources: compiledSources.map((s) => ({ id: s.id, title: s.title, type: s.type, verified: s.verified })),
        iteration: iter,
        maxIterations: preset.maxIterations,
        criticThreshold: preset.criticThreshold,
        llmConfig,
        geminiApiKey,
        logger,
      })
      criticScore = criticRun.score
      iterationLog.push(`Iter ${iter}: score=${criticRun.score}, stop=${criticRun.shouldStop}`)
      emit({ type: 'critic_score', score: criticRun.score, reasons: criticRun.reasons, shouldStop: criticRun.shouldStop, ts: new Date().toISOString() })
      if (criticRun.shouldStop) break
    } else {
      runs.push(makeSkippedRun('critic', 'not enabled at this effort level'))
      break
    }
  }

  // Watchdog: se passou do deadline, finaliza com o que tem
  if (Date.now() > pipelineDeadline) {
    logger.warn('pipeline.watchdog.deadline', {
      userId,
      durationMs: Date.now() - (pipelineDeadline - PIPELINE_DEADLINE_MS),
    })
    // Garante que tem uma resposta final
    const fallbackAnswer = finalAnswer || 'O processamento demorou mais que o esperado. Por favor, tente novamente com uma pergunta mais específica.'
    return finalize(runs, plan!, compiledSources, fallbackAnswer, requiresLegalWriting, iterations, trail, logger, userId, conversationId, criticScore)
  }
  return finalize(runs, plan!, compiledSources, finalAnswer, requiresLegalWriting, iterations, trail, logger, userId, conversationId, criticScore)
}

async function finalize(
  runs: AgentRun[],
  plan: import('./types').OrchestratorPlan,
  compiledSources: import('./types').SourceRef[],
  finalAnswer: string,
  needsLegalWriting: boolean,
  iterations: number,
  trail: TrailEvent[],
  logger: { info: (m: string, x?: unknown) => void; warn: (m: string, x?: unknown) => void; error: (m: string, x?: unknown) => void },
  userId: string,
  conversationId: string,
  criticScore?: number,
): Promise<PipelineResult> {
  await persistAgentRuns(userId, conversationId, runs, trail).catch((err) => {
    logger.warn('pipeline.persistRunsFailed', { err: err?.message })
  })
  return {
    orchestratorPlan: plan,
    agentRuns: runs,
    compiledSources,
    finalAnswer,
    needsLegalWriting,
    iterations,
    criticScore,
    trail,
  }
}

const AGENT_TIMEOUT_MS = 90_000  // 90s por agente (anti-hang)

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} excedeu o timeout de ${ms / 1000}s`)), ms)
  })
  try {
    return await Promise.race([p, timeoutPromise])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function runAgent<T>(
  role: AgentRole,
  fn: () => Promise<T>,
  logger: { info: (m: string, x?: unknown) => void; warn: (m: string, x?: unknown) => void; error: (m: string, x?: unknown) => void },
): Promise<{ run: AgentRun; result?: T }> {
  const id = `${role}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  const startedAt = new Date().toISOString()
  const start = Date.now()
  const run: AgentRun = {
    id,
    role,
    startedAt,
    input: {},
    output: {},
    status: 'pending',
  }
  try {
    const result = await withTimeout(fn(), AGENT_TIMEOUT_MS, `agent.${role}`)
    run.finishedAt = new Date().toISOString()
    run.durationMs = Date.now() - start
    run.status = 'success'
    run.output = (result as any)?.output ?? {}
    return { run, result }
  } catch (err: any) {
    run.finishedAt = new Date().toISOString()
    run.durationMs = Date.now() - start
    run.status = 'error'
    run.error = err?.message ?? String(err)
    logger.error(`agent.${role}.error`, { err: run.error })
    return { run }
  }
}

function makeSkippedRun(role: AgentRole, reason: string): AgentRun {
  return {
    id: `${role}_skipped_${Date.now()}`,
    role,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: 0,
    input: {},
    output: { skipped: true, reason },
    status: 'skipped',
    notes: reason,
  }
}

async function persistAgentRuns(userId: string, conversationId: string, runs: AgentRun[], trail: TrailEvent[]): Promise<void> {
  if (!userId || !conversationId) return
  const db = getFirestore()
  const batch = db.batch()
  for (const run of runs) {
    const ref = db.doc(`users/${userId}/conversations/${conversationId}/agent-runs/${run.id}`)
    batch.set(ref, { ...run, persistedAt: FieldValue.serverTimestamp() })
  }
  // Salvar o trail consolidado
  const trailRef = db.doc(`users/${userId}/conversations/${conversationId}/trail/latest`)
  batch.set(trailRef, {
    events: trail,
    persistedAt: FieldValue.serverTimestamp(),
  })
  await batch.commit()

  // Memória central — espelho do chat (sem dados pessoais sensíveis) para
  // servir de base para memória/contexto de novos chats com qualquer usuário.
  // Apenas conteúdo das mensagens (não identidade do user).
  try {
    const centralRef = db.doc(`platform-memory/conversations/${conversationId}`)
    batch.set(centralRef, {
      lastTrail: trail,
      lastUserMessage: trail.find((t: any) => t.type === 'plan') ? '(plano registrado)' : '(trail registrado)',
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
    await batch.commit()
  } catch {
    // silencioso — a memória central é nice-to-have
  }
}

/**
 * Entrega padrão (document-retrieval): análise do pedido + TODOS os documentos
 * encontrados + como aproveitá-los. A consulta formal ao CAOCIPP só é destacada
 * quando não há material; havendo material, fica apenas como opção discreta.
 */
function buildDeliveryAnswer(
  sources: import('./types').SourceRef[],
  plan: import('./types').OrchestratorPlan | undefined,
  allowExternal: boolean,
  hasEnough: boolean,
): string {
  if (sources.length === 0) {
    return buildFallbackMessage(true, allowExternal, allowExternal)
  }

  const reasoning = plan?.reasoning?.trim()
  const points = plan?.points ?? []
  const areas = plan?.detectedAreas ?? []

  const analysisParts: string[] = ['## Entendimento do seu pedido']
  analysisParts.push(reasoning || 'Identifiquei o tema e pesquisei no acervo do CAOCIPP os documentos pertinentes.')
  if (points.length > 0) analysisParts.push(`\n**Pontos pesquisados:** ${points.map((p) => p.query).join('; ')}.`)
  if (areas.length > 0) analysisParts.push(`**Áreas envolvidas:** ${areas.join(', ')}.`)
  const analysis = analysisParts.join('\n')

  const list = sources.map((s, i) => {
    const link = s.url ? `[${s.title}](${s.url})` : s.title
    return `### ${i + 1}. ${s.title}
- **Tipo:** ${s.type}
- **Data:** ${s.date || 'sem data'}
- **Link:** ${link}
- **Trecho literal:**
"""
${s.snippet}
"""`
  }).join('\n\n')

  const comoAproveitar: string[] = ['## Como aproveitar']
  comoAproveitar.push(
    'Os documentos acima tratam do tema solicitado e podem ser usados como base ou modelo, ' +
    'aproveitando a fundamentação, as teses e os trechos citáveis — evitando retrabalho.',
  )
  if (!hasEnough || sources.length < 2) {
    comoAproveitar.push(
      '\nComo o material pode não cobrir integralmente o seu caso, utilize os documentos **mais próximos** ' +
      'acima, adaptando a fundamentação ao caso concreto.',
    )
  }

  return `${analysis}

## Documentos encontrados

${list}

${comoAproveitar.join('\n')}

---

💡 Para uma **análise jurídica** sobre estes documentos, ative "Análise jurídica" e pergunte novamente. Caso **nenhum material seja suficiente** para o seu caso, você pode abrir uma **consulta formal ao CAOCIPP**.`
}
