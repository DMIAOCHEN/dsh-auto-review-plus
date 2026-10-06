import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  ReviewerRouteAutoFragment, ReviewerRoutePrompts, reviewerRoutePrompts,
  shouldPromptReviewerRoute as policy,
} from '../../src/client/reviewer-route-prompt.ts'
import type { ReviewerRoutePromptInput } from '../../src/client/reviewer-route-prompt.ts'

/**
 * The decision as the cases under `shouldPromptReviewerRoute` use it.
 *
 * Every one of them describes a session that HAS just entered Auto — that is the
 * whole reason the original five existed ("Auto is active and nothing is
 * decided yet") — so the entry condition is filled in here, and the cases that
 * are about *restoring* Auto call `policy` directly with `entered: false`.
 */
const shouldPromptReviewerRoute = (input: Omit<ReviewerRoutePromptInput, 'entered'>): boolean =>
  policy({ ...input, entered: true })

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

  it('stays quiet when Auto is merely RESTORED (the reported bug)', () => {
    // A control that mounts into an already-Auto session — a session switch, a
    // reload, a restart — has not been entered here. "Auto is on and nothing is
    // pinned" is not an entry; reading it as one is what asked again every time.
    expect(policy({ entered: false, route: null, answered: false, dialogOpen: false })).toBe(false)
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

  it('opens a fragment that has not asked yet', () => {
    const prompts = new ReviewerRoutePrompts()
    expect(prompts.hasEntered('a')).toBe(false)
    prompts.enter('a')
    expect(prompts.hasEntered('a')).toBe(true)
    expect(prompts.isAnswered('a')).toBe(false)
  })

  it('makes a fresh fragment ask again after an earlier one was answered', () => {
    const prompts = new ReviewerRoutePrompts()
    prompts.enter('a')
    prompts.answer('a')
    prompts.enter('a')
    expect(prompts.isAnswered('a')).toBe(false)
    expect(prompts.hasEntered('a')).toBe(true)
  })

  it('forgets the whole fragment when Auto is left', () => {
    const prompts = new ReviewerRoutePrompts()
    prompts.enter('a')
    prompts.answer('a')
    prompts.leave('a')
    expect(prompts.hasEntered('a')).toBe(false)
    expect(prompts.isAnswered('a')).toBe(false)
    // The next entry is a new fragment, so it asks.
    prompts.enter('a')
    expect(prompts.hasEntered('a')).toBe(true)
    expect(prompts.isAnswered('a')).toBe(false)
  })
})

describe('the page owns the prompt memory', () => {
  it('exports one instance for the whole page', () => {
    // Module level, not a `useRef` inside the control: the control unmounts on
    // every session switch, which is exactly when the memory must survive.
    expect(reviewerRoutePrompts).toBeInstanceOf(ReviewerRoutePrompts)
    reviewerRoutePrompts.enter('page-memory-probe')
    expect(new ReviewerRoutePrompts().hasEntered('page-memory-probe')).toBe(false)
    expect(reviewerRoutePrompts.hasEntered('page-memory-probe')).toBe(true)
    reviewerRoutePrompts.leave('page-memory-probe')
  })

  it('is what the control reads, not a per-instance copy', () => {
    const source = readFileSync(new URL('../../src/client/PermissionControl.tsx', import.meta.url), 'utf8')
    expect(source).not.toMatch(/new ReviewerRoutePrompts\(/)
    expect(source).toMatch(/new ReviewerRouteAutoFragment\(/)
  })
})

describe('the five behaviours the human asked for', () => {
  /** One page: the memory every control on that page shares. */
  function page(): { memory: ReviewerRoutePrompts; control: () => ReviewerRouteAutoFragment } {
    const memory = new ReviewerRoutePrompts()
    return { memory, control: () => new ReviewerRouteAutoFragment(memory) }
  }

  it('row 1 — the first switch to Auto asks, through the gate, and never twice', () => {
    const { control } = page()
    const instance = control()
    instance.observe('s', false)
    // The person picked Auto and confirmed the gate: this control switched it on.
    instance.enterFromControl('s')
    expect(instance.shouldAsk('s', { route: null, dialogOpen: false })).toBe(false)
    // The host confirms Auto afterwards — in whichever order the two arrive.
    instance.observe('s', true)
    expect(instance.shouldAsk('s', { route: null, dialogOpen: false })).toBe(false)
  })

  it('row 2 — switching to another session and back does not ask (the reported bug)', () => {
    const { control } = page()
    const first = control()
    first.observe('s', true)
    expect(first.shouldAsk('s', { route: null, dialogOpen: false })).toBe(false)
    // The composer unmounts and a new control mounts into the still-Auto session.
    const second = control()
    second.observe('s', true)
    expect(second.shouldAsk('s', { route: null, dialogOpen: false })).toBe(false)
  })

  it('row 3 — a page reload or a dsh restart does not ask either', () => {
    const { control } = page()
    const reloaded = control()
    reloaded.observe('s', true)
    expect(reloaded.shouldAsk('s', { route: null, dialogOpen: false })).toBe(false)
  })

  it('row 4 — Auto to another mode and back to Auto asks again', () => {
    const { control } = page()
    const instance = control()
    instance.observe('s', false)
    instance.enterFromControl('s')
    instance.observe('s', true)
    instance.observe('s', false)
    instance.observe('s', true)
    expect(instance.shouldAsk('s', { route: null, dialogOpen: false })).toBe(true)
  })

  it('row 5 — closing the prompt and remounting does not ask again in the same fragment', () => {
    const { memory, control } = page()
    const instance = control()
    instance.observe('s', true)
    instance.observe('s', false)
    instance.observe('s', true)
    expect(instance.shouldAsk('s', { route: null, dialogOpen: false })).toBe(true)
    instance.answered('s')
    const remounted = new ReviewerRouteAutoFragment(memory)
    remounted.observe('s', true)
    expect(remounted.shouldAsk('s', { route: null, dialogOpen: false })).toBe(false)
  })

  it('a control that never watched Auto cannot call a restore an entry', () => {
    const { control } = page()
    const instance = control()
    // First known value, even `false`: nothing to enter or leave.
    instance.observe('s', false)
    expect(instance.shouldAsk('s', { route: null, dialogOpen: false })).toBe(false)
  })

  it('a failed preset write abandons the entry it announced', () => {
    const { control } = page()
    const instance = control()
    instance.observe('s', false)
    instance.enterFromControl('s')
    instance.abandonEntry('s')
    expect(instance.shouldAsk('s', { route: null, dialogOpen: false })).toBe(false)
    // ...and the session can still be asked about when it really enters Auto.
    instance.observe('s', true)
    expect(instance.shouldAsk('s', { route: null, dialogOpen: false })).toBe(true)
  })

  it('says nothing while a dialog is already on screen', () => {
    const { control } = page()
    const instance = control()
    instance.observe('s', false)
    instance.observe('s', true)
    expect(instance.shouldAsk('s', { route: null, dialogOpen: true })).toBe(false)
  })
})
