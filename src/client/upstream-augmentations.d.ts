/**
 * Declaration merging for the frozen client packages this plugin imports but
 * does not install — the half of the build-time type face that must *merge*
 * rather than replace.
 *
 * This file is a module (it has top-level imports), because `declare module`
 * inside a module augments a resolvable target, while the same statement inside
 * a script *replaces* it. `@deepseek-ai/cordis` and
 * `@deepseek-ai/dsh-client-ui-slots` are both installed, so their members are
 * merged here; the absent packages' own shapes live in
 * `./upstream-faces.d.ts`.
 *
 * Members and their upstream sources:
 *   `Context.locale`                       dsh-client-locale/lib/types/client/index.d.ts
 *   `Context.remote`                       dsh-api-remotes/lib/types/client/index.d.ts:64
 *                                          dsh-permission-presets/lib/typert.remote-client.d.ts (the namespace)
 *   `SlotMap['conversation.input.permission']`
 *                                          dsh-client-ui-conversation/lib/types/client/contract/slots.d.ts:120
 *   `SessionStandardProps`                 dsh-client-ui-session/lib/types/client/index.d.ts
 *
 * `Context.sessions` is deliberately NOT declared here: the browser's Session
 * Controller and the host's `@deepseek-ai/dsh-session` store are two different
 * services under one name, and this repository typechecks both halves in one
 * program, so the client face is narrowed at its one use site
 * (`src/client/index.tsx`) instead of colliding in the merge.
 */
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Locale service (`@deepseek-ai/dsh-client-locale`). */
    locale: import('@deepseek-ai/dsh-client-locale/client').LocaleFace
    /** Generated Remote namespaces (`@deepseek-ai/dsh-api-remotes`), narrowed to this plugin's calls. */
    remote: {
      /** Subscribe to one forwarded Host event. */
      $on(event: 'permission-presets/catalog-changed', listener: () => void): () => void
      /** The permission-presets namespace's one exported method. */
      readonly permissionPresets: {
        catalog(): Promise<import('@deepseek-ai/dsh-typert-protocol').RemoteResult<
          import('@deepseek-ai/dsh-permission-presets/client').PermissionCatalog
        >>
      }
    }
  }
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** Current-session permission control inside the composer tool row. */
    'conversation.input.permission': {
      kind: 'single'
      scope: 'session'
      /** Owner values supplied by the composer (`InputControlOwnerProps` upstream). */
      owner: { locked: boolean }
    }
  }
  interface SessionStandardProps {
    /** Host-computed projection values addressed by projection key. */
    useProjection: import('@deepseek-ai/dsh-api-session-controller/client').UseProjection
    /** Current Session identity. */
    sessionId: import('@deepseek-ai/dsh-session/types').SessionId
  }
}
