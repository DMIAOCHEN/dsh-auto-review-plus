import { Context } from "@deepseek-ai/cordis";
import { RemoteResult } from "@deepseek-ai/dsh-typert-protocol";
import "react";
import "@deepseek-ai/dsh-client-store";
import { PermissionCatalog } from "@deepseek-ai/dsh-permission-presets/client";
import { HostObservable, InjectFace, PropsLocale, PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";

//#region src/client/locales.d.ts
/**
* Dictionaries owned by this plugin's client half.
*
* {@link PERMISSION_ACCESS_NS} carries the ported current-session picker copy
* (the verbatim upstream `permission.access` dictionaries plus the
* reviewer-route keys this plugin adds). {@link en} is NOT a registered
* namespace: it holds the shipped `settings.permission` labels the ported
* presentation helper falls back to when the host offers no localized preset
* name, which is why it is the only dictionary here that nothing registers.
*/
/**
* Locale namespace owned by this plugin's current-session permission picker.
*
* Upstream (0.2.0-rc.2) names it `permission.access`; this plugin must not:
* `ctx.locale.register` throws when a namespace already carries a locale
* (`locale namespace "permission.access" already has locale "zh"`), and the
* shipped `@deepseek-ai/dsh-client-ui-permission-presets` client registers that
* namespace unconditionally. Shadowing its slot therefore requires owning a
* namespace of our own; the dictionaries below are the verbatim upstream copy,
* so every rendered label is unchanged.
*/
/**
 * Dictionaries owned by this plugin's client half.
 *
 * {@link PERMISSION_ACCESS_NS} carries the ported current-session picker copy
 * (the verbatim upstream `permission.access` dictionaries plus the
 * reviewer-route keys this plugin adds). {@link en} is NOT a registered
 * namespace: it holds the shipped `settings.permission` labels the ported
 * presentation helper falls back to when the host offers no localized preset
 * name, which is why it is the only dictionary here that nothing registers.
 */
/**
 * Locale namespace owned by this plugin's current-session permission picker.
 *
 * Upstream (0.2.0-rc.2) names it `permission.access`; this plugin must not:
 * `ctx.locale.register` throws when a namespace already carries a locale
 * (`locale namespace "permission.access" already has locale "zh"`), and the
 * shipped `@deepseek-ai/dsh-client-ui-permission-presets` client registers that
 * namespace unconditionally. Shadowing its slot therefore requires owning a
 * namespace of our own; the dictionaries below are the verbatim upstream copy,
 * so every rendered label is unchanged.
 */
declare const PERMISSION_ACCESS_NS = "autoReviewPlus.permission";
/** The shipped `settings.permission` namespace key union. */

/** English dictionary for the current-session popup gate. */
declare const accessEn: {
  mode: string;
  close: string;
  'preset.readOnly': string;
  'preset.workspaceWrite': string;
  'preset.fullAccess': string;
  'confirm.title': string;
  'confirm.description': string;
  'confirm.acknowledge': string;
  'confirm.cancel': string;
  'confirm.enable': string;
  'auto.label': string;
  'auto.badge': string;
  'auto.description': string;
  'auto.confirm.title': string;
  'auto.confirm.description': string;
  'auto.confirm.acknowledge': string;
  'auto.confirm.enable': string;
  'auto.confirm.reviewerHint': string;
  'reviewerRoute.title': string;
  'reviewerRoute.followSession': string;
  'reviewerRoute.provider': string;
  'reviewerRoute.model': string;
  'reviewerRoute.reasoning': string;
  'reviewerRoute.noReasoning': string;
  'reviewerRoute.unknownReasoning': string;
  'reviewerRoute.noModels': string;
  'reviewerRoute.unknownRoute': string;
  'reviewerRoute.loading': string;
  'reviewerRoute.confirm': string;
}; //#endregion
//#region src/client/catalog.d.ts
/** Observable complete catalog for the current Host generation. */
interface PermissionCatalogState {
  /** Last complete catalog for this generation, or null before one succeeds. */
  value: PermissionCatalog | null;
}

//#endregion
//#region src/client/remote.d.ts
/** One latest-result-wins catalog reader for the whole browser process. */

/** One concrete provider/model pair. */
interface ReviewerRouteValue {
  readonly provider: string;
  readonly model: string;
}
/** The reviewer route of one session, as the picker needs it. */
interface ReviewerRouteView {
  /** The pinned route, or null when the session follows its own route. */
  readonly route: ReviewerRouteValue | null;
  /** The route the session would use, or null before its first request. */
  readonly sessionRoute: ReviewerRouteValue | null;
}
/** One selectable provider route. */
interface ReviewerProviderView {
  readonly id: string;
  readonly name: string;
}
/** One selectable model of a provider route. */
interface ReviewerModelView {
  readonly id: string;
  readonly name: string;
}
/** Reasoning capability of one exact provider/model route. */
interface ReviewerModelInfo {
  /** Adapter-owned effort ids in adapter-preferred order; empty means none. */
  readonly reasoningEfforts: readonly string[];
}
/**
 * The business face the control consumes, injected by the client entry. Every
 * method rejects with the Remote failure, so the component never handles a
 * `RemoteResult` envelope.
 */
interface ReviewerRouteApi {
  /** Read the pinned route next to the session's own route. */
  view(sessionId: string): Promise<ReviewerRouteView>;
  /** List the provider routes this host serves. */
  providers(): Promise<readonly ReviewerProviderView[]>;
  /** List one provider's advertised models. */
  models(provider: string): Promise<readonly ReviewerModelView[]>;
  /** Report one exact route's reasoning efforts. */
  modelInfo(provider: string, model: string): Promise<ReviewerModelInfo>;
  /** Pin one route, or reset the session to its own route with null. */
  set(sessionId: string, route: ReviewerRouteValue | null): Promise<void>;
}
/**
 * Cordis service key AND wire namespace of the host API. Mirrors
 * `REVIEWER_ROUTE_SERVICE` in `src/reviewer-route-api.ts`.
 */

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespaceMap {
    /** Reviewer-route API of this plugin's host half. */
    autoReviewPlus: {
      reviewerRouteView: (sessionId: string) => Promise<RemoteResult<ReviewerRouteView>>;
      providers: () => Promise<RemoteResult<readonly ReviewerProviderView[]>>;
      models: (provider: string) => Promise<RemoteResult<readonly ReviewerModelView[]>>;
      modelInfo: (provider: string, model: string) => Promise<RemoteResult<ReviewerModelInfo>>;
      setReviewerRoute: (sessionId: string, route: ReviewerRouteValue | null) => Promise<RemoteResult<void>>;
    };
  }
} //#endregion
//#region src/client/PermissionControl.d.ts
/** Business face injected by the permission package's slot registration. */
interface PermissionControlInjected {
  hooks: {
    /** One process catalog shared with the slash popup. */
    permissionCatalog: HostObservable<PermissionCatalogState>;
  };
  /** Submit one current-session preset through the existing command writer. */
  select: (preset: string) => Promise<boolean>;
  /** Reviewer-route API of this plugin's host half. */
  reviewerRoute: ReviewerRouteApi;
}
/** Complete props derived from the conversation slot, injected hooks, and locale. */
type PermissionControlProps = PropsRuntime<'conversation.input.permission'> & InjectFace<PermissionControlInjected> & PropsLocale<typeof PERMISSION_ACCESS_NS>;

//#endregion
//#region src/client/mount.d.ts
/**
 * Required services of the plugin fiber itself: exactly what
 * {@link mountPermissionControl} reads BEFORE the namespace it creates exists.
 * The plugin's own namespace must not appear here (see the module comment).
 */
declare const inject: readonly ["remote"];

//#endregion
//#region src/client/index.d.ts
/**
 * Services the registration reads, this plugin's own namespace included. A
 * declaration is what makes a service reachable from a fiber, so the child
 * fiber declares everything its body touches rather than inheriting reach.
 */
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Current-session permission picker and confirmation copy. */
    'autoReviewPlus.permission': keyof typeof accessEn;
  }
}
/**
 * Client plugin body: own the composer permission control.
 *
 * Async on purpose: this plugin's own Remote namespace has to be mounted before
 * any chooser can read or write a reviewer route, and a mount that fails leaves
 * the shipped control in place (nothing else has registered anything yet)
 * instead of shadowing it with a half-wired one.
 * @param ctx - client plugin context.
 * @returns disposer releasing the registration and the mounted namespace.
 */
declare function apply(ctx: Context): Promise<() => Promise<void>>;

//#endregion
export { PermissionControlInjected, PermissionControlProps, apply, inject };