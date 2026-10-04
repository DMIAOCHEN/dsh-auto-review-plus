/**
 * Fake Cordis client host for the browser-half wiring checks.
 *
 * It exists because the failure this file reproduces is a RESOLUTION failure,
 * not a logic one: `ctx.remote.autoReviewPlus` is a service KEY, and Cordis
 * resolves it through the reading fiber's `inject` list — a service provided on
 * a sibling fiber is invisible to a fiber that never declared it. The fake
 * mirrors that rule (and its exact wording, `cannot get property "<key>"
 * without inject`), so a test can drive the real plugin entry and observe what
 * the GUI observed.
 *
 * The fake has no runtime imports at all: a spec drives it under vitest, and
 * because it stays erasable the local repro script drives it under
 * `node --experimental-strip-types` too.
 * @module dsh-auto-review-plus/tests/client/support/fake-context
 */
import type { Context } from '@deepseek-ai/cordis'
import type { RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import type { PermissionControlInjected } from '../../../src/client/PermissionControl.tsx'
import type { ReviewerRouteValue } from '../../../src/client/remote.ts'

/** The exact Cordis wording for a service read the reading fiber never injected. */
export function withoutInject(key: string): string {
  return `cannot get property "${key}" without inject`
}

/** One recorded call, either into the plugin's own namespace or into the runtime. */
export interface HostCall {
  readonly method: string
  readonly args: readonly unknown[]
}

/** What one fake host observed and offers back to a test. */
export interface FakeClientHost {
  /** The plugin-level context handed to the entry point. */
  readonly ctx: Context
  /** Deps the plugin-level `inject` export declared. */
  readonly pluginInject: readonly string[]
  /** Every context `inject` started, with the deps it declared. */
  readonly children: readonly { readonly inject: readonly string[] }[]
  /** Calls recorded in order (namespace endpoints included). */
  readonly calls: readonly HostCall[]
  /** Preset lines the injected `select` wrote. */
  readonly submitted: readonly string[]
  /** Whether `$mount` installed the namespace. */
  readonly mounted: boolean
  /** The failure envelope `models('broken')` settles with. */
  readonly failure: unknown
  /** Invoke the slot factory the entry registered and return its injected face. */
  face(sessionId: string): PermissionControlInjected
  /** Dispose the child fiber the entry started, when it started one. */
  disposeChild(): Promise<void>
}

/** Model one host read the way Cordis resolves it: declared, or refused. */
function read(declared: ReadonlySet<string>, services: Record<string, unknown>, key: string): unknown {
  if (!declared.has(key)) throw new Error(withoutInject(key))
  const value = services[key]
  if (value === undefined) throw new Error(`cannot get required service "${key}" in inactive context`)
  return value
}

/**
 * Build one fake client host.
 * @param pluginInject - the entry module's own `inject` export.
 * @param served - namespace service keys `$mount` should install.
 * @returns the observed host.
 */
export function fakeClientHost(
  pluginInject: readonly string[],
  served: readonly string[] = ['remote.autoReviewPlus'],
): FakeClientHost {
  const pluginDeclared = new Set(pluginInject)
  const calls: HostCall[] = []
  const submitted: string[] = []
  const children: { readonly inject: readonly string[]; readonly dispose: () => Promise<void> }[] = []
  const failure = Object.freeze({ code: 'reviewer-route/unavailable', message: 'provider is offline', details: {} })
  let slotFactory: (() => unknown) | null = null
  let registration: { readonly inject: (sessionId: string) => PermissionControlInjected } | null = null
  let mounted = false

  const namespace: Record<string, (...args: unknown[]) => Promise<unknown>> = {}
  const record = (method: string, handler: (...args: unknown[]) => unknown): void => {
    namespace[method] = async (...args: unknown[]): Promise<unknown> => {
      calls.push({ method, args })
      return await handler(...args)
    }
  }
  record('reviewerRouteView', (sessionId: unknown) => ({
    ok: true,
    value: {
      route: null,
      sessionRoute: { provider: 'session-provider', model: `session-${String(sessionId)}` },
    },
  }))
  record('providers', () => ({ ok: true, value: [{ id: 'zai', name: 'Z.ai' }] }))
  record('models', (provider: unknown) => (provider === 'broken'
    ? { ok: false, error: failure }
    : { ok: true, value: [{ id: 'glm-5.3-flash', name: 'GLM' }] }))
  record('modelInfo', (provider: unknown, model: unknown) => ({
    ok: true, value: { reasoningEfforts: [`${String(provider)}/${String(model)}`] },
  }))
  record('setReviewerRoute', () => ({ ok: true, value: undefined }))

  const services: Record<string, unknown> = {
    // The `remote` service itself: the context returns the guarded proxy for it,
    // but the declaration check still has to find a provided value.
    remote: {},
    locale: {
      register: (ns: string, dicts: unknown) => {
        calls.push({ method: 'locale.register', args: [ns, dicts] })
        return () => {}
      },
    },
    sessions: {
      binding: (sessionId: string) => ({
        session: {
          command: async (line: string) => {
            submitted.push(`${sessionId}:${line}`)
            return { ok: true, value: { matched: true } }
          },
        },
      }),
    },
    connection: {
      generation: { getSnapshot: () => ({ id: 1 }), subscribe: () => () => {} },
    },
    slots: {
      // The real `slots.inject` is lazy: the factory runs when a host renders
      // the slot, which is why the face a test drives is built from the
      // factory's own registration.
      inject: (name: string, factory: () => unknown) => {
        calls.push({ method: 'slots.inject', args: [name] })
        slotFactory = factory
        return () => {}
      },
      register: (definition: { readonly inject: (sessionId: string) => PermissionControlInjected }, component: unknown) => {
        calls.push({ method: 'slots.register', args: [component] })
        registration = definition
        return definition
      },
    },
    'remote.permissionPresets': {
      catalog: async () => ({ ok: true, value: { options: [], defaultOptions: [], defaultPreset: 'read-only' } }),
    },
  }

  /**
   * Build one context that resolves services the way Cordis does.
   * @param declared - service keys this context may read.
   * @param own - sink for the disposers its `effect` calls return.
   */
  const contextOf = (declared: ReadonlySet<string>, own: (() => unknown)[]): Context => {
    const remote = new Proxy({}, {
      get(_target, property): unknown {
        if (property === '$mount') {
          return async (contribution: TypertRemoteContribution): Promise<() => Promise<void>> => {
            calls.push({ method: '$mount', args: [contribution] })
            mounted = true
            for (const key of served) services[key] = namespace
            // `$mount` owns its disposer through the CALLER's fiber, exactly as
            // the gateway client registers it with `callerCtx.effect`.
            const dispose = async (): Promise<void> => {
              mounted = false
              for (const key of served) services[key] = undefined
            }
            own.push(dispose)
            return dispose
          }
        }
        if (property === '$on') return () => () => {}
        return read(declared, services, `remote.${String(property)}`)
      },
    })
    const base: Record<string, unknown> = {
      get: (name: string) => read(declared, services, name),
      effect: (execute: () => unknown) => {
        const dispose = execute()
        if (typeof dispose === 'function') own.push(dispose as () => unknown)
        return () => {}
      },
      inject: (deps: readonly string[], callback: (child: Context) => void) => {
        for (const dep of deps) {
          if (services[dep] === undefined) throw new Error(`cannot get required service "${dep}" in inactive context`)
        }
        const declared2 = new Set([...declared, ...deps])
        const childDisposers: (() => unknown)[] = []
        const childCtx = contextOf(declared2, childDisposers)
        const entry = {
          inject: deps,
          dispose: async () => { for (const dispose of [...childDisposers].reverse()) await dispose() },
        }
        children.push(entry)
        return {
          then: (
            onFulfilled?: (value: unknown) => unknown,
            onRejected?: (reason: unknown) => unknown,
          ) => Promise.resolve().then(() => callback(childCtx)).then(onFulfilled, onRejected),
          dispose: async () => { await entry.dispose() },
        }
      },
    }
    for (const key of ['remote', 'locale', 'sessions', 'slots', 'connection']) {
      Object.defineProperty(base, key, {
        get: () => {
          const value = read(declared, services, key)
          return key === 'remote' ? remote : value
        },
        enumerable: true,
      })
    }
    return base as unknown as Context
  }

  const ctx = contextOf(pluginDeclared, [])
  return {
    ctx,
    pluginInject,
    children,
    calls,
    submitted,
    get mounted(): boolean { return mounted },
    failure,
    face(sessionId: string): PermissionControlInjected {
      if (slotFactory !== null) slotFactory()
      if (registration === null) throw new Error('the entry registered no permission control')
      return registration.inject(sessionId)
    },
    async disposeChild(): Promise<void> {
      for (const child of [...children].reverse()) await child.dispose()
    },
  }
}

/** One named call into the reviewer-route face. */
export interface FaceCall {
  readonly name: string
  readonly run: () => Promise<unknown>
}

/**
 * The five calls a test drives, so the spec and the repro script cover exactly
 * the same endpoints the picker uses.
 * @param face - injected business face.
 * @returns one named call per endpoint.
 */
export function faceCalls(face: PermissionControlInjected): readonly FaceCall[] {
  const api = face.reviewerRoute
  const route: ReviewerRouteValue = { provider: 'zai', model: 'glm-5.3-flash' }
  return [
    { name: 'view', run: async () => await api.view('session-1') },
    { name: 'providers', run: async () => await api.providers() },
    { name: 'models', run: async () => await api.models('zai') },
    { name: 'modelInfo', run: async () => await api.modelInfo(route.provider, route.model) },
    { name: 'set', run: async () => { await api.set('session-1', route) } },
  ]
}

/** One settled face call, for tests that assert values and failures. */
export type FaceCallResult = RemoteResult<unknown>
