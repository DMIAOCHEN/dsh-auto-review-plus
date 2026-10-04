import type { Context } from '@deepseek-ai/cordis'
// Type-only import: pulls the platform's `Context` augmentation that declares the
// `slots` service (`@deepseek-ai/dsh-client-ui-renderer/client`). Erased at build time,
// so it adds no runtime dependency to the client bundle.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only import: pulls the slot contract that declares `settings.general.item`
// in `SlotMap` (owned by the settings domain base). Also erased at build time.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'

export const inject = ['slots']

export function apply(ctx: Context): void {
  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'auto-review-plus-spike',
    order: 10,
  }, () => <div>dsh-auto-review-plus client half loaded</div>))
}
