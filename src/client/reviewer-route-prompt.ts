/**
 * When the reviewer-route prompt opens by itself.
 *
 * Kept apart from the control so the policy is a pure decision plus one small
 * piece of component memory, and can be checked without rendering anything.
 * @module dsh-auto-review-plus/client/reviewer-route-prompt
 */
import type { ReviewerRouteValue } from './remote.ts'

/** Inputs of the automatic-prompt decision. */
export interface ReviewerRoutePromptInput {
  /**
   * The session's pinned route: null when it has none, `undefined` while the
   * host has not answered yet. The two are different answers — an unknown pin
   * must never read as "no pin".
   */
  readonly route: ReviewerRouteValue | null | undefined
  /** Whether this session was already asked (and answered or declined). */
  readonly answered: boolean
  /** Whether any confirmation is open in this control right now. */
  readonly dialogOpen: boolean
}

/**
 * Decide whether Auto must ask for a reviewer model now.
 *
 * All three conditions are required: no pin, never asked for this session, and
 * no dialog already up. The prompt exists to make the choice once, so it must
 * not reappear after the person declined it, answered it, or while another
 * confirmation owns the screen.
 * @param input - current route knowledge and prompt state.
 * @returns whether the prompt opens now.
 */
export function shouldPromptReviewerRoute(input: ReviewerRoutePromptInput): boolean {
  return input.route === null && !input.answered && !input.dialogOpen
}

/**
 * In-memory record of the sessions that were already asked once.
 *
 * Component memory on purpose: the question is a per-visit one, it writes
 * nothing anywhere, and it disappears with the control (a reload asks again,
 * because a stale pin still does not exist).
 */
export class ReviewerRoutePrompts {
  private readonly answered = new Set<string>()

  /**
   * Record that one session was asked, whichever way it answered.
   * @param sessionId - session whose prompt ran.
   */
  answer(sessionId: string): void {
    this.answered.add(sessionId)
  }

  /**
   * Whether one session was already asked.
   * @param sessionId - session to read.
   * @returns true once {@link answer} ran for that session.
   */
  isAnswered(sessionId: string): boolean {
    return this.answered.has(sessionId)
  }
}
