/**
 * Browser-side Remote contribution for THIS plugin's own host API.
 *
 * Why a local contribution at all: `ctx.remote.<namespace>` only exists once a
 * contribution is mounted (`api-gateway.client`'s `ClientRemoteService.$mount`),
 * and the shell mounts exactly the namespaces its own assembly imports. A plugin
 * that is not part of that assembly therefore mounts its own, the way
 * `@deepseek-ai/dsh-client-ui-voice-input` mounts its speech contribution
 * (`packages/experimental/client-ui-voice-input/src/client/index.ts`).
 *
 * Why hand-written instead of generated: the harness generates a package's
 * `/remote` artifact from its Host FaceModel with
 * `@deepseek-ai/dsh-typert-generator`, which is not a dependency of this
 * package. These descriptors only have to satisfy the mount's contract —
 * `validateContribution` requires a strict codec per parameter and result — and
 * the HOST side is the authority that validates: it serves the endpoint from
 * the live service's `@Remote` markers (`gateway`'s SRC path) and re-validates
 * every stored route (`assertKnownRoute` plus the storage domain's own schema).
 * For that reason the codecs here are structural placeholders, NOT validators,
 * and they deliberately avoid a schema library: `zod` is not in the shell's
 * frozen module table, so importing it would pull a whole validator into the
 * browser bundle.
 *
 * WIRE CONTRACT: method names, their order of parameters, and the namespace
 * must stay identical to `src/reviewer-route-api.ts`. The gateway derives wire
 * field names from the HOST method's JavaScript parameter names, and
 * `assertExactArguments` rejects any call whose fields do not match, so a
 * rename on one side alone fails the call at runtime.
 * @module dsh-auto-review-plus/client/remote
 */
import type {
  InvocationDescriptor,
  RemoteResult,
  TypertCodec,
  TypertRemoteContribution,
} from '@deepseek-ai/dsh-typert-protocol'

/** One concrete provider/model pair. */
export interface ReviewerRouteValue {
  readonly provider: string
  readonly model: string
}

/** The reviewer route of one session, as the picker needs it. */
export interface ReviewerRouteView {
  /** The pinned route, or null when the session follows its own route. */
  readonly route: ReviewerRouteValue | null
  /** The route the session would use, or null before its first request. */
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

/**
 * The business face the control consumes, injected by the client entry. Every
 * method rejects with the Remote failure, so the component never handles a
 * `RemoteResult` envelope.
 */
export interface ReviewerRouteApi {
  /** Read the pinned route next to the session's own route. */
  view(sessionId: string): Promise<ReviewerRouteView>
  /** List the provider routes this host serves. */
  providers(): Promise<readonly ReviewerProviderView[]>
  /** List one provider's advertised models. */
  models(provider: string): Promise<readonly ReviewerModelView[]>
  /** Report one exact route's reasoning efforts. */
  modelInfo(provider: string, model: string): Promise<ReviewerModelInfo>
  /** Pin one route, or reset the session to its own route with null. */
  set(sessionId: string, route: ReviewerRouteValue | null): Promise<void>
}

/**
 * Cordis service key AND wire namespace of the host API. Mirrors
 * `REVIEWER_ROUTE_SERVICE` in `src/reviewer-route-api.ts`.
 */
export const REVIEWER_ROUTE_SERVICE = 'autoReviewPlus'

/**
 * Build the mount-required codec for one JSON field.
 *
 * `create()` is never called by the mount (it validates that a strict codec
 * exists; the Host decodes the wire), so this is the smallest object that
 * satisfies the contract. The named `typeSymbol` keeps the endpoints
 * distinguishable in diagnostics.
 * @param typeSymbol - canonical type name of the field.
 * @returns a strict codec that passes values through unchanged.
 */
function jsonCodec(typeSymbol: string): TypertCodec {
  return {
    mode: 'strict',
    typeSymbol,
    create: () => ({ parse: (value: unknown) => value }),
  }
}

/**
 * Build one direct invocation descriptor.
 * @param method - exported method name, identical to the host method's name.
 * @param parameters - business parameter names, in host signature order.
 * @returns the descriptor the mount installs.
 */
function direct(method: string, parameters: readonly string[]): InvocationDescriptor {
  return {
    id: `dsh-auto-review-plus#${REVIEWER_ROUTE_SERVICE}/${method}`,
    service: REVIEWER_ROUTE_SERVICE,
    namespace: REVIEWER_ROUTE_SERVICE,
    method,
    invocation: { kind: 'direct' },
    parameters: parameters.map(name => ({
      name,
      wire: name,
      source: 'json' as const,
      codec: jsonCodec(`dsh-auto-review-plus/client/remote#${name}`),
    })),
    result: jsonCodec(`dsh-auto-review-plus/client/remote#${method}`),
  }
}

/** The contribution this plugin's browser half mounts in its own fiber. */
export const AUTO_REVIEW_PLUS_REMOTE: TypertRemoteContribution = {
  package: 'dsh-auto-review-plus',
  descriptors: [
    direct('reviewerRouteView', ['sessionId']),
    direct('providers', []),
    direct('models', ['provider']),
    direct('modelInfo', ['provider', 'model']),
    direct('setReviewerRoute', ['sessionId', 'route']),
  ],
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespaceMap {
    /** Reviewer-route API of this plugin's host half. */
    autoReviewPlus: {
      reviewerRouteView: (sessionId: string) => Promise<RemoteResult<ReviewerRouteView>>
      providers: () => Promise<RemoteResult<readonly ReviewerProviderView[]>>
      models: (provider: string) => Promise<RemoteResult<readonly ReviewerModelView[]>>
      modelInfo: (provider: string, model: string) => Promise<RemoteResult<ReviewerModelInfo>>
      setReviewerRoute: (sessionId: string, route: ReviewerRouteValue | null) => Promise<RemoteResult<void>>
    }
  }
}
