/**
 * When the reviewer-route prompt opens by itself.
 *
 * Kept apart from the control so the policy is a pure decision plus two small
 * pieces of memory, and can be checked without rendering anything.
 *
 * THE RULE: the question belongs to **entering Auto**, not to Auto being on.
 * "Auto is active and nothing is pinned" cannot decide it — that is true every
 * time the session is merely *restored* (a session switch remounts the composer
 * control, a reload starts a new page, a restart starts a new process), and
 * asking then is the bug this module exists to prevent. Restoring Auto is not an
 * entry, so nothing is asked; leaving Auto ends the fragment, so the next entry
 * asks again.
 * @module dsh-auto-review-plus/client/reviewer-route-prompt
 */
import type { ReviewerRouteValue } from './remote.ts'

/** Inputs of the automatic-prompt decision. */
export interface ReviewerRoutePromptInput {
  /**
   * Whether THIS PAGE watched the session enter Auto: either the control
   * switched it on itself, or it saw the preset change to Auto while mounted.
   * An already-Auto session that merely mounts reports `false`.
   */
  readonly entered: boolean
  /**
   * The session's pinned route: null when it has none, `undefined` while the
   * host has not answered yet. The two are different answers — an unknown pin
   * must never read as "no pin".
   */
  readonly route: ReviewerRouteValue | null | undefined
  /** Whether this session was already asked inside the current Auto fragment. */
  readonly answered: boolean
  /** Whether any confirmation is open in this control right now. */
  readonly dialogOpen: boolean
}

/**
 * Decide whether Auto must ask for a reviewer model now.
 *
 * All four conditions are required: this page watched Auto being entered, there
 * is no pin, the fragment's one question was not asked yet, and no dialog
 * already owns the screen. The prompt exists to make the choice once per entry,
 * so it must not reappear after the person declined it, answered it, or while
 * another confirmation is open.
 * @param input - current entry, route knowledge and prompt state.
 * @returns whether the prompt opens now.
 */
export function shouldPromptReviewerRoute(input: ReviewerRoutePromptInput): boolean {
  return input.entered && input.route === null && !input.answered && !input.dialogOpen
}

/** One session's memory: was Auto entered here, and did that fragment ask already. */
interface SessionPromptMemory {
  /** Whether this page watched the session enter Auto. */
  entered: boolean
  /** Whether the fragment that entry started has asked already. */
  answered: boolean
}

/**
 * Page-lifetime prompt memory, one entry per session.
 *
 * MODULE LEVEL ON PURPOSE (`reviewerRoutePrompts` below) — a control instance is
 * exactly what a session switch destroys, so memory living inside the control
 * forgot the answer and asked again on the way back. It still writes nothing
 * anywhere: a reload or a restart starts a fresh page, where Auto can only be
 * restored and therefore must not ask.
 */
export class ReviewerRoutePrompts {
  private readonly sessions = new Map<string, SessionPromptMemory>()

  /** Memory of one session, created on first use. */
  private session(sessionId: string): SessionPromptMemory {
    const existing = this.sessions.get(sessionId)
    if (existing !== undefined) return existing
    const created: SessionPromptMemory = { entered: false, answered: false }
    this.sessions.set(sessionId, created)
    return created
  }

  /**
   * Start a new Auto fragment: this page watched the session enter Auto, and the
   * fragment's question has not been asked yet.
   * @param sessionId - session that entered Auto.
   */
  enter(sessionId: string): void {
    this.sessions.set(sessionId, { entered: true, answered: false })
  }

  /**
   * End the fragment because Auto was left: the next entry is a new fragment, so
   * it asks again (the person explicitly wants the question back on re-entry).
   * @param sessionId - session that left Auto.
   */
  leave(sessionId: string): void {
    this.sessions.delete(sessionId)
  }

  /**
   * Record that one session was asked, whichever way it answered.
   * @param sessionId - session whose prompt ran.
   */
  answer(sessionId: string): void {
    this.session(sessionId).answered = true
  }

  /**
   * Whether one session was already asked inside the current fragment.
   * @param sessionId - session to read.
   * @returns true once {@link answer} ran for that session.
   */
  isAnswered(sessionId: string): boolean {
    return this.session(sessionId).answered
  }

  /**
   * Whether this page watched that session enter Auto.
   * @param sessionId - session to read.
   * @returns true inside the fragment {@link enter} opened.
   */
  hasEntered(sessionId: string): boolean {
    return this.session(sessionId).entered
  }
}

/**
 * The page's prompt memory.
 *
 * One instance for the whole page is the whole point: the composer control is
 * unmounted and remounted by a session switch, and this memory has to outlive
 * that.
 */
export const reviewerRoutePrompts = new ReviewerRoutePrompts()

