import { describe, expect, it } from 'vitest'
import { buildReviewRequest } from '../src/review.ts'

const base = {
  provider: 'opencode-go',
  model: 'deepseek-v4.1-flash',
  sessionId: 'session-1',
  reasoningEffort: 'high',
  system: 'REVIEW_POLICY',
  userText: 'PENDING ACTION',
  signal: new AbortController().signal,
}

describe('buildReviewRequest', () => {
  it('carries the session id so providers can route the review request', () => {
    expect(buildReviewRequest(base).sessionId).toBe('session-1')
  })

  it('carries the session reasoning effort verbatim', () => {
    expect(buildReviewRequest(base).reasoningEffort).toBe('high')
  })

  it('omits reasoningEffort when neither the session nor the fallback names one', () => {
    const { reasoningEffort: _drop, ...rest } = base
    expect(buildReviewRequest(rest).reasoningEffort).toBeUndefined()
  })

  it('pins temperature to zero and keeps one user message', () => {
    const request = buildReviewRequest(base)
    expect(request.temperature).toBe(0)
    expect(request.messages).toHaveLength(1)
  })
})
