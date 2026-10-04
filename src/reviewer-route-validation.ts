/**
 * Route validation for the reviewer-route Remote API.
 *
 * Deliberately free of decorators and of any runtime import: the acceptance
 * checks for this task run it under `node --experimental-strip-types`, which
 * strips types but refuses every non-erasable syntax form (a decorated class
 * body is one). The Remote service that calls it lives in
 * `./reviewer-route-api.ts`.
 * @module dsh-auto-review-plus/reviewer-route-validation
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-llm'
import type { ReviewerRoute } from './reviewer-route.ts'

/**
 * The live LLM registry surface a route check reads. Structural on purpose: the
 * Remote service passes `ctx.llm` and the local checks pass a table-shaped stub.
 */
export type RouteRegistry = Pick<Context['llm'], 'listProviders' | 'listModels'>

/**
 * Whether one wire value is a concrete route this API can validate.
 *
 * A Remote call may omit the field outright (an SRC descriptor cannot see which
 * parameters are optional) or send a non-object, and neither is a route. This
 * is a type predicate rather than a convenience: it makes the rejection below a
 * named route error instead of a `TypeError` from reading a property of nothing.
 * @param value - decoded wire value of the `route` field.
 * @returns true when the value carries a provider string and a model string.
 */
export function isReviewerRoute(value: unknown): value is ReviewerRoute {
  return typeof value === 'object'
    && value !== null
    && typeof Reflect.get(value, 'provider') === 'string'
    && typeof Reflect.get(value, 'model') === 'string'
}

/**
 * Reject a reviewer route this host cannot currently serve.
 *
 * The check is the same one the GUI picker implies — a provider route the
 * registry advertises plus a model id that provider lists — so a stored route
 * can never name a combination the reviewer would immediately fail on. Both
 * failures carry the exact `provider/model` pair, because that pair is the only
 * thing the caller can act on.
 *
 * A `listModels` failure is NOT folded into "unknown route": it means the check
 * could not be completed, and reporting it as a rejected route would hide an
 * adapter fault behind a user-input error. It propagates unchanged and the
 * caller's write does not happen, which is the fail-closed direction.
 * @param llm - live LLM registry.
 * @param route - candidate provider/model pair, as it arrived on the wire.
 * @returns resolution when the registry serves the exact route.
 * @throws an Error naming the defect or the `provider/model` pair it refused.
 */
export async function assertKnownRoute(llm: RouteRegistry, route: unknown): Promise<void> {
  if (!isReviewerRoute(route)) {
    throw new Error(`auto-review-plus: a reviewer route needs a provider and a model, got ${JSON.stringify(route) ?? 'undefined'}`)
  }
  if (!llm.listProviders().some(provider => provider.id === route.provider)) {
    throw new Error(`auto-review-plus: unknown reviewer route "${route.provider}/${route.model}"`)
  }
  const models = await llm.listModels(route.provider)
  if (!models.some(model => model.id === route.model)) {
    throw new Error(`auto-review-plus: unknown reviewer route "${route.provider}/${route.model}"`)
  }
}
