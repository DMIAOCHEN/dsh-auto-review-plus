import { describe, expect, it, vi } from 'vitest'
import type { FinishReason, StreamChunk } from '@deepseek-ai/dsh-llm'
import { buildReviewRequest, parseDecision, readReviewDecision, resolveReviewReasoning } from '../src/review.ts'

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
    expect(Object.hasOwn(buildReviewRequest(rest), 'reasoningEffort')).toBe(false)
  })

  it('pins temperature to zero and keeps one user message', () => {
    const request = buildReviewRequest(base)
    expect(request.temperature).toBe(0)
    expect(request.messages).toHaveLength(1)
  })
})

describe('parseDecision', () => {
  it('accepts the two-member low allow shape', () => {
    expect(parseDecision('{"risk":"low","decision":"allow"}')).toEqual({ risk: 'low', decision: 'allow' })
  })

  it('accepts the two-member medium allow shape', () => {
    expect(parseDecision('{"risk":"medium","decision":"allow"}')).toEqual({ risk: 'medium', decision: 'allow' })
  })

  it('accepts the two-member high deny shape', () => {
    expect(parseDecision('{"risk":"high","decision":"deny"}')).toEqual({ risk: 'high', decision: 'deny' })
  })

  it('accepts the three-member medium deny shape with a string reason', () => {
    expect(parseDecision('{"risk":"medium","decision":"deny","reason":"rm -rf /"}')).toEqual({
      risk: 'medium',
      decision: 'deny',
      reason: 'rm -rf /',
    })
  })

  it('accepts a reason whose text contains member syntax', () => {
    expect(parseDecision('{"risk":"high","decision":"deny","reason":"uses { x: \\"1\\" }"}')).toEqual({
      risk: 'high',
      decision: 'deny',
      reason: 'uses { x: "1" }',
    })
  })

  it('rejects a third member on an allow decision', () => {
    expect(() => parseDecision('{"risk":"low","decision":"allow","reason":"hedging"}')).toThrow(/invalid reviewer decision/)
  })

  it('rejects an unknown member on an allow decision', () => {
    expect(() => parseDecision('{"risk":"low","decision":"allow","note":"fyi"}')).toThrow(/invalid reviewer decision/)
  })

  it('rejects a fourth member on a deny decision', () => {
    expect(() => parseDecision('{"risk":"high","decision":"deny","reason":"r","extra":1}')).toThrow(/invalid reviewer decision/)
  })

  it('rejects a non-string reason', () => {
    expect(() => parseDecision('{"risk":"high","decision":"deny","reason":7}')).toThrow(/invalid reviewer decision/)
  })

  it('rejects a repeated risk member instead of letting the last one win', () => {
    expect(() => parseDecision('{"risk":"high","risk":"low","decision":"allow"}')).toThrow(/repeated a top-level JSON member/)
  })

  it('rejects a repeated decision member instead of letting the last one win', () => {
    expect(() => parseDecision('{"risk":"medium","decision":"allow","decision":"deny"}')).toThrow(/repeated a top-level JSON member/)
  })

  it('rejects a repeated decision member that folds into a legal allow', () => {
    expect(() => parseDecision('{"risk":"low","decision":"deny","decision":"allow"}')).toThrow(/repeated a top-level JSON member/)
  })

  it('rejects low risk with deny', () => {
    expect(() => parseDecision('{"risk":"low","decision":"deny"}')).toThrow(/invalid reviewer decision/)
  })

  it('rejects high risk with allow', () => {
    expect(() => parseDecision('{"risk":"high","decision":"allow"}')).toThrow(/invalid reviewer decision/)
  })

  it('rejects a missing risk member', () => {
    expect(() => parseDecision('{"decision":"allow"}')).toThrow(/invalid reviewer decision/)
  })

  it('rejects a missing decision member', () => {
    expect(() => parseDecision('{"risk":"low"}')).toThrow(/invalid reviewer decision/)
  })

  it('rejects a non-string risk', () => {
    expect(() => parseDecision('{"risk":1,"decision":"allow"}')).toThrow(/invalid reviewer decision/)
  })

  it('rejects a null decision', () => {
    expect(() => parseDecision('null')).toThrow(/non-object decision/)
  })

  it('rejects a numeric decision', () => {
    expect(() => parseDecision('42')).toThrow(/non-object decision/)
  })

  it('rejects an array decision', () => {
    expect(() => parseDecision('[]')).toThrow(/non-object decision/)
  })

  it('rejects a string decision', () => {
    expect(() => parseDecision('"str"')).toThrow(/non-object decision/)
  })
})

const stop: FinishReason = { kind: 'stop' }
const textDelta = (text: string, index = 0): StreamChunk => ({ type: 'text-delta', index, text })
const reasoningDelta = (text: string, index = 0): StreamChunk => ({ type: 'reasoning-delta', index, text })
const finish = (reason: FinishReason): StreamChunk => ({ type: 'finish', reason })

