/**
 * Build-time type faces for the frozen client packages this plugin imports but
 * does not install.
 *
 * Why this file exists: the shell's frozen module table answers
 * `@deepseek-ai/dsh-client-ui-primitives` and the other client specifiers at
 * runtime, but `tsc` needs declarations on disk to check a faithful port of the
 * shipped permission control. This repository's dependency list is frozen for
 * this task, so the faces below stand in for the packages the ported sources
 * name:
 *
 *   `@deepseek-ai/dsh-api-session-controller/client`  → `UseProjection`, `SessionFace`, `ISessions`
 *   `@deepseek-ai/dsh-client-connection/client`       → `ConnectionHandle`
 *   `@deepseek-ai/dsh-client-locale/client`           → `LocaleFace`
 *   `@deepseek-ai/dsh-api-remotes/client`             → (the `ctx.remote` member lives in the augmentation file)
 *   `@deepseek-ai/dsh-client-ui-conversation/client`  → (the slot declaration lives in the augmentation file)
 *
 * Rules this file follows, so it stays a *narrow face* and never a re-typed one:
 *
 * 1. Only members the ported sources actually use are declared, each copied from
 *    the published 0.2.0-rc.2 declaration named in its block comment.
 * 2. Domain types stay real: `RemoteResult`, `SessionProjectionMap`,
 *    `PermissionCatalog`, `LocaleDictOf` and every slot type come from packages
 *    this repository does install.
 * 3. It is a script (no top-level import/export) on purpose. An ambient module
 *    declaration is the only legal form for a specifier that is not on disk, and
 *    it *replaces* whatever the specifier would otherwise resolve to — so only
 *    genuinely absent packages are declared here. Members of packages that ARE
 *    installed (`@deepseek-ai/cordis`, `@deepseek-ai/dsh-client-ui-slots`) are
 *    merged instead, in `./upstream-augmentations.d.ts`.
 *
 * `tests/client-type-face.spec.ts` fails as soon as one of the packages above
 * becomes resolvable, so this file cannot silently shadow real upstream types:
 * add the devDependency, delete the matching block here, and the ported sources
 * keep compiling against the published declarations.
 */

// ---------------------------------------------------------------------------
// @deepseek-ai/dsh-api-session-controller/client
//   lib/types/client/sessions/projection-store.d.ts:28   (UseProjection)
//   lib/types/client/contract/session.d.ts:147           (SessionFace.command)
//   lib/types/client/sessions/service.d.ts               (SessionBinding)
//   lib/types/client/contract/sessions.d.ts:43,154       (ISessions.binding)
// ---------------------------------------------------------------------------
declare module '@deepseek-ai/dsh-api-session-controller/client' {
  /** Session identity: the host package's own type. */
  export type SessionId = import('@deepseek-ai/dsh-session/types').SessionId
  /** Host-computed projection values by key (the real map, augmented by dsh-permission-presets). */
  export type SessionProjectionMap = import('@deepseek-ai/dsh-session-projection/types').SessionProjectionMap
  /**
   * The standard kit's key-addressed projection reader: `undefined` uniformly
   * means capability absent (host unit unmounted, or no frame carried the key).
   */
  export type UseProjection = {
    <K extends Extract<keyof SessionProjectionMap, string>>(key: K): SessionProjectionMap[K] | undefined
    <K extends Extract<keyof SessionProjectionMap, string>, S>(
      key: K,
      selector: (value: SessionProjectionMap[K] | undefined) => S,
      eq?: (a: S, b: S) => boolean,
    ): S
  }
  /** The outward session face; `command` is the one verb this plugin invokes. */
  export interface SessionFace {
    /**
     * Run one command line.
     * @param line - the command line, e.g. `/permission workspace-write`.
     * @returns acceptance, or the business/transport error.
     */
    command(line: string): Promise<import('@deepseek-ai/dsh-typert-protocol').RemoteResult<{ matched: boolean }>>
  }
  /** One live Session binding; only the session face is used here. */
  export interface SessionBinding {
    readonly session: SessionFace
  }
  /** The sessions-service face injected as the browser's `ctx.sessions`. */
  export interface ISessions {
    /**
     * Borrow an already-retained Session binding without extending its lifetime.
     * @param id - session id.
     * @returns the live binding, or undefined without a retained generation.
     */
    binding(id: SessionId): SessionBinding | undefined
  }
}

// ---------------------------------------------------------------------------
// @deepseek-ai/dsh-client-connection/client
//   lib/types/client/index.d.ts:22,97      (ConnectionGenerationState, ConnectionHandle.generation)
//   lib/types/client/connection.d.ts:10,12 (ConnectionGeneration.id)
// ---------------------------------------------------------------------------
declare module '@deepseek-ai/dsh-client-connection/client' {
  /** Observable identity of the active connection generation. */
  export interface ConnectionGenerationState {
    /** Active generation, or undefined before readiness and while reconnecting. */
    getSnapshot(): { readonly id: number } | undefined
    /** Subscribe to generation establishment, replacement, and loss. */
    subscribe(listener: () => void): () => void
  }
  /** The connection service handle; only its generation axis is read here. */
  export interface ConnectionHandle {
    /** Current Remote event generation. */
    readonly generation: ConnectionGenerationState
  }
}

// ---------------------------------------------------------------------------
// @deepseek-ai/dsh-client-locale/client
//   lib/types/client/index.d.ts (LocaleFace.register)
// ---------------------------------------------------------------------------
declare module '@deepseek-ai/dsh-client-locale/client' {
  /** Dictionary registration face of the locale service; narrowed to `register`. */
  export interface LocaleFace {
    /**
     * Register one namespace's dictionaries. Re-registering a locale a namespace
     * already carries throws, so a namespace has exactly one owner.
     * @param ns - dictionary namespace.
     * @param dicts - dictionaries by locale id.
     * @returns idempotent disposer removing exactly these dictionaries.
     */
    register<N extends keyof import('@deepseek-ai/dsh-client-ui-slots').LocaleNamespaceMap & string>(
      ns: N,
      dicts: Readonly<Record<string, import('@deepseek-ai/dsh-client-ui-slots').LocaleDictOf<N>>>,
    ): () => void
  }
}

// ---------------------------------------------------------------------------
// Specifiers the ported sources import for their declaration merging only.
// ---------------------------------------------------------------------------
declare module '@deepseek-ai/dsh-api-remotes/client' {}
declare module '@deepseek-ai/dsh-client-ui-conversation/client' {}
