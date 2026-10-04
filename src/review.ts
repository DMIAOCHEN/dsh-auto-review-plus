import type { GenerateOptions, LlmRuntime, StreamChunk } from '@deepseek-ai/dsh-llm'
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
  // Every unconditional field is checked against GenerateOptions here; the optional reasoning
  // effort is added by its own branch, so a value that does not fit its type fails to compile
  // instead of being silently absorbed by a conditional spread.
  const base: Omit<GenerateOptions, 'reasoningEffort'> = {
    provider: input.provider,
    model: input.model,
    system: input.system,
    messages: [{ role: 'user', content: [{ type: 'text', text: input.userText }] }],
    temperature: 0,
    // ReviewRequestInput admits a plain string; GenerateOptions stamps the branded SessionId.
    sessionId: input.sessionId as GenerateOptions['sessionId'],
    signal: input.signal,
  }
  return deepFreeze(input.reasoningEffort === undefined
    ? base
    : { ...base, reasoningEffort: input.reasoningEffort as GenerateOptions['reasoningEffort'] })
}

/** The slice of the llm service this module needs. */
export interface ReasoningCapabilities {
  /**
   * Resolve one exact route's capability metadata.
   * @param provider - registered provider route to inspect.
   * @param model - exact model id passed to the adapter.
   * @param signal - optional cancellation for adapter-owned asynchronous lookup.
   */
  resolveModelInfo(
    provider: string,
    model: string,
    signal?: AbortSignal,
  ): Promise<{ reasoning?: { efforts?: readonly { id: string }[] } }>
}

/**
 * Compile-time proof that the real `LlmRuntime` still satisfies
 * {@link ReasoningCapabilities}. `ctx.llm` is assigned to this slice at every
 * call site in the host half, so `resolveModelInfo` drifting (a changed return
 * shape, a narrowed parameter) must fail the typecheck HERE, in this repository,
 * rather than only where a caller happens to pass the runtime.
 */
type AssertAssignable<Wide, Narrow extends Wide> = Narrow
/** Fails to compile on its own if `LlmRuntime` stops satisfying the slice. */
export type LlmRuntimeSatisfiesReasoningCapabilities = AssertAssignable<ReasoningCapabilities, LlmRuntime>

export interface ResolveReviewReasoningInput {
  readonly llm: ReasoningCapabilities
  readonly provider: string
  readonly model: string
  readonly sessionEffort?: string
  readonly fallbackEffort?: string
  /** Cancellation for the capability query; the capability lookup never outlives the review. */
  readonly signal?: AbortSignal
}

/**
 * The reasoning level the review request should send: the session's own level
 * verbatim, else the configured fallback when this exact model offers it.
 * Never invents a level a model cannot take: `LlmRuntime.resolveCallConfig`
 * rejects an explicit, unsupported effort before any provider I/O, so sending
 * one would trade a working review for `UNSUPPORTED_REASONING_EFFORT`.
 *
 * A failure of the capability query itself is NOT caught: a gate that was told
 * to use a fallback level and cannot establish that the model takes it must fail
 * loudly rather than silently review without the configured level.
 * @param input - capability source, route, and the two candidate levels.
 * @returns the level to send, or undefined to send none.
 * @throws whatever the capability query throws, unchanged.
 */
export async function resolveReviewReasoning(input: ResolveReviewReasoningInput): Promise<string | undefined> {
  if (input.sessionEffort !== undefined) return input.sessionEffort
  if (input.fallbackEffort === undefined) return undefined
  const info = await input.llm.resolveModelInfo(input.provider, input.model, input.signal)
  const offered = info.reasoning?.efforts?.some(effort => effort.id === input.fallbackEffort) === true
  return offered ? input.fallbackEffort : undefined
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

/**
 * Count the members written in the raw top-level JSON object.
 *
 * `JSON.parse` folds duplicate members away (last one wins), so a repeated
 * `risk` or `decision` cannot be seen in the parsed record; the raw text is the
 * only place it is still visible. String literals are removed first so a colon
 * inside a value or a key cannot be mistaken for a member separator, then every
 * colon seen while the outermost object is open counts one member.
 * @param text - the raw reviewer text handed to `JSON.parse`.
 * @returns the number of members the text literally contains.
 */
function topLevelMemberCount(text: string): number {
  const syntax = text.replace(/"(?:\\.|[^"\\])*"/gs, '')
  let depth = 0
  let count = 0
  for (const char of syntax) {
    switch (char) {
      case '{':
      case '[':
        depth += 1
        break
      case '}':
      case ']':
        depth -= 1
        break
      case ':':
        if (depth === 1) count += 1
        break
      default:
        break
    }
  }
  return count
}

/** Parse the single strict-JSON decision object of the closed risk/decision protocol. */
export function parseDecision(text: string): AutoReviewDecision {
  const parsed: unknown = JSON.parse(text)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('auto-review-plus: reviewer returned a non-object decision')
  }
  const record = parsed as Record<string, unknown>
  const members = Object.keys(record)
  if (topLevelMemberCount(text) !== members.length) {
    throw new Error('auto-review-plus: reviewer repeated a top-level JSON member')
  }
  const risk = record['risk']
  const decision = record['decision']
  if (members.length === 2 && decision === 'allow' && (risk === 'low' || risk === 'medium')) {
    return { risk, decision: 'allow' }
  }
  if (members.length === 2 && decision === 'deny' && (risk === 'medium' || risk === 'high')) {
    return { risk, decision: 'deny' }
  }
  if (members.length === 3 && decision === 'deny' && (risk === 'medium' || risk === 'high')
    && Object.hasOwn(record, 'reason') && typeof record['reason'] === 'string') {
    return { risk, decision: 'deny', reason: record['reason'] }
  }
  throw new Error(`auto-review-plus: invalid reviewer decision ${JSON.stringify(parsed)}`)
}