async function* streamOf(chunks: readonly StreamChunk[]): AsyncIterable<StreamChunk> {
  for (const chunk of chunks) yield chunk
}

describe('readReviewDecision', () => {
  it('reads the decision from zero or more reasoning blocks and one text block', async () => {
    await expect(readReviewDecision(streamOf([
      reasoningDelta('weighing the action', 0),
      textDelta('{"risk":"high","decision":"deny","reason":"rm -rf /"}', 1),
      finish(stop),
    ]))).resolves.toEqual({ risk: 'high', decision: 'deny', reason: 'rm -rf /' })
  })

  it('rejects a second text block', async () => {
    await expect(readReviewDecision(streamOf([
      textDelta('{"risk":"low",', 0),
      textDelta('"decision":"allow"}', 1),
      finish(stop),
    ]))).rejects.toThrow(/zero or more reasoning blocks followed by exactly one text block/)
  })

  it('rejects a reasoning block after the text block', async () => {
    await expect(readReviewDecision(streamOf([
      textDelta('{"risk":"low","decision":"allow"}', 0),
      reasoningDelta('second thoughts', 1),
      finish(stop),
    ]))).rejects.toThrow(/zero or more reasoning blocks followed by exactly one text block/)
  })

  it('rejects a stream with no terminal finish', async () => {
    await expect(readReviewDecision(streamOf([
      textDelta('{"risk":"low","decision":"allow"}'),
    ]))).rejects.toThrow(/no terminal finish/)
  })

  it('rejects data after the terminal finish', async () => {
    await expect(readReviewDecision(streamOf([
      textDelta('{"risk":"low","decision":"allow"}'),
      finish(stop),
      textDelta('extra'),
    ]))).rejects.toThrow(/emitted data after its terminal finish/)
  })

  it('rejects a second terminal finish', async () => {
    await expect(readReviewDecision(streamOf([
      textDelta('{"risk":"low","decision":"allow"}'),
      finish(stop),
      finish(stop),
    ]))).rejects.toThrow(/emitted data after its terminal finish/)
  })

  it('rejects an error finish with its code and message', async () => {
    await expect(readReviewDecision(streamOf([
      finish({ kind: 'error', failure: { code: 'AUTH', message: 'bad key' } }),
    ]))).rejects.toThrow(/reviewer ended with error AUTH: bad key/)
  })

  it('rejects an aborted finish with its code and message', async () => {
    await expect(readReviewDecision(streamOf([
      finish({ kind: 'aborted', failure: { code: 'ABORTED', message: 'cancelled' } }),
    ]))).rejects.toThrow(/reviewer ended with aborted ABORTED: cancelled/)
  })

  it('rejects a non-stop finish reason', async () => {
    await expect(readReviewDecision(streamOf([
      textDelta('{"risk":"low","decision":"allow"}'),
      finish({ kind: 'max-tokens' }),
    ]))).rejects.toThrow(/reviewer ended with max-tokens/)
  })

  it('rejects a well-formed stream whose decision breaks the protocol', async () => {
    await expect(readReviewDecision(streamOf([
      textDelta('{"risk":"low","decision":"deny"}'),
      finish(stop),
    ]))).rejects.toThrow(/invalid reviewer decision/)
  })
})

const llm = (efforts: readonly string[]) => ({
  resolveModelInfo: vi.fn(async () => ({ reasoning: { efforts: efforts.map(id => ({ id, name: id })) } })),
})

describe('resolveReviewReasoning', () => {
  it('prefers the session level and never consults capabilities for it', async () => {
    const client = llm([])
    await expect(resolveReviewReasoning({
      llm: client as never, provider: 'p', model: 'm', sessionEffort: 'high', fallbackEffort: 'low',
    })).resolves.toBe('high')
    expect(client.resolveModelInfo).not.toHaveBeenCalled()
  })

  it('applies the fallback when the session names none and the model supports it', async () => {
    await expect(resolveReviewReasoning({
      llm: llm(['off', 'low', 'high']) as never, provider: 'p', model: 'm', fallbackEffort: 'low',
    })).resolves.toBe('low')
  })

  it('omits the level when the model does not support the fallback', async () => {
    await expect(resolveReviewReasoning({
      llm: llm(['off', 'high']) as never, provider: 'p', model: 'm', fallbackEffort: 'low',
    })).resolves.toBeUndefined()
  })

  it('omits the level when no fallback is configured', async () => {
    await expect(resolveReviewReasoning({
      llm: llm(['low']) as never, provider: 'p', model: 'm',
    })).resolves.toBeUndefined()
  })

  it('omits the level when the model reports no reasoning support at all', async () => {
    await expect(resolveReviewReasoning({
      llm: { resolveModelInfo: async () => ({}) } as never,
      provider: 'p', model: 'm', fallbackEffort: 'low',
    })).resolves.toBeUndefined()
  })
})
