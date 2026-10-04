import { describe, expect, it, vi } from 'vitest'
import type { FinishReason, StreamChunk } from '@deepseek-ai/dsh-llm'
import { buildReviewRequest, parseDecision, readReviewDecision, resolveReviewReasoning } from '../src/review.ts'
// Added by Task 11: the review-run surface the new cases at the end exercise.
// Separate import lines on purpose — this file is append-only below, and the
// already-reviewed cases above keep their imports byte for byte.
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'
import {
  reviewFailureCode,
  runReview,
  type ReviewRunInput,
  type UnsupportedSessionEffort,
} from '../src/review.ts'

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

// Added by Task 5 (the folded-in review backlog). Append-only: every case above
// is the already-reviewed set and is intentionally untouched.
describe('resolveReviewReasoning capability contract', () => {
  it('never consults capabilities when no fallback level is configured', async () => {
    const client = llm(['low'])
    await expect(resolveReviewReasoning({
      llm: client as never, provider: 'p', model: 'm',
    })).resolves.toBeUndefined()
    expect(client.resolveModelInfo).toHaveBeenCalledTimes(0)
  })

  it('asks the capability query about the reviewed provider and model', async () => {
    const client = llm(['low', 'high'])
    await expect(resolveReviewReasoning({
      llm: client as never, provider: 'p', model: 'm', fallbackEffort: 'low',
    })).resolves.toBe('low')
    expect(client.resolveModelInfo).toHaveBeenCalledWith('p', 'm', undefined)
  })

  it('forwards the caller cancellation signal into the capability query', async () => {
    const client = llm(['low'])
    const controller = new AbortController()
    await expect(resolveReviewReasoning({
      llm: client as never, provider: 'p', model: 'm', fallbackEffort: 'low', signal: controller.signal,
    })).resolves.toBe('low')
    expect(client.resolveModelInfo).toHaveBeenCalledWith('p', 'm', controller.signal)
  })

  it('propagates a capability failure unchanged instead of reviewing without the fallback', async () => {
    const failure = new Error('no adapter registered for provider "p": p/m is unavailable')
    const client = { resolveModelInfo: vi.fn(async () => { throw failure }) }
    const thrown = await resolveReviewReasoning({
      llm: client as never, provider: 'p', model: 'm', fallbackEffort: 'low',
    }).then(() => undefined, (error: unknown) => error)
    expect(thrown).toBe(failure)
    expect((thrown as Error).message).toContain('p/m')
  })
})

// Added by Task 11. Append-only for the same reason as the block above: every
// case before this line is the already-reviewed set and is intentionally
// untouched.
const allow = '{"risk":"low","decision":"allow"}'
const unsupportedFinish = (route = 'pinned/reviewer'): StreamChunk => finish({
  kind: 'error',
  failure: {
    code: 'UNSUPPORTED_REASONING_EFFORT',
    message: `provider "${route}" does not support reasoning effort "high"`,
  },
})
const answered = (text: string): StreamChunk[] => [textDelta(text), finish(stop)]

/** One scripted reviewer answer: chunks to stream, or a failure to throw. */
type ReviewAnswer = readonly StreamChunk[] | Error

/**
 * A reviewer that records every request it is handed and answers the Nth call
 * from `answers`. An unscripted call throws, so "no extra call happened" is
 * observable as a rejection rather than as silence.
 * @param answers - one answer per expected call, in call order.
 * @returns the recorded requests, the call mock, and the llm slice under test.
 */
function stubReviewer(answers: readonly ReviewAnswer[]) {
  const requests: GenerateOptions[] = []
  const resolveModelInfo = vi.fn(async () => ({ reasoning: { efforts: [{ id: 'low', name: 'low' }] } }))
  const stream = vi.fn((request: GenerateOptions): AsyncIterable<StreamChunk> => {
    const answer = answers[requests.length]
    requests.push(request)
    if (answer === undefined) throw new Error(`unexpected review call ${requests.length}`)
    if (answer instanceof Error) throw answer
    return streamOf(answer)
  })
  return {
    requests,
    stream,
    resolveModelInfo,
    llm: { stream, resolveModelInfo } as unknown as ReviewRunInput['llm'],
  }
}

/** The one review-run input every case here varies a single field of. */
function reviewRun(
  llm: ReviewRunInput['llm'],
  onUnsupportedSessionEffort: (detail: UnsupportedSessionEffort) => void = () => {},
): ReviewRunInput {
  return {
    llm,
    provider: 'pinned',
    model: 'reviewer',
    sessionId: 'session-1',
    sessionEffort: 'high',
    system: 'REVIEW_POLICY',
    userText: 'PENDING ACTION',
    signal: new AbortController().signal,
    onUnsupportedSessionEffort,
  }
}

