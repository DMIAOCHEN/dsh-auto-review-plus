import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { BlockAssembler } from '@deepseek-ai/dsh-llm'
import { deepFreeze } from '@deepseek-ai/dsh-util-values'

export type AutoReviewRisk = 'low' | 'medium' | 'high'
export type AutoReviewDecision =
  | { readonly risk: 'low' | 'medium'; readonly decision: 'allow' }
  | { readonly risk: 'medium' | 'high'; readonly decision: 'deny'; readonly reason?: string }

export interface ReviewRequestInput {
  readonly provider: string
  readonly model: string
  readonly sessionId: string
  /** Explicit level from the session header, else the configured fallback, else undefined. */
  readonly reasoningEffort?: string
  readonly system: string
  readonly userText: string
  readonly signal: AbortSignal
}

/** Build the frozen review request: session context plus the fixed policy. */
export function buildReviewRequest(input: ReviewRequestInput): GenerateOptions {
  return deepFreeze({
    provider: input.provider,
    model: input.model,
    system: input.system,
    messages: [{ role: 'user', content: [{ type: 'text', text: input.userText }] }],
    temperature: 0,
    // ReviewRequestInput admits a plain string; GenerateOptions stamps the branded SessionId.
    sessionId: input.sessionId as GenerateOptions['sessionId'],
    ...input.reasoningEffort === undefined ? {} : { reasoningEffort: input.reasoningEffort },
    signal: input.signal,
  }) as GenerateOptions
}

/** Consume zero or more reasoning blocks, one JSON text block, and one terminal stop. */
export async function readReviewDecision(stream: AsyncIterable<StreamChunk>): Promise<AutoReviewDecision> {
  const assembler = new BlockAssembler()
  let finished = false
  for await (const chunk of stream) {
    if (finished) throw new Error('auto-review-plus: reviewer emitted data after its terminal finish')
    assembler.push(chunk)
    if (chunk.type === 'finish') {
      finished = true
      if (chunk.reason.kind === 'error' || chunk.reason.kind === 'aborted') {
        const { code, message } = chunk.reason.failure
        throw new Error(`auto-review-plus: reviewer ended with ${chunk.reason.kind} ${code}: ${message}`)
      }
      if (chunk.reason.kind !== 'stop') {
        throw new Error(`auto-review-plus: reviewer ended with ${chunk.reason.kind}`)
      }
    }
  }
  if (!finished) throw new Error('auto-review-plus: reviewer emitted no terminal finish')
  const blocks = assembler.blocks()
  const final = blocks.at(-1)
  if (final?.type !== 'text' || blocks.slice(0, -1).some(block => block.type !== 'reasoning')) {
    throw new Error('auto-review-plus: reviewer must emit zero or more reasoning blocks followed by exactly one text block')
  }
  return parseDecision(final.text)
}

/** Parse the single strict-JSON decision object. */
export function parseDecision(text: string): AutoReviewDecision {
  const parsed: unknown = JSON.parse(text)
  if (typeof parsed !== 'object' || parsed === null) throw new Error('auto-review-plus: reviewer returned a non-object decision')
  const record = parsed as Record<string, unknown>
  const risk = record['risk']
  const decision = record['decision']
  if (risk === 'low' && decision === 'allow') return { risk: 'low', decision: 'allow' }
  if (risk === 'medium' && decision === 'allow') return { risk: 'medium', decision: 'allow' }
  if ((risk === 'medium' || risk === 'high') && decision === 'deny') {
    return Object.hasOwn(record, 'reason') && typeof record['reason'] === 'string'
      ? { risk, decision: 'deny', reason: record['reason'] }
      : { risk, decision: 'deny' }
  }
  throw new Error(`auto-review-plus: invalid reviewer decision ${JSON.stringify(parsed)}`)
}
