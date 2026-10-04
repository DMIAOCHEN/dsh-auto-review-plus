import { describe, expect, it, vi } from 'vitest'

// The two packages below only exist inside the browser shell, which bundles
// them: `dsh-client-ui-primitives` needs `clsx` plus ~25 browser packages and
// `dsh-client-store` needs `zustand`/`immer`, none of which this package
// installs. Stubbing the two specifiers is what lets this suite drive the REAL
// entry point (`apply`) instead of a re-implementation of its wiring.
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Menu: () => null,
  RiskConfirmation: () => null,
  Modal: () => null,
  Button: () => null,
  IconChevronDownOutlineRegular: () => null,
  IconWarningOutlineRegular: () => null,
  PermissionIconFullAccessRegular: () => null,
  PermissionIconReadOnlyRegular: () => null,
  PermissionIconWorkspaceWriteRegular: () => null,
}))
vi.mock('@deepseek-ai/dsh-client-store', () => ({
  createSnapshotStore: (initial: unknown) => {
    let state = initial
    const listeners = new Set<(value: unknown) => void>()
    return {
      getSnapshot: () => state,
      set: (next: unknown) => { state = next; for (const listener of [...listeners]) listener(next) },
      subscribe: (listener: (value: unknown) => void) => {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
    }
  },
}))

import { apply, inject } from '../../src/client/index.tsx'
import { AUTO_REVIEW_PLUS_REMOTE } from '../../src/client/remote.ts'
import {
  REGISTRATION_INJECT,
  mountPermissionControl,
  registerPermissionControl,
} from '../../src/client/mount.ts'
import { fakeClientHost } from './support/fake-context.ts'

/** A stand-in control for the cases that drive `mountPermissionControl`. */
const Component = (): null => null

/**
 * The plugin-level inject of the PRE-fix entry (commit 90c5be9): it declared
 * every service except the namespace the plugin mounts itself, which is exactly
 * what the regression control below reproduces.
 */
const PREFIX_INJECT = ['connection', 'remote', 'remote.permissionPresets', 'sessions', 'slots', 'locale']

/** A stand-in catalog directory: only `store` and `dispose` reach it. */
const createCatalog = () => ({
  store: { getSnapshot: () => ({ value: null }), set: () => {}, subscribe: () => () => {} },
  dispose: () => {},
}) as never

describe('plugin-level inject', () => {
  it('never waits for the plugin\'s own namespace', () => {
    // Injecting it here would wait for a service only `apply` creates: the fiber
    // would never activate, so neither the control nor the picker would appear.
    expect([...inject]).not.toContain('remote.autoReviewPlus')
  })

  it('declares the remote service the mount itself uses', () => {
    expect([...inject]).toEqual(['remote'])
  })
})

describe('registration context', () => {
  it('declares the plugin\'s own namespace, and everything the body reads', () => {
    for (const key of ['remote.autoReviewPlus', 'remote.permissionPresets', 'connection', 'sessions', 'slots', 'locale']) {
      expect([...REGISTRATION_INJECT]).toContain(key)
    }
  })
})

describe('the plugin entry (apply)', () => {
  it('registers on a child fiber that declares the namespace it reads', async () => {
    const host = fakeClientHost(inject)
    await apply(host.ctx)
    expect(host.children.some(child => [...child.inject].includes('remote.autoReviewPlus'))).toBe(true)
    expect(host.mounted).toBe(true)
  })

  it('relays all five endpoints through the mounted namespace', async () => {
    const host = fakeClientHost(inject)
    await apply(host.ctx)
    const face = host.face('session-1')
    await expect(face.reviewerRoute.view('session-1')).resolves.toEqual({
      route: null,
      sessionRoute: { provider: 'session-provider', model: 'session-session-1' },
    })
    await expect(face.reviewerRoute.providers()).resolves.toEqual([{ id: 'zai', name: 'Z.ai' }])
    await expect(face.reviewerRoute.models('zai')).resolves.toEqual([{ id: 'glm-5.3-flash', name: 'GLM' }])
    await expect(face.reviewerRoute.modelInfo('zai', 'glm-5.3-flash'))
      .resolves.toEqual({ reasoningEfforts: ['zai/glm-5.3-flash'] })
    await expect(face.reviewerRoute.set('session-1', { provider: 'zai', model: 'glm-5.3-flash' })).resolves.toBeUndefined()
  })

  it('keeps resolving after apply() returned, and rejects with the failure itself', async () => {
    const host = fakeClientHost(inject)
    await apply(host.ctx)
    const face = host.face('session-1')
    await expect(face.reviewerRoute.providers()).resolves.toHaveLength(1)
    await expect(face.reviewerRoute.models('broken')).rejects.toBe(host.failure)
  })

  it('writes the preset through the session command', async () => {
    const host = fakeClientHost(inject)
    await apply(host.ctx)
    await expect(host.face('session-1').select('auto')).resolves.toBe(true)
    expect(host.submitted).toEqual(['session-1:/permission auto'])
  })

  it('returns a disposer that withdraws the namespace', async () => {
    const host = fakeClientHost(inject)
    const dispose = await apply(host.ctx)
    expect(host.mounted).toBe(true)
    await dispose()
    expect(host.mounted).toBe(false)
  })
})

describe('the failure this fix removes', () => {
  it('is what a context without the declaration produces', async () => {
    // The pre-fix shape: the registration ran in the PLUGIN context, whose
    // `inject` declared every service EXCEPT the namespace this plugin mounts
    // (commit 90c5be9, reproduced here so the regression stays visible), so
    // every call failed with Cordis's resolution error — "the picker shows only
    // 'follow the current session model'" in the GUI.
    const host = fakeClientHost(PREFIX_INJECT)
    registerPermissionControl(host.ctx, Component, createCatalog)
    const face = host.face('session-1')
    await expect(face.reviewerRoute.view('session-1'))
      .rejects.toThrow('cannot get property "remote.autoReviewPlus" without inject')
    await expect(face.reviewerRoute.providers())
      .rejects.toThrow('cannot get property "remote.autoReviewPlus" without inject')
  })
})

describe('mountPermissionControl failure path', () => {
  it('releases the mount and rethrows when the registration body throws', async () => {
    // The catalog directory is the one part of the body a caller supplies, so a
    // throwing factory is how this suite makes the body fail.
    const host = fakeClientHost(inject)
    const thrown = new Error('catalog refused')
    await expect(mountPermissionControl(host.ctx, AUTO_REVIEW_PLUS_REMOTE, Component, () => { throw thrown }))
      .rejects.toBe(thrown)
    expect(host.mounted).toBe(false)
  })
})
