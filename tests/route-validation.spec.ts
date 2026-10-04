import { describe, expect, it, vi } from 'vitest'
import type { LlmModelInfo, LlmProviderInfo } from '@deepseek-ai/dsh-llm'
import { assertKnownRoute, type RouteRegistry } from '../src/reviewer-route-validation.ts'

const providers: LlmProviderInfo[] = [
  { id: 'opencode-go', name: 'OpenCode Go' },
  { id: 'zai', name: 'Z.ai' },
]

/** One model entry of a provider, in the registry's own shape. */
function model(provider: string, id: string): LlmModelInfo {
  return { provider, id, name: id }
}

const catalog: Record<string, LlmModelInfo[]> = {
  'opencode-go': [model('opencode-go', 'deepseek-v4.1-flash')],
  zai: [model('zai', 'glm-5.3-flash')],
}

/**
 * Registry stand-in whose `listModels` counts calls, so "does the check even
 * ask the provider" is observable rather than inferred.
 */
function registry(): RouteRegistry & { listModels: ReturnType<typeof vi.fn> } {
  return {
    listProviders: () => providers,
    listModels: vi.fn(async (provider: string): Promise<LlmModelInfo[]> => catalog[provider] ?? []),
  } as unknown as RouteRegistry & { listModels: ReturnType<typeof vi.fn> }
}

describe('assertKnownRoute', () => {
  it('accepts a route the registry serves', async () => {
    const llm = registry()
    await expect(assertKnownRoute(llm, { provider: 'zai', model: 'glm-5.3-flash' })).resolves.toBeUndefined()
    expect(llm.listModels).toHaveBeenCalledWith('zai')
  })

  it('rejects a provider the registry does not list, without asking it for models', async () => {
    const llm = registry()
    await expect(assertKnownRoute(llm, { provider: 'nope', model: 'glm-5.3-flash' }))
      .rejects.toThrow('auto-review-plus: unknown reviewer route "nope/glm-5.3-flash"')
    expect(llm.listModels).not.toHaveBeenCalled()
  })

  it('rejects a model its provider does not list', async () => {
    const llm = registry()
    await expect(assertKnownRoute(llm, { provider: 'zai', model: 'not-a-model' }))
      .rejects.toThrow('auto-review-plus: unknown reviewer route "zai/not-a-model"')
    expect(llm.listModels).toHaveBeenCalledWith('zai')
  })

  it('does not report a failed model listing as an unknown route', async () => {
    // "Could not check" and "does not exist" are different answers: folding the
    // first into the second would hide an adapter fault behind user input.
    const llm = {
      listProviders: () => providers,
      listModels: async (): Promise<LlmModelInfo[]> => { throw new Error('provider is offline') },
    }
    await expect(assertKnownRoute(llm, { provider: 'zai', model: 'glm-5.3-flash' }))
      .rejects.toThrow('provider is offline')
  })
})
