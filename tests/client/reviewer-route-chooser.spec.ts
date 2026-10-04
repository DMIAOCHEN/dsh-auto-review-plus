import { describe, expect, it, vi } from 'vitest'
import {
  ReviewerRouteLoadFences,
  planReviewerRouteAdoption,
  reviewerRouteChooserFailure,
  runReviewerRouteAdoption,
} from '../../src/client/reviewer-route-chooser.ts'
import type { ReviewerRouteView } from '../../src/client/remote.ts'

const route = { provider: 'zai', model: 'glm-5.3-flash' }
const pinnedView: ReviewerRouteView = { route, sessionRoute: { provider: 'opencode-go', model: 'flash' } }
const followView: ReviewerRouteView = { route: null, sessionRoute: { provider: 'opencode-go', model: 'flash' } }

/** Record every effect one adoption step has on the caller's state. */
function actions() {
  return {
    setDraft: vi.fn(),
    loadModels: vi.fn(),
    loadEfforts: vi.fn(),
  }
}

describe('planReviewerRouteAdoption', () => {
  it('adopts a pinned route as a route to LOAD, not just to display', () => {
    const plan = planReviewerRouteAdoption({ view: pinnedView, edited: false, adopted: null })
    expect(plan).toEqual({ kind: 'pin', route })
  })

  it('adopts an answer without a pin as "follow the session model"', () => {
    expect(planReviewerRouteAdoption({ view: followView, edited: false, adopted: null }))
      .toEqual({ kind: 'follow' })
  })

  it('waits while the host has not answered', () => {
    expect(planReviewerRouteAdoption({ view: null, edited: false, adopted: null })).toEqual({ kind: 'wait' })
  })

  it('adopts one answer once', () => {
    expect(planReviewerRouteAdoption({ view: pinnedView, edited: false, adopted: pinnedView }))
      .toEqual({ kind: 'wait' })
  })

  it('never overwrites an edit already in progress', () => {
    expect(planReviewerRouteAdoption({ view: pinnedView, edited: true, adopted: null }))
      .toEqual({ kind: 'wait' })
    expect(planReviewerRouteAdoption({ view: followView, edited: true, adopted: null }))
      .toEqual({ kind: 'wait' })
  })
})

describe('runReviewerRouteAdoption', () => {
  it('loads the pinned provider\'s models and the pinned model\'s efforts', () => {
    // The regression this pins: assigning the draft alone leaves both reads
    // undone, so a valid pin renders as "this route is unavailable" with "no
    // reasoning levels" — and the person cannot change it back either.
    const effects = actions()
    runReviewerRouteAdoption({ kind: 'pin', route }, effects)
    expect(effects.setDraft).toHaveBeenCalledWith(route)
    expect(effects.loadModels).toHaveBeenCalledWith('zai')
    expect(effects.loadEfforts).toHaveBeenCalledWith(route)
  })

  it('adopting "follow" loads nothing', () => {
    const effects = actions()
    runReviewerRouteAdoption({ kind: 'follow' }, effects)
    expect(effects.setDraft).toHaveBeenCalledWith(null)
    expect(effects.loadModels).not.toHaveBeenCalled()
    expect(effects.loadEfforts).not.toHaveBeenCalled()
  })

  it('a waiting step changes nothing', () => {
    const effects = actions()
    runReviewerRouteAdoption({ kind: 'wait' }, effects)
    expect(effects.setDraft).not.toHaveBeenCalled()
    expect(effects.loadModels).not.toHaveBeenCalled()
    expect(effects.loadEfforts).not.toHaveBeenCalled()
  })
})

describe('reviewerRouteChooserFailure', () => {
  it('shows the write failure, which the person caused in this dialog', () => {
    expect(reviewerRouteChooserFailure({ write: 'write failed', read: 'read failed' })).toBe('write failed')
  })

  it('falls back to the read failure', () => {
    expect(reviewerRouteChooserFailure({ write: null, read: 'read failed' })).toBe('read failed')
  })

  it('shows nothing when neither failed', () => {
    expect(reviewerRouteChooserFailure({ write: null, read: null })).toBeNull()
  })
})

describe('ReviewerRouteLoadFences', () => {
  it('rejects a superseded model list', () => {
    const fences = new ReviewerRouteLoadFences()
    const first = fences.start('models')
    const second = fences.start('models')
    expect(first()).toBe(false)
    expect(second()).toBe(true)
  })

  it('keeps an in-flight model list alive across a capability load', () => {
    // The two loads an adopted route needs must not invalidate each other:
    // sharing one counter would discard the model list and make a valid pin look
    // unavailable again.
    const fences = new ReviewerRouteLoadFences()
    const models = fences.start('models')
    const efforts = fences.start('efforts')
    expect(models()).toBe(true)
    expect(efforts()).toBe(true)
    expect(fences.start('answer')()).toBe(true)
    expect(models()).toBe(true)
  })

  it('drops every in-flight load when the answer is replaced', () => {
    const fences = new ReviewerRouteLoadFences()
    const models = fences.start('models')
    const efforts = fences.start('efforts')
    const answer = fences.start('answer')
    fences.invalidateAll()
    expect(models()).toBe(false)
    expect(efforts()).toBe(false)
    expect(answer()).toBe(false)
    expect(fences.start('answer')()).toBe(true)
  })
})