/** One session's Auto state as this control already saw it. */
interface AutoSighting {
  readonly sessionId: string
  readonly active: boolean
}

/** How one control's view of Auto changed since it last looked. */
export type AutoEntryChange = 'entered' | 'left' | null

/**
 * Per-control watcher that answers "was this a real entry, or a restore?".
 *
 * It is per CONTROL (a `useRef`), not per page: what makes an entry real is that
 * *this* control watched the preset change while it was mounted. Its first known
 * value — even `true` — is a restore, because a control that mounts into an
 * already-Auto session has seen no change at all.
 */
export class ReviewerRouteAutoWatch {
  private sighting: AutoSighting | null = null

  /**
   * Fold one observation of the host's Auto state.
   * @param sessionId - session this control is showing.
   * @param active - whether that session's current preset is Auto.
   * @returns 'entered' / 'left' for a change this control watched, else null.
   */
  observe(sessionId: string, active: boolean): AutoEntryChange {
    const previous = this.sighting
    if (previous === null || previous.sessionId !== sessionId) {
      this.sighting = { sessionId, active }
      return null
    }
    if (previous.active === active) return null
    this.sighting = { sessionId, active }
    return active ? 'entered' : 'left'
  }

  /**
   * Record what this control believes Auto is, without having watched a change:
   * the control's own switch-on, or the rollback of one that failed. The point
   * is that the host's later confirmation of it is not read as a second entry —
   * and that a rollback goes back to `false`, so the next real entry still asks.
   * @param sessionId - session this control is showing.
   * @param active - whether this control believes that session is on Auto.
   */
  record(sessionId: string, active: boolean): void {
    this.sighting = { sessionId, active }
  }
}

/**
 * The whole Auto-entry policy in one object, so the control only wires effects.
 *
 * It joins the two pieces of state: the page memory ({@link ReviewerRoutePrompts},
 * survives remounts) and this control's watcher ({@link ReviewerRouteAutoWatch},
 * decides whether an observation is an entry).
 */
export class ReviewerRouteAutoFragment {
  private readonly watch = new ReviewerRouteAutoWatch()
  /** Page memory this fragment reads and writes. */
  private readonly memory: ReviewerRoutePrompts

  /**
   * @param memory - page memory to use; the control passes the shared instance.
   */
  constructor(memory: ReviewerRoutePrompts = reviewerRoutePrompts) {
    this.memory = memory
  }

  /**
   * Fold one observation of the host's Auto state: a change this control watched
   * opens or closes the fragment, a first sighting (mount, session switch,
   * reload) does neither.
   * @param sessionId - session this control is showing.
   * @param auto - whether that session's current preset is Auto.
   */
  observe(sessionId: string, auto: boolean): void {
    const change = this.watch.observe(sessionId, auto)
    if (change === 'entered') this.memory.enter(sessionId)
    else if (change === 'left') this.memory.leave(sessionId)
  }

  /**
   * Announce that this control switched Auto on itself. Its own gate already
   * asked for the reviewer model, so the fragment starts ANSWERED: the automatic
   * prompt must not stack a second dialog on top of the one just confirmed.
   *
   * It is recorded before the preset write is issued, because the projection
   * update and the command response can arrive in either order; the watch is
   * told about it too, so the confirmation is not read as another entry. If that
   * write fails, {@link abandonEntry} takes it back.
   * @param sessionId - session this control just switched to Auto.
   */
  enterFromControl(sessionId: string): void {
    this.watch.record(sessionId, true)
    this.memory.enter(sessionId)
    this.memory.answer(sessionId)
  }

  /**
   * Take back {@link enterFromControl} when the preset write failed: nothing was
   * entered, so the next real entry must ask again.
   * @param sessionId - session whose preset write failed.
   */
  abandonEntry(sessionId: string): void {
    this.watch.record(sessionId, false)
    this.memory.leave(sessionId)
  }

  /**
   * Whether the automatic prompt opens now for this session.
   * @param sessionId - session this control is showing.
   * @param input - the session's pin knowledge and whether a dialog is up.
   * @returns whether the prompt opens now.
   */
  shouldAsk(
    sessionId: string,
    input: { readonly route: ReviewerRouteValue | null | undefined; readonly dialogOpen: boolean },
  ): boolean {
    return shouldPromptReviewerRoute({
      entered: this.memory.hasEntered(sessionId),
      route: input.route,
      answered: this.memory.isAnswered(sessionId),
      dialogOpen: input.dialogOpen,
    })
  }

  /**
   * Record that the automatic prompt was answered or closed: the fragment's one
   * question is spent.
   * @param sessionId - session whose prompt ended.
   */
  answered(sessionId: string): void {
    this.memory.answer(sessionId)
  }
}
