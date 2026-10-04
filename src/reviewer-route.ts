/**
 * Durable per-session reviewer route for Auto review, kept in a storage domain.
 *
 * Why a storage domain and NOT a custom session event (the rejected design):
 * a plugin living outside this repository cannot add an event type that a
 * resumed session will still accept, and the failure is deferred and
 * unrecoverable rather than immediate:
 *
 * 1. `KNOWN_SESSION_EVENT_TYPES` is a build-time constant, so event types
 *    defined by out-of-repo plugins are outside the known set by construction
 *    (the package's own comments record that event-name registration was
 *    rejected). `declare module '@deepseek-ai/dsh-session/types'` widens the
 *    TYPE table only; it cannot widen that runtime vocabulary.
 * 2. The persisted read path (`validateStoredEvents` in
 *    `@deepseek-ai/dsh-session-persistence`) is FAIL-CLOSED: an event whose
 *    type is unknown and not marked `ignorable` rejects with
 *    `SessionFormatUnsupportedError` instead of being skipped.
 * 3. `Session.append` cannot mark the record ignorable. For non-surface types
 *    its signature admits no third argument, and its implementation copies
 *    only `surfaceOp`/`sourceEventSeqs`, so an `ignorable` field would be
 *    silently dropped.
 * 4. The write path validates no vocabulary at all. So a custom event would be
 *    written and the session would keep running, and the whole log would only
 *    fail at RESUME time — by then the log cannot self-heal.
 *
 * Holding the same per-session state outside the session log is what the
 * official `@deepseek-ai/dsh-session-projection-cache` does (its own
 * `session_projcache` domain). `layout: 'per-record'` matches that precedent:
 * one document per session, individually disposable, with the version checked
 * per record.
 *
 * A MISSING record means "follow the session's own route". There is no stored
 * `null`: an explicit reset deletes the record.
 * @module dsh-auto-review-plus/reviewer-route
 */
import { z as zod } from 'zod'
import { defineDomain, domainTable, type KvTable } from '@deepseek-ai/dsh-storage-domain'
import type { SessionId } from '@deepseek-ai/dsh-session'

/** The exact route the reviewer uses instead of the session's own route. */
export interface ReviewerRoute {
  readonly provider: string
  readonly model: string
}

/**
 * Validates one stored route. Strict, and non-nullable on purpose: a stored
 * record is always a concrete route, and "follow the session route" is the
 * ABSENCE of a record rather than a stored `null`.
 */
export const reviewerRouteSchema: zod.ZodType<ReviewerRoute> = zod.object({
  provider: zod.string().min(1),
  model: zod.string().min(1),
}).strict()

/**
 * The Auto review route domain: one record per session, keyed by `SessionId`.
 * The name matches `UNIT_NAME_RE` (`/^[a-z][a-z0-9_]*$/` in
 * `@deepseek-ai/dsh-storage`), which `defineDomain` re-checks at module load
 * and rejects loudly — the snake_case shape follows the official
 * `session_projcache` domain.
 */
export const autoReviewPlusDomainSpec = defineDomain({
  name: 'auto_review_plus',
  version: 1,
  layout: 'per-record',
  tables: { routes: domainTable<SessionId, ReviewerRoute>(reviewerRouteSchema) },
})

/**
 * The slice of a route table these helpers use, so callers and tests can supply
 * any table-shaped object (the real one comes from
 * `facility.open(autoReviewPlusDomainSpec).table('routes')`).
 */
export type ReviewerRouteTable = Pick<KvTable<SessionId, ReviewerRoute>, 'get' | 'put' | 'delete'>

/**
 * Read the pinned reviewer route.
 *
 * The table serves the stored object itself and forbids mutating it in place,
 * so this returns a DETACHED copy.
 * @param table - the `routes` table of the Auto review route domain.
 * @param sessionId - session whose durable decision is read.
 * @returns a detached route, or undefined to follow the session's own route.
 */
export function reviewerRoute(table: ReviewerRouteTable, sessionId: SessionId): ReviewerRoute | undefined {
  const route = table.get(sessionId)
  return route === undefined ? undefined : { provider: route.provider, model: route.model }
}

/**
 * Record the chosen reviewer route, or the explicit reset to the session route.
 *
 * A `null` route deletes the record, because absence IS the "follow the session
 * route" state; a delete of an already-absent record reports `false` and is not
 * an error. Neither branch validates the route: rejecting an unknown
 * provider/model belongs to the Remote layer, not to storage.
 * @param table - the `routes` table of the Auto review route domain.
 * @param sessionId - session receiving the decision.
 * @param route - the pinned route, or null to follow the session route.
 * @returns resolution after the record is durable.
 */
export async function setReviewerRoute(
  table: ReviewerRouteTable,
  sessionId: SessionId,
  route: ReviewerRoute | null,
): Promise<void> {
  if (route === null) {
    await table.delete(sessionId)
    return
  }
  await table.put(sessionId, { provider: route.provider, model: route.model })
}
