import { describe, expect, it } from 'vitest'
import { ReviewerRoutePrompts, shouldPromptReviewerRoute } from '../../src/client/reviewer-route-prompt.ts'

const route = { provider: 'zai', model: 'glm-5.3-flash' }

describe('shouldPromptReviewerRoute', () => {
  it('asks when the session has no pin, was never asked, and no dialog is open', () => {
    expect(shouldPromptReviewerRoute({ route: null, answered: false, dialogOpen: false })).toBe(true)
  })

  it('stays quiet while the host has not answered yet', () => {
    // `undefined` is "unknown", not "no pin": prompting on it would ask again
    // every time the control remounts before the read settles.
    expect(shouldPromptReviewerRoute({ route: undefined, answered: false, dialogOpen: false })).toBe(false)
  })

  it('stays quiet when the session already pinned a route', () => {
    expect(shouldPromptReviewerRoute({ route, answered: false, dialogOpen: false })).toBe(false)
  })

  it('stays quiet once this session was asked', () => {
    expect(shouldPromptReviewerRoute({ route: null, answered: true, dialogOpen: false })).toBe(false)
  })

  it('never stacks on an open confirmation', () => {
    expect(shouldPromptReviewerRoute({ route: null, answered: false, dialogOpen: true })).toBe(false)
  })
})

describe('ReviewerRoutePrompts', () => {
  it('remembers one answer per session and nothing else', () => {
    const prompts = new ReviewerRoutePrompts()
    expect(prompts.isAnswered('a')).toBe(false)
    prompts.answer('a')
    expect(prompts.isAnswered('a')).toBe(true)
    expect(prompts.isAnswered('b')).toBe(false)
  })
})
