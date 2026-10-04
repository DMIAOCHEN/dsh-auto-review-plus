/**
 * `src/client/upstream-faces.d.ts` stands in for frozen client packages this
 * repository does not install: the shell's module table answers them in the
 * browser, but `tsc` needs declarations on disk to check the port.
 *
 * TypeScript resolves an ambient module declaration *before* a real package, so
 * that shim would silently shadow published declarations the day one of these
 * packages becomes installed. This test makes the state loud instead: install
 * the package, delete the matching block in the shim, and the ported sources
 * start checking against the published declarations.
 */
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

/** Package names whose faces `src/client/upstream-faces.d.ts` declares. */
const SHIMMED = [
  '@deepseek-ai/dsh-api-remotes',
  '@deepseek-ai/dsh-api-session-controller',
  '@deepseek-ai/dsh-client-connection',
  '@deepseek-ai/dsh-client-locale',
  '@deepseek-ai/dsh-client-ui-conversation',
  '@deepseek-ai/dsh-client-ui-session',
] as const

const require = createRequire(import.meta.url)

describe('client build-time type faces', () => {
  for (const name of SHIMMED) {
    it(`${name} stays uninstalled, so the shim cannot shadow it`, () => {
      expect(() => require.resolve(`${name}/package.json`)).toThrow()
    })
  }
})
