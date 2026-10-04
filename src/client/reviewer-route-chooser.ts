/**
 * The chooser's decisions, kept out of the control so each one is a plain
 * function or object that can be checked without rendering anything.
 * @module dsh-auto-review-plus/client/reviewer-route-chooser
 */
import type { ReviewerProviderView, ReviewerRouteValue, ReviewerRouteView } from './remote.ts'

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

/** How one select's current value has to be labelled. */
export type ReviewerRouteOptionState = 'listed' | 'pending' | 'absent'

/** Inputs of the "what does this select show" decision. */
export interface ReviewerRouteOptionInput {
  /** Ids the last ACCEPTED answer listed. */
  readonly ids: readonly string[]
  /** Whether that answer arrived for the list on screen. */
  readonly loaded: boolean
  /** The select's current value; the empty string is the explicit default. */
  readonly value: string
}

/**
 * Decide whether one select's value is a listed option, an option whose list has
 * not arrived, or one the host really does not offer.
 *
 * The distinction is the whole point: "this route is unavailable" is a claim
 * about the host, and until an answer arrives the chooser must not make it. A
 * pending value is shown as loading; only an accepted answer that omits the
 * value justifies the unavailable sentence.
 * @param input - listed ids, loaded flag, and the current value.
 * @returns which of the three states the value is in.
 */
export function reviewerRouteOptionState(input: ReviewerRouteOptionInput): ReviewerRouteOptionState {
  if (input.value === '') return 'listed'
  if (input.ids.includes(input.value)) return 'listed'
  return input.loaded ? 'absent' : 'pending'
}

/** Inputs of the reasoning-capability decision. */
export interface ReviewerRouteEffortsInput {
  /** Route whose efforts the accepted answer reported, or null while unknown. */
  readonly loadedFor: ReviewerRouteValue | null
  /** Route currently chosen, or null when the chooser follows the session. */
  readonly route: ReviewerRouteValue | null
}

/**
 * Whether the reasoning efforts on screen belong to the chosen route.
 *
 * Same rule as {@link reviewerRouteOptionState}: an effort list that has not
 * arrived (or belongs to another route) must not be reported as "this model
 * exposes no reasoning levels".
 * @param input - the route the accepted answer named and the chosen route.
 * @returns whether the efforts may be reported as this route's own.
 */
export function reviewerRouteEffortsLoaded(input: ReviewerRouteEffortsInput): boolean {
  if (input.loadedFor === null || input.route === null) return false
  return input.loadedFor.provider === input.route.provider
    && input.loadedFor.model === input.route.model
}

/**
 * Commit one provider list, or nothing when its answer was superseded.
 *
 * A fenced-out answer must not touch the displayed state — in particular it must
 * not mark the list as loaded, or a rejected host read would look like a
 * complete answer that happens to omit the pinned provider.
 * @param accepted - whether the answer's fence is still current.
 * @param providers - the answer.
 * @param commit - applies the answer to the caller's state.
 */
export function commitReviewerRouteProviders(
  accepted: boolean,
  providers: readonly ReviewerProviderView[],
  commit: (providers: readonly ReviewerProviderView[]) => void,
): void {
  if (!accepted) return
  commit(providers)
}

/**
 * One confirmation attempt whose settlement may still act.
 *
 * A dialog can be closed while its write is in flight, and that write's
 * settlement must then change nothing: switching the preset after the person
 * cancelled is the one outcome that is never acceptable. Closing invalidates
 * every in-flight attempt instead of trying to abort the request, so the dialog
 * stays closable at all times.
 */
export class ReviewerRouteAttempt {
  private generation = 0

  /**
   * Begin one attempt.
   * @returns a predicate that stays true only while this attempt is current.
   */
  begin(): () => boolean {
    const mine = ++this.generation
    return () => this.generation === mine
  }

  /** Invalidate every in-flight attempt (the dialog was closed). */
  cancel(): void {
    this.generation += 1
  }
}
