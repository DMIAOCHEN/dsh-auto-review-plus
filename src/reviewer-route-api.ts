/**
 * Remote API of the per-session Auto reviewer route.
 *
 * The host half is a functional Cordis plugin (`apply` in `./index.ts`), so this
 * API is its own service: the storage-domain table handle is created inside
 * `apply`'s `await ctx.storageDomain.open(...)` and handed to this constructor,
 * which keeps the table a fiber-owned closure instead of a module-level
 * singleton. `TypertRemoteService` is what makes `@Remote` reachable from the
 * browser: the gateway serves the methods over the Client Remote carrier (see
 * `packages/api/gateway/src/index.ts`, whose SRC path resolves a live Service's
 * `typertRemote` binding plus its `@Remote` markers).
 *
 * WIRE CONTRACT — `src/client/remote.ts` mounts a hand-written descriptor
 * contribution for this exact namespace, method set, and parameter order
 * (`sessionId`, `provider`, `model`, `route`). The gateway reads SRC parameter
 * names off the JavaScript signature, so renaming one here without renaming it
 * there fails the call at the strict-argument check.
 *
 * `reviewerRouteView` answers `sessionRoute: null` when the session has made no
 * request yet. That is not a missing answer: a request header IS a session's
 * route, and a session that has not requested anything has none to follow. The
 * alternative — throwing — would make the picker unusable in the flow this
 * feature exists for (choosing Auto on a fresh session before the first
 * message), while an unknown session still throws.
 * @module dsh-auto-review-plus/reviewer-route-api
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import {
  reviewerRoute,
  setReviewerRoute as persistReviewerRoute,
  type ReviewerRoute,
  type ReviewerRouteTable,
} from './reviewer-route.ts'
import { assertKnownRoute } from './reviewer-route-validation.ts'

/**
 * Cordis service key AND wire namespace of this plugin's Remote API. The
 * browser half mirrors it in `src/client/remote.ts`; both must agree with the
 * endpoint the gateway resolves (`typertRemote.namespace`).
 */
export const REVIEWER_ROUTE_SERVICE = 'autoReviewPlus'

/** One concrete provider/model pair on the wire. */
export interface ReviewerRouteValue {
  readonly provider: string
  readonly model: string
}

/**
 * The reviewer route of one session, as the picker needs it.
 * `sessionRoute` is the route the session would use today, or null when the
 * session has no request header yet.
 */
export interface ReviewerRouteView {
  readonly route: ReviewerRouteValue | null
  readonly sessionRoute: ReviewerRouteValue | null
}

/** One selectable provider route. */
export interface ReviewerProviderView {
  readonly id: string
  readonly name: string
}

/** One selectable model of a provider route. */
export interface ReviewerModelView {
  readonly id: string
  readonly name: string
}

/** Reasoning capability of one exact provider/model route. */
export interface ReviewerModelInfo {
  /** Adapter-owned effort ids in adapter-preferred order; empty means none. */
  readonly reasoningEfforts: readonly string[]
}

/** The Remote-facing Auto reviewer-route API. */
export class ReviewerRouteApi extends TypertRemoteService {
  /**
   * @param ctx - host context; `sessions` and `llm` are plugin prerequisites.
   * @param table - the open `routes` table of the reviewer-route domain, owned
   *   by the calling `apply`, which also keeps the domain open for as long as
   *   this service can receive a call.
   */
  constructor(ctx: Context, private readonly table: ReviewerRouteTable) {
    super(ctx, REVIEWER_ROUTE_SERVICE)
  }

  /**
   * Read one session's pinned reviewer route next to the route it would follow.
   * @param sessionId - live session whose reviewer route is read.
   * @returns the durable pin (null when none) and the session's own route.
   * @throws when the session is not live on this host.
   */
  @Remote
  async reviewerRouteView(sessionId: string): Promise<ReviewerRouteView> {
    const session = this.session(sessionId)
    const pinned = reviewerRoute(this.table, session.id)
    const header = session.requestHeader()
    return {
      route: pinned === undefined ? null : { provider: pinned.provider, model: pinned.model },
      sessionRoute: header === undefined || header.config.provider.length === 0 || header.config.model.length === 0
        ? null
        : { provider: header.config.provider, model: header.config.model },
    }
  }

  /**
   * List the provider routes this host can currently serve.
   * @returns every registered provider route.
   */
  @Remote
  providers(): ReviewerProviderView[] {
    return this.ctx.llm.listProviders().map(provider => ({ id: provider.id, name: provider.name }))
  }

  /**
   * List one provider's currently advertised models.
   * @param provider - provider route id.
   * @returns the provider's catalog entries, narrowed to id and name.
   */
  @Remote
  async models(provider: string): Promise<ReviewerModelView[]> {
    const models = await this.ctx.llm.listModels(provider)
    return models.map(model => ({ id: model.id, name: model.name }))
  }

  /**
   * Report the reasoning efforts one exact route exposes.
   * @param provider - provider route id.
   * @param model - model id inside that route.
   * @returns the adapter-owned effort ids, in adapter order.
   */
  @Remote
  async modelInfo(provider: string, model: string): Promise<ReviewerModelInfo> {
    const info = await this.ctx.llm.resolveModelInfo(provider, model)
    return { reasoningEfforts: (info.reasoning?.efforts ?? []).map(effort => effort.id) }
  }

  /**
   * Pin, or explicitly unpin, one session's reviewer route.
   * @param sessionId - live session receiving the decision.
   * @param route - the pinned route, or null to follow the session's own route.
   * @returns resolution after the record is durable.
   * @throws when the session is not live, or when the route is not one this
   *   host serves (checked before anything is written).
   */
  @Remote
  async setReviewerRoute(sessionId: string, route: ReviewerRoute | null): Promise<void> {
    const session = this.session(sessionId)
    if (route !== null) await assertKnownRoute(this.ctx.llm, route)
    await persistReviewerRoute(this.table, session.id, route)
  }

  /**
   * Resolve the live session one Remote call names.
   * @param sessionId - raw wire identity.
   * @returns the live session.
   * @throws when no live session carries that identity.
   */
  private session(sessionId: string) {
    const session = this.ctx.sessions.get(SessionId(sessionId))
    if (session === undefined) throw new Error(`auto-review-plus: unknown session ${sessionId}`)
    return session
  }
}
