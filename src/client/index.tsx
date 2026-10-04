/**
 * Auto-review-plus browser half: the composer permission control.
 *
 * Shadows the shipped control by registering into the same single-occupant
 * `conversation.input.permission` cell at `priority: -1` (cell shadowing sorts
 * ascending, lowest renders), so this entry replaces the upstream
 * `@deepseek-ai/dsh-client-ui-permission-presets` occupant without touching it.
 *
 * The registration, the injected business face (`hooks.permissionCatalog` +
 * `select`), the process catalog directory, and the `/permission <preset>`
 * command write path are copied from that package's client half (0.2.0-rc.2,
 * `packages/client/ui-permission-presets/src/client/index.ts`); every difference
 * is itemized in .sdd/dsh-auto-review-plus/task-6-report.md. The upstream
 * settings row and `/permission` popup decoration stay with the upstream
 * package: this half owns the composer control only.
 */
/// <reference path="./upstream-faces.d.ts" />
/// <reference path="./upstream-augmentations.d.ts" />
import type { Context } from '@deepseek-ai/cordis'
// Type-only imports: the client root Context augmentations for the services
// below (`ctx.slots`, `ctx.locale`, `ctx.remote`, `ctx.sessions`). Erased at
// build time, so none of them reaches the client bundle as an import.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
// Type-only: pulls the conversation-owned permission slot declaration and the
// standard session projection hook into this package's Client face.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { PermissionCatalogDirectory } from './catalog.ts'
import { PermissionControl } from './PermissionControl.tsx'
import type { PermissionControlInjected } from './PermissionControl.tsx'
import { accessEn, accessZh, PERMISSION_ACCESS_NS } from './locales.ts'

/** Required services (cordis fiber inject). */
export const inject = [
  'connection', 'remote', 'remote.permissionPresets', 'sessions', 'slots', 'locale',
]

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Current-session permission picker and confirmation copy. */
    'autoReviewPlus.permission': keyof typeof accessEn
  }
}

/**
 * Client plugin body: own the composer permission control.
 * @param ctx - client root context.
 */
export function apply(ctx: Context): void {
  ctx.effect(
    () => ctx.locale.register(PERMISSION_ACCESS_NS, { zh: accessZh, en: accessEn }),
    'auto-review-plus: permission control dictionaries',
  )
  // The browser's `ctx.sessions` is the client Session Controller, a different
  // service from the host `ctx.sessions` (`@deepseek-ai/dsh-session`'s store)
  // that shares the name in this repository's single tsc program, so the client
  // face is narrowed here rather than declaration-merged — see
  // ./upstream-augmentations.d.ts.
  const sessions = ctx.sessions as unknown as ISessions

  // One process catalog directory shared by every reader in this plugin.
  const catalog = new PermissionCatalogDirectory(ctx)
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

  ctx.slots.inject('conversation.input.permission', () => ctx.slots.register({
    name: 'conversation.input.permission',
    // Cell shadowing rank: ascending, lowest renders, so -1 replaces the shipped
    // occupant (which registers at the default 0).
    priority: -1,
    locale: PERMISSION_ACCESS_NS,
    inject: (sessionId: SessionId): PermissionControlInjected => ({
      hooks: { permissionCatalog: catalog.store },
      select: preset => submit(sessionId, preset),
    }),
  }, PermissionControl))
}
