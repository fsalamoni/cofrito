import { describe, it, expect } from 'vitest'
import {
  defaultAgentsConfig,
  normalizeAgentsConfig,
  resolveAgentLLMConfig,
  buildAgentSkillsPrompt,
  AGENT_IDS,
  type AgentConfig,
} from './agents-config'
import type { LLMConfigLike } from './llm-providers'

const GLOBAL: LLMConfigLike = { provider: 'openrouter', model: 'openai/gpt-4o-mini', apiKey: 'sk-global' }

describe('agents-config', () => {
  it('defaults incluem os 3 agentes com modo global e skills', () => {
    const cfg = defaultAgentsConfig()
    for (const id of AGENT_IDS) {
      expect(cfg.agents[id]).toBeTruthy()
      expect(cfg.agents[id].model.mode).toBe('global')
      expect(cfg.agents[id].skills.length).toBeGreaterThan(0)
      expect(cfg.agents[id].enabled).toBe(true)
    }
  })

  it('normaliza documento parcial preenchendo agentes ausentes', () => {
    const cfg = normalizeAgentsConfig({ agents: { acervo: { enabled: false, skills: [] } } })
    expect(cfg.agents.acervo.enabled).toBe(false)
    expect(cfg.agents.acervo.skills).toEqual([])
    // agentes ausentes voltam com defaults
    expect(cfg.agents.orchestrator.skills.length).toBeGreaterThan(0)
    expect(cfg.agents['web-researcher']).toBeTruthy()
  })

  it('normaliza skill descartando sem nome e limitando tamanho', () => {
    const cfg = normalizeAgentsConfig({
      agents: {
        orchestrator: {
          skills: [
            { name: '', prompt: 'x' },
            { name: 'Válida', description: 'd', prompt: 'p', enabled: false },
          ],
        },
      },
    })
    expect(cfg.agents.orchestrator.skills).toHaveLength(1)
    expect(cfg.agents.orchestrator.skills[0].name).toBe('Válida')
    expect(cfg.agents.orchestrator.skills[0].enabled).toBe(false)
    expect(cfg.agents.orchestrator.skills[0].id).toBeTruthy()
  })

  it('resolveAgentLLMConfig usa global quando modo=global', () => {
    const agent = defaultAgentsConfig().agents.acervo
    expect(resolveAgentLLMConfig(agent, GLOBAL)).toEqual(GLOBAL)
  })

  it('resolveAgentLLMConfig usa custom quando completo', () => {
    const agent: AgentConfig = {
      ...defaultAgentsConfig().agents.acervo,
      model: { mode: 'custom', provider: 'anthropic', model: 'claude-x', apiKey: 'sk-custom' },
    }
    const r = resolveAgentLLMConfig(agent, GLOBAL)
    expect(r?.provider).toBe('anthropic')
    expect(r?.apiKey).toBe('sk-custom')
  })

  it('resolveAgentLLMConfig cai no global quando custom incompleto', () => {
    const agent: AgentConfig = {
      ...defaultAgentsConfig().agents.acervo,
      model: { mode: 'custom', provider: 'anthropic', model: '', apiKey: '' },
    }
    expect(resolveAgentLLMConfig(agent, GLOBAL)).toEqual(GLOBAL)
  })

  it('buildAgentSkillsPrompt inclui só skills ativas com prompt', () => {
    const agent: AgentConfig = {
      ...defaultAgentsConfig().agents.orchestrator,
      skills: [
        { id: 'a', name: 'Ativa', description: '', prompt: 'faça X', enabled: true },
        { id: 'b', name: 'Inativa', description: '', prompt: 'faça Y', enabled: false },
        { id: 'c', name: 'SemPrompt', description: '', prompt: '', enabled: true },
      ],
    }
    const out = buildAgentSkillsPrompt(agent)
    expect(out).toContain('Ativa: faça X')
    expect(out).not.toContain('faça Y')
    expect(out).not.toContain('SemPrompt')
  })
})
