/**
 * The chooser's decisions, kept out of the control so each one is a plain
 * function or object that can be checked without rendering anything.
 * @module dsh-auto-review-plus/client/reviewer-route-chooser
 */
import type { ReviewerRouteValue, ReviewerRouteView } from './remote.ts'

/** Inputs of the "adopt the host's answer" decision. */
export interface ReviewerRouteAdoptionInput {
  /** Host answer about this session, or null while it has not arrived. */
  readonly view: ReviewerRouteView | null
  /** Whether the person already edited the chooser in this opening. */
  readonly edited: boolean
  /** The host answer already adopted, compared by identity. */
  readonly adopted: ReviewerRouteView | null
}

/**
 * What one adoption step must do.
 *
 * `pin` carries the route the chooser has to LOAD, not just display: a pinned
 * provider's model list and a pinned model's reasoning efforts are separate
 * reads, and a chooser that only assigns the draft shows "this route is
 * unavailable" and "no reasoning levels" for a perfectly valid pin.
 */
export type ReviewerRouteAdoption =
  | { readonly kind: 'wait' }
  | { readonly kind: 'follow' }
  | { readonly kind: 'pin'; readonly route: ReviewerRouteValue }

/**
 * Decide whether a host answer is adopted into the chooser now.
 *
 * Two rules matter. One answer is adopted once (`adopted` is compared by
 * identity, so a re-render is not a new answer), and an edit already in
 * progress always wins: a late answer must never overwrite what the person is
 * choosing.
 * @param input - host answer, edit state, and the answer already adopted.
 * @returns the adoption step to run.
 */
export function planReviewerRouteAdoption(input: ReviewerRouteAdoptionInput): ReviewerRouteAdoption {
  if (input.view === null) return { kind: 'wait' }
  if (input.view === input.adopted) return { kind: 'wait' }
  if (input.edited) return { kind: 'wait' }
  if (input.view.route === null) return { kind: 'follow' }
  return { kind: 'pin', route: input.view.route }
}

/** The effects one adoption step has on the caller's state. */
export interface ReviewerRouteAdoptionActions {
  /** Record the route the chooser shows (null is "follow the session model"). */
  setDraft(route: ReviewerRouteValue | null): void
  /** Load one provider's model list. */
  loadModels(provider: string): void
  /** Load one exact route's reasoning efforts. */
  loadEfforts(route: ReviewerRouteValue): void
}

/**
 * Execute one adoption step.
 *
 * Adopting a pinned route is not an assignment: it needs that provider's model
 * list and that model's reasoning efforts, exactly like a pick does. Routing
 * both through this one function is what keeps them equal — the regression it
 * prevents is a valid pin rendered as "this route is unavailable" with "no
 * reasoning levels".
 * @param plan - the step decided by {@link planReviewerRouteAdoption}.
 * @param actions - the caller's state setters and loaders.
 */
export function runReviewerRouteAdoption(
  plan: ReviewerRouteAdoption,
  actions: ReviewerRouteAdoptionActions,
): void {
  if (plan.kind === 'wait') return
  if (plan.kind === 'follow') {
    actions.setDraft(null)
    return
  }
  actions.setDraft(plan.route)
  actions.loadModels(plan.route.provider)
  actions.loadEfforts(plan.route)
}

/** The failure copy one chooser shows, from its write and read failures. */
export interface ReviewerRouteChooserFailures {
  /** Failure of the last write this control attempted, or null. */
  readonly write: string | null
  /** Failure of the last host read, or null. */
  readonly read: string | null
}

/**
 * Resolve the failure line of a chooser.
 *
 * A write failure wins: it is the one the person caused by pressing the primary
 * action, so showing a stale read failure instead would hide it.
 * @param failures - both recorded failures.
 * @returns the copy to show, or null.
 */
export function reviewerRouteChooserFailure(failures: ReviewerRouteChooserFailures): string | null {
  return failures.write ?? failures.read
}

/** The three independent loads of one chooser, each fenced by its own counter. */
export type ReviewerRouteLoadKind = 'answer' | 'models' | 'efforts'

/**
 * One generation counter per load kind.
 *
 * The kinds must NOT share a counter: adopting a pin starts a provider's model
 * list AND that model's capability read, and a shared counter would let the
 * second read discard the first — which is exactly the empty model list that
 * makes a valid pin look unavailable. Within one kind, a newer start always
 * supersedes an older answer: two quick provider switches must not let the
 * slower list win, because that list belongs to the provider nobody selected
 * while the model picked from it would be stored under the new one.
 */
export class ReviewerRouteLoadFences {
  private readonly generation: Record<ReviewerRouteLoadKind, number> = {
    answer: 0,
    models: 0,
    efforts: 0,
  }

  /**
   * Start one load and fence it against later starts of the same kind.
   * @param kind - which load is starting.
   * @returns a predicate that stays true only while this load is the newest.
   */
  start(kind: ReviewerRouteLoadKind): () => boolean {
    const mine = ++this.generation[kind]
    return () => this.generation[kind] === mine
  }

  /**
   * Drop every in-flight load, e.g. because the session's answer was replaced.
   */
  invalidateAll(): void {
    this.generation.answer += 1
    this.generation.models += 1
    this.generation.efforts += 1
  }
}
