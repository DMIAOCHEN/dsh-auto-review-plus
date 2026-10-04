import { describe, expect, it } from 'vitest'
import type { TypertCodec } from '@deepseek-ai/dsh-typert-protocol'
import {
  AUTO_REVIEW_PLUS_REMOTE,
  REVIEWER_ROUTE_SERVICE,
  type ReviewerRouteApi,
} from '../../src/client/remote.ts'

/** Narrow one codec to the strict variant the mount requires, or fail the case. */
function strictCodec(codec: TypertCodec): Extract<TypertCodec, { mode: 'strict' }> {
  if (codec.mode !== 'strict') throw new Error(`codec is ${codec.mode}, the mount requires "strict"`)
  return codec
}

/** Every method the host half exports, in signature order. */
const HOST_METHODS: Record<string, readonly string[]> = {
  reviewerRouteView: ['sessionId'],
  providers: [],
  models: ['provider'],
  modelInfo: ['provider', 'model'],
  setReviewerRoute: ['sessionId', 'route'],
}

describe('AUTO_REVIEW_PLUS_REMOTE', () => {
  it('is owned by this package', () => {
    expect(AUTO_REVIEW_PLUS_REMOTE.package).toBe('dsh-auto-review-plus')
  })

  it('exports exactly the host half\'s methods, once each', () => {
    expect(AUTO_REVIEW_PLUS_REMOTE.descriptors.map(descriptor => descriptor.method))
      .toEqual(Object.keys(HOST_METHODS))
  })

  it('names the mounted namespace after the host service key', () => {
    for (const descriptor of AUTO_REVIEW_PLUS_REMOTE.descriptors) {
      expect(descriptor.namespace).toBe(REVIEWER_ROUTE_SERVICE)
      expect(descriptor.service).toBe(REVIEWER_ROUTE_SERVICE)
      expect(descriptor.invocation).toEqual({ kind: 'direct' })
    }
  })

  it('carries the host parameter ORDER as JSON wire fields', () => {
    // The gateway reads wire names off the HOST method's JavaScript parameter
    // names; an order or name change on one side alone fails the call.
    for (const descriptor of AUTO_REVIEW_PLUS_REMOTE.descriptors) {
      const expected = HOST_METHODS[descriptor.method] ?? []
      expect(descriptor.parameters.map(parameter => parameter.wire)).toEqual([...expected])
      expect(descriptor.parameters.map(parameter => parameter.name)).toEqual([...expected])
      // A parameter name that matches a registered lookup would be replaced by
      // the lookup's wire field on the host; none of these are lookups.
      for (const parameter of descriptor.parameters) expect(parameter.source).toBe('json')
    }
  })

  it('carries a strict codec per parameter and result, which the mount requires', () => {
    for (const descriptor of AUTO_REVIEW_PLUS_REMOTE.descriptors) {
      expect(typeof strictCodec(descriptor.result).create).toBe('function')
      for (const parameter of descriptor.parameters) {
        expect(typeof strictCodec(parameter.codec).create).toBe('function')
      }
    }
  })

  it('is typed as the namespace ctx.remote resolves (compile-time shape)', () => {
    // Fails to compile if the declaration merge in remote.ts stops matching the
    // descriptors above.
    const api: ReviewerRouteApi = {
      view: async sessionId => ({ route: null, sessionRoute: { provider: 'p', model: sessionId } }),
      providers: async () => [{ id: 'p', name: 'P' }],
      models: async () => [{ id: 'm', name: 'M' }],
      modelInfo: async () => ({ reasoningEfforts: ['high'] }),
      set: async () => undefined,
    }
    expect(typeof api.set).toBe('function')
  })
})
