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
 *
 * The lifecycle lives in `./mount.ts`; this entry supplies the two values that
 * only exist in the browser shell (the control component and the store-backed
 * catalog directory), which keeps the lifecycle testable in a plain runtime.
 */
import type { Context } from '@deepseek-ai/cordis'
// Type-only imports: the client root Context augmentations for the services the
// lifecycle reads (`ctx.slots`, `ctx.locale`, `ctx.remote`, `ctx.sessions`) and
// the standard session props the composer cell injects (`useProjection`).
// Mirrors the upstream client entry's own type-only list; erased at build time,
// so none of them reaches the client bundle as an import.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
// Type-only: pulls the conversation-owned permission slot declaration into this
// package's Client face.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { PermissionCatalogDirectory } from './catalog.ts'
import { accessEn } from './locales.ts'
import { mountPermissionControl } from './mount.ts'
import { PermissionControl } from './PermissionControl.tsx'
import type { PermissionControlInjected } from './PermissionControl.tsx'
import { AUTO_REVIEW_PLUS_REMOTE } from './remote.ts'

// Required services (cordis fiber inject) — `./mount.ts` owns the list and
// documents why the plugin's own namespace must NOT appear in it. The shell
// reads `inject` off this module, so this is a re-export rather than a copy.
export { inject } from './mount.ts'

export type { PermissionControlInjected, PermissionControlProps } from './PermissionControl.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Current-session permission picker and confirmation copy. */
    'autoReviewPlus.permission': keyof typeof accessEn
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
export async function apply(ctx: Context): Promise<() => Promise<void>> {
  return await mountPermissionControl(
    ctx,
    AUTO_REVIEW_PLUS_REMOTE,
    PermissionControl,
    catalogCtx => new PermissionCatalogDirectory(catalogCtx),
  )
}
