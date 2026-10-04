import { describe, expect, it, vi } from 'vitest'
import { autoReviewPlusRouteProjectionDefinition, reviewerRoute, setReviewerRoute } from '../src/reviewer-route.ts'

const { apply, init, key, stateVersion } = autoReviewPlusRouteProjectionDefinition

const routeEvent = (route: { provider: string; model: string } | null) => ({
  type: 'auto-review-plus/reviewer-route', data: { route },
}) as never

describe('reviewer route projection', () => {
  it('starts following the session route', () => {
    expect(init()).toBeNull()
    expect(key).toBe('autoReviewPlusRoute')
    expect(stateVersion).toBe(1)
  })

  it('lets the last selection win', () => {
    const pinned = apply(apply(init(), routeEvent({ provider: 'zai', model: 'glm-5.3-flash' })), routeEvent(null))
    expect(pinned).toBeNull()
  })

  it('ignores unrelated events', () => {
    expect(apply(null, { type: 'other/event', data: {} } as never)).toBeNull()
  })
})

describe('reviewer route helpers', () => {
  it('reads a detached copy of the pinned route', () => {
    const pinned = { provider: 'zai', model: 'glm-5.3-flash' }
    const projections = { stateOf: vi.fn(() => pinned) }
    const read = reviewerRoute(projections as never, {} as never)
    expect(read).toEqual(pinned)
    expect(read).not.toBe(pinned)
  })

  it('reports no pin when the state is null', () => {
    expect(reviewerRoute({ stateOf: () => null } as never, {} as never)).toBeUndefined()
  })

  it('appends the chosen route and the explicit reset', () => {
    const append = vi.fn()
    setReviewerRoute({ append } as never, { provider: 'zai', model: 'glm-5.3-flash' })
    setReviewerRoute({ append } as never, null)
    expect(append.mock.calls).toEqual([
      ['auto-review-plus/reviewer-route', { route: { provider: 'zai', model: 'glm-5.3-flash' } }],
      ['auto-review-plus/reviewer-route', { route: null }],
    ])
  })
})
