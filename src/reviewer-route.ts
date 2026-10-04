/** Durable per-session reviewer route for Auto review. */
import { z as zod } from 'zod'
import type { Session } from '@deepseek-ai/dsh-session'
import type SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'

/** The exact route the reviewer uses instead of the session's own route. */
export interface ReviewerRoute {
  readonly provider: string
  readonly model: string
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /**
     * Records the Auto review reviewer route chosen for this session. `null`
     * means "follow the session's own route" (an explicit reset). Log-only:
     * it carries no `surfaceOp` and never enters model history.
     */
    'auto-review-plus/reviewer-route': { route: ReviewerRoute | null }
  }
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    /** Pinned reviewer route, or null when the review follows the session route. */
    autoReviewPlusRoute: ReviewerRoute | null
  }
}

const reviewerRouteSchema: zod.ZodType<ReviewerRoute | null> = zod.object({
  provider: zod.string().min(1),
  model: zod.string().min(1),
}).strict().nullable()

/** Host-only projection of the durable reviewer route. */
export const autoReviewPlusRouteProjectionDefinition = {
  key: 'autoReviewPlusRoute',
  stateVersion: 1,
  stateSchema: reviewerRouteSchema,
  init: () => null,
  apply: (state, event) => event.type === 'auto-review-plus/reviewer-route' ? event.data.route : state,
} satisfies ProjectionDefinition<'autoReviewPlusRoute', ReviewerRoute | null>

/**
 * Read the pinned reviewer route.
 * @param projections - registry that owns the route projection.
 * @param session - session whose durable decision is read.
 * @returns a detached route, or undefined to follow the session's own route.
 */
export function reviewerRoute(
  projections: Pick<SessionProjectionRegistry, 'stateOf'>,
  session: Session,
): ReviewerRoute | undefined {
  const route = projections.stateOf(session, 'autoReviewPlusRoute')
  return route === null || route === undefined ? undefined : { ...route }
}

/**
 * Record the chosen reviewer route, or the explicit reset to the session route.
 * @param session - session receiving the decision.
 * @param route - the pinned route, or null to follow the session route.
 */
export function setReviewerRoute(session: Session, route: ReviewerRoute | null): void {
  session.append('auto-review-plus/reviewer-route', {
    route: route === null ? null : { provider: route.provider, model: route.model },
  })
}
