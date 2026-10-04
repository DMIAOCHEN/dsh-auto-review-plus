/**
 * Lifecycle of this plugin's browser half: mount the plugin's own Remote
 * namespace first, then register everything in a CHILD fiber that declares it.
 *
 * WHY THE CHILD FIBER — `ctx.remote.autoReviewPlus` is a service KEY, not a
 * property of the `remote` object: the gateway client installs each mounted
 * namespace as a service named `remote.<namespace>`, and that service is
 * provided on the GATEWAY's fiber, not on this plugin's. Cordis resolves a
 * service through the reading fiber's `inject` list (`Fiber._checkImpl` +
 * `_refresh`), so a fiber that never declared the key cannot read it — it fails
 * with `cannot get property "remote.autoReviewPlus" without inject`, exactly
 * the error the GUI showed while the picker was the only reader.
 *
 * Declaring it at the PLUGIN level would deadlock instead: the plugin would wait
 * for a service only its own `apply` creates, so it would never activate and
 * neither the control nor the picker would appear. The child fiber is the only
 * place where the dependency exists already — it is started after `$mount`
 * resolved.
 *
 * The same shape as the shipped
 * `@deepseek-ai/dsh-client-ui-voice-input/src/client/mount.ts`, with two
 * deliberate differences, both itemized in the Fix round 4 report section:
 * the component and the catalog directory arrive as parameters, because their
 * modules only exist in the browser shell (they import `clsx`/`zustand`), and
 * the disposer is returned from `apply` rather than from a separate helper.
 * @module dsh-auto-review-plus/client/mount
 */
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-api-remotes/client'
import type { RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import type { ReactNode } from 'react'
import type { PermissionCatalogDirectory } from './catalog.ts'
import type { PermissionControlInjected, PermissionControlProps } from './PermissionControl.tsx'
import { accessEn, accessZh, PERMISSION_ACCESS_NS } from './locales.ts'
import type { ReviewerRouteApi } from './remote.ts'

/**
 * Required services of the plugin fiber itself: exactly what
 * {@link mountPermissionControl} reads BEFORE the namespace it creates exists.
 * The plugin's own namespace must not appear here (see the module comment).
 */
export const inject = ['remote'] as const

/**
 * Services the registration reads, this plugin's own namespace included. A
 * declaration is what makes a service reachable from a fiber, so the child
 * fiber declares everything its body touches rather than inheriting reach.
 */
export const REGISTRATION_INJECT = [
  'remote',
  'remote.autoReviewPlus',
  'remote.permissionPresets',
  'connection',
  'sessions',
  'slots',
  'locale',
] as const

/** The component the composer cell renders. */
export type PermissionControlComponent = (props: PermissionControlProps) => ReactNode

/** Builds the process catalog directory; the entry point owns this import. */
export type PermissionCatalogFactory = (ctx: Context) => PermissionCatalogDirectory

/**
 * Unwrap one Remote result into a plain promise value.
 * @param result - settled Remote call.
 * @returns the business value.
 * @throws the Remote failure.
 */
function unwrap<Value>(result: RemoteResult<Value>): Value {
  if (!result.ok) throw result.error
  return result.value
}

/**
 * Everything this plugin registers, run in a context that declared the
 * namespace it reads.
 * @param ctx - child context carrying the registration's dependencies.
 * @param component - the control the composer cell renders.
 * @param createCatalog - builds the process catalog directory for this context.
 */
export function registerPermissionControl(
  ctx: Context,
  component: PermissionControlComponent,
  createCatalog: PermissionCatalogFactory,
): void {
  ctx.effect(
    () => ctx.locale.register(PERMISSION_ACCESS_NS, { zh: accessZh, en: accessEn }),
    'auto-review-plus: permission control dictionaries',
  )
  // The browser's `ctx.sessions` is the client Session Controller.
  const sessions = ctx.sessions

  // One process catalog directory shared by every reader in this plugin.
  const catalog = createCatalog(ctx)
  ctx.effect(() => () => { catalog.dispose() }, 'auto-review-plus: process catalog directory')

  const submit = async (sessionId: SessionId, preset: string): Promise<boolean> => {
    const live = sessions.binding(sessionId)?.session
    if (live === undefined) throw new Error('this session is not materialized yet')
    const result = await live.command(`/permission ${preset}`)
    if (!result.ok) {
      throw new Error(`permission switch failed: ${result.error.code}: ${result.error.message}`)
    }
    if (!result.value.matched) throw new Error('the host offers no /permission command')
    return true
  }

  // This context declared `remote.autoReviewPlus`, so the calls below resolve
  // through this fiber — that is the whole point of the child fiber.
  const reviewerRoute: ReviewerRouteApi = {
    view: async sessionId => unwrap(await ctx.remote.autoReviewPlus.reviewerRouteView(sessionId)),
    providers: async () => unwrap(await ctx.remote.autoReviewPlus.providers()),
    models: async provider => unwrap(await ctx.remote.autoReviewPlus.models(provider)),
    modelInfo: async (provider, model) => unwrap(await ctx.remote.autoReviewPlus.modelInfo(provider, model)),
    set: async (sessionId, route) => {
      unwrap(await ctx.remote.autoReviewPlus.setReviewerRoute(sessionId, route))
    },
  }

  ctx.slots.inject('conversation.input.permission', () => ctx.slots.register({
    name: 'conversation.input.permission',
    // Cell shadowing rank: ascending, lowest renders, so -1 replaces the shipped
    // occupant (which registers at the default 0).
    priority: -1,
    locale: PERMISSION_ACCESS_NS,
    inject: (sessionId: SessionId): PermissionControlInjected => ({
      hooks: { permissionCatalog: catalog.store },
      select: preset => submit(sessionId, preset),
      reviewerRoute,
    }),
  }, component))
}

/**
 * Mount this plugin's contribution, then register on a child fiber that
 * declares it.
 *
 * UNLOAD ORDER — the returned disposer disposes the registration first and the
 * namespace second, so no reader survives the service it reads. The parent
 * fiber also tears down, concurrently, the effects `$mount` and
 * `ctx.inject` registered on it (Cordis registers the child fiber's disposal as
 * an effect of its parent), which is why both halves are idempotent: Cordis's
 * own disposers and this join may run in either order.
 * @param ctx - client plugin context.
 * @param contribution - this plugin's own Remote contribution.
 * @param component - the control the composer cell renders.
 * @param createCatalog - builds the process catalog directory for a context.
 * @returns disposer releasing the registration and the mounted namespace.
 */
export async function mountPermissionControl(
  ctx: Context,
  contribution: TypertRemoteContribution,
  component: PermissionControlComponent,
  createCatalog: PermissionCatalogFactory,
): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(contribution)
  const ui = ctx.inject([...REGISTRATION_INJECT], child => {
    registerPermissionControl(child, component, createCatalog)
  })
  try {
    await ui
  } catch (error) {
    await ui.dispose()
    await disposeRemote()
    throw error
  }
  return async () => {
    await ui.dispose()
    await disposeRemote()
  }
}
