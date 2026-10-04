import { describe, expect, it, vi } from 'vitest'
import {
  ReviewerRouteAttempt,
  ReviewerRouteLoadFences,
  commitReviewerRouteProviders,
  planReviewerRouteAdoption,
  reviewerRouteChooserFailure,
  reviewerRouteEffortsState,
  reviewerRouteOptionState,
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

describe('reviewerRouteOptionState', () => {
  it('calls a value with no arrived list pending, never unavailable', () => {
    // Fix round 2: `providers` arrives from its own call, so for one round trip
    // a pinned provider has no list at all. That is "loading", not a claim that
    // the host dropped the route.
    expect(reviewerRouteOptionState({ ids: [], loaded: false, value: 'zai' })).toBe('pending')
  })

  it('calls a value missing from an ARRIVED list unavailable', () => {
    expect(reviewerRouteOptionState({ ids: ['opencode-go'], loaded: true, value: 'zai' })).toBe('absent')
  })

  it('calls a listed value listed', () => {
    expect(reviewerRouteOptionState({ ids: ['zai'], loaded: true, value: 'zai' })).toBe('listed')
  })

  it('treats the explicit default as listed even with no list', () => {
    expect(reviewerRouteOptionState({ ids: [], loaded: false, value: '' })).toBe('listed')
  })
})

describe('reviewerRouteEffortsState', () => {
  it('reports a pending read as pending, never as a capability', () => {
    // Otherwise the row would assert "this model exposes no reasoning levels"
    // about a model nobody has interrogated yet.
    expect(reviewerRouteEffortsState({ answer: { kind: 'pending' }, route })).toBe('pending')
  })

  it('reports an answer that belongs to another route as pending', () => {
    expect(reviewerRouteEffortsState({
      answer: { kind: 'ready', route: { provider: route.provider, model: 'other' }, efforts: ['high'] },
      route,
    })).toBe('pending')
  })

  it('reports the exact route\'s answer as ready', () => {
    expect(reviewerRouteEffortsState({ answer: { kind: 'ready', route, efforts: [] }, route })).toBe('ready')
  })

  it('reports a FAILED read as failed, not as "no reasoning levels"', () => {
    // Fix round 3: an empty list and a broken read are different facts; only the
    // first one may be stated as the model exposing nothing.
    expect(reviewerRouteEffortsState({ answer: { kind: 'failed', route }, route })).toBe('failed')
  })

  it('reports a failed read for another route as pending', () => {
    expect(reviewerRouteEffortsState({
      answer: { kind: 'failed', route: { provider: route.provider, model: 'other' } },
      route,
    })).toBe('pending')
  })

  it('reports pending while the chooser follows the session', () => {
    expect(reviewerRouteEffortsState({ answer: { kind: 'ready', route, efforts: ['high'] }, route: null }))
      .toBe('pending')
  })
})

describe('commitReviewerRouteProviders', () => {
  it('commits an accepted answer', () => {
    const commit = vi.fn()
    commitReviewerRouteProviders(true, [{ id: 'zai', name: 'Z.ai' }], commit)
    expect(commit).toHaveBeenCalledWith([{ id: 'zai', name: 'Z.ai' }])
  })

  it('commits nothing for a superseded answer, so it cannot mark the list loaded', () => {
    const commit = vi.fn()
    commitReviewerRouteProviders(false, [{ id: 'zai', name: 'Z.ai' }], commit)
    expect(commit).not.toHaveBeenCalled()
  })
})

describe('ReviewerRouteAttempt', () => {
  it('lets the current attempt act', () => {
    const attempts = new ReviewerRouteAttempt()
    expect(attempts.begin()()).toBe(true)
  })

  it('discards an attempt whose dialog was closed', () => {
    // The regression this pins: the person pressed Cancel while the preference
    // write was in flight, and the settlement switched the preset anyway.
    const attempts = new ReviewerRouteAttempt()
    const accepted = attempts.begin()
    attempts.cancel()
    expect(accepted()).toBe(false)
  })

  it('lets the attempt that follows a cancel act', () => {
    const attempts = new ReviewerRouteAttempt()
    attempts.cancel()
    expect(attempts.begin()()).toBe(true)
  })

  it('supersedes an older attempt with a newer one', () => {
    const attempts = new ReviewerRouteAttempt()
    const first = attempts.begin()
    const second = attempts.begin()
    expect(first()).toBe(false)
    expect(second()).toBe(true)
  })
})