describe('runReview session-level retry', () => {
  it('retries exactly once without the level when the pinned route rejects it', async () => {
    const reviewer = stubReviewer([[unsupportedFinish()], answered(allow)])
    const retries: unknown[] = []
    await expect(runReview(reviewRun(reviewer.llm, detail => { retries.push(detail) }))).resolves
      .toEqual({ risk: 'low', decision: 'allow' })
    expect(reviewer.stream).toHaveBeenCalledTimes(2)
    expect(reviewer.requests[0]?.reasoningEffort).toBe('high')
    expect(Object.hasOwn(reviewer.requests[1] as object, 'reasoningEffort')).toBe(false)
    expect(retries).toEqual([{ effort: 'high', provider: 'pinned', model: 'reviewer' }])
  })

  it('drops only the level: every other request field is unchanged on the retry', async () => {
    const reviewer = stubReviewer([[unsupportedFinish()], answered(allow)])
    await runReview(reviewRun(reviewer.llm))
    const [first, second] = reviewer.requests
    expect({ ...second, reasoningEffort: 'high' }).toEqual(first)
    expect(second?.temperature).toBe(0)
    expect(second?.sessionId).toBe('session-1')
  })

  it('reports the rejected level and the route that rejected it, once', async () => {
    const reviewer = stubReviewer([[unsupportedFinish()], answered(allow)])
    const retries: unknown[] = []
    await runReview(reviewRun(reviewer.llm, detail => { retries.push(detail) }))
    expect(retries).toEqual([{ effort: 'high', provider: 'pinned', model: 'reviewer' }])
  })

  it('returns the decision the retry produced', async () => {
    const reviewer = stubReviewer([[unsupportedFinish()], answered('{"risk":"high","decision":"deny"}')])
    await expect(runReview(reviewRun(reviewer.llm))).resolves
      .toEqual({ risk: 'high', decision: 'deny' })
  })

  it('does not retry any other failure code', async () => {
    const reviewer = stubReviewer([[finish({ kind: 'error', failure: { code: 'AUTH', message: 'bad key' } })]])
    await expect(runReview(reviewRun(reviewer.llm)))
      .rejects.toThrow(/reviewer ended with error AUTH: bad key/)
    expect(reviewer.stream).toHaveBeenCalledTimes(1)
  })

  it('does not retry a plain failure whose message merely names the code', async () => {
    // The message carries the code text; a plain Error carries no code field.
    const reviewer = stubReviewer([[finish({
      kind: 'error',
      failure: { code: 'AUTH', message: 'UNSUPPORTED_REASONING_EFFORT is not the reason' },
    })]])
    await expect(runReview(reviewRun(reviewer.llm))).rejects.toThrow(/AUTH/)
    expect(reviewer.stream).toHaveBeenCalledTimes(1)
  })

  it('stays fail-closed when the retry fails too', async () => {
    const reviewer = stubReviewer([[unsupportedFinish()], [unsupportedFinish()]])
    await expect(runReview(reviewRun(reviewer.llm)))
      .rejects.toThrow(/reviewer ended with error UNSUPPORTED_REASONING_EFFORT/)
    expect(reviewer.stream).toHaveBeenCalledTimes(2)
  })

  it('surfaces the retry’s own failure rather than the first one', async () => {
    const reviewer = stubReviewer([
      [unsupportedFinish()],
      [finish({ kind: 'error', failure: { code: 'QUOTA', message: 'balance exhausted' } })],
    ])
    await expect(runReview(reviewRun(reviewer.llm)))
      .rejects.toThrow(/reviewer ended with error QUOTA: balance exhausted/)
    expect(reviewer.stream).toHaveBeenCalledTimes(2)
  })

  it('makes no extra call when the session named no level', async () => {
    const reviewer = stubReviewer([[unsupportedFinish()]])
    const { sessionEffort: _drop, ...withoutSessionEffort } = reviewRun(reviewer.llm)
    await expect(runReview(withoutSessionEffort))
      .rejects.toThrow(/reviewer ended with error UNSUPPORTED_REASONING_EFFORT/)
    expect(reviewer.stream).toHaveBeenCalledTimes(1)
  })

  it('does not retry a rejected FALLBACK level, which the capability query already checked', async () => {
    const reviewer = stubReviewer([[unsupportedFinish()]])
    const { sessionEffort: _drop, ...withoutSessionEffort } = reviewRun(reviewer.llm)
    await expect(runReview({ ...withoutSessionEffort, fallbackEffort: 'low' }))
      .rejects.toThrow(/UNSUPPORTED_REASONING_EFFORT/)
    expect(reviewer.resolveModelInfo).toHaveBeenCalledTimes(1)
    expect(reviewer.stream).toHaveBeenCalledTimes(1)
  })

  it('retries when the runtime throws the code synchronously instead of finishing with it', async () => {
    const reviewer = stubReviewer([
      Object.assign(new Error('unsupported effort'), { code: 'UNSUPPORTED_REASONING_EFFORT' }),
      answered(allow),
    ])
    await expect(runReview(reviewRun(reviewer.llm))).resolves
      .toEqual({ risk: 'low', decision: 'allow' })
    expect(reviewer.stream).toHaveBeenCalledTimes(2)
    expect(Object.hasOwn(reviewer.requests[1] as object, 'reasoningEffort')).toBe(false)
  })
})

describe('reviewFailureCode', () => {
  it('reads the code off a reviewer failure chunk', async () => {
    const thrown = await readReviewDecision(streamOf([unsupportedFinish()]))
      .then(() => undefined, (error: unknown) => error)
    expect(reviewFailureCode(thrown)).toBe('UNSUPPORTED_REASONING_EFFORT')
    expect(thrown).toBeInstanceOf(Error)
    expect((thrown as Error).message).toMatch(/reviewer ended with error UNSUPPORTED_REASONING_EFFORT/)
  })

  it('reads the code off a runtime error that carries it as a field', () => {
    expect(reviewFailureCode(Object.assign(new Error('x'), { code: 'NO_ADAPTER' }))).toBe('NO_ADAPTER')
  })

  it('reports no code for a plain error, a string, or an empty code', () => {
    expect(reviewFailureCode(new Error('UNSUPPORTED_REASONING_EFFORT'))).toBeUndefined()
    expect(reviewFailureCode('UNSUPPORTED_REASONING_EFFORT')).toBeUndefined()
    expect(reviewFailureCode(null)).toBeUndefined()
    expect(reviewFailureCode(Object.assign(new Error('x'), { code: '' }))).toBeUndefined()
  })
})
