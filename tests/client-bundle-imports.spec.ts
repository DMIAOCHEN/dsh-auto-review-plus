import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  FROZEN_CLIENT_MODULES,
  bareImportsOf,
  frozenModulesOf,
  unsharedImportsOf,
} from './support/client-bundle.ts'

const bundlePath = fileURLToPath(new URL('../lib/client.js', import.meta.url))
const manifestPath = fileURLToPath(new URL('../package.json', import.meta.url))
// Read the COMMITTED artifact, not a fresh build: CI runs typecheck then test
// then build, so the tracked `lib/client.js` is what would ship if the sources
// regressed between the two.
const bundle = readFileSync(bundlePath, 'utf8')
const allowed = frozenModulesOf(readFileSync(manifestPath, 'utf8'))

describe('client bundle module table', () => {
  it('requires only modules the shell shares', () => {
    // An import outside the table is invisible to every other check: the source
    // compiles, the bundle builds, and the plugin only fails once a browser
    // loads it.
    expect(unsharedImportsOf(bundle, allowed)).toEqual([])
  })

  it('requires the four shared modules it is built from', () => {
    expect(bareImportsOf(bundle)).toEqual([
      '@deepseek-ai/dsh-client-store',
      '@deepseek-ai/dsh-client-ui-primitives',
      'react',
      'react/jsx-runtime',
    ])
  })

  it('requires the shared table this package declares, and nothing else', () => {
    // `dsh.client.external` is empty here, so the allowlist is exactly the
    // platform table — recorded so a future addition is a visible decision.
    expect(allowed).toEqual([...FROZEN_CLIENT_MODULES])
    expect(FROZEN_CLIENT_MODULES).toHaveLength(9)
  })

  it('rejects a specifier outside the table (the guard is not vacuous)', () => {
    const regressed = 'const clsx = require("clsx");\nconst react = require("react");'
    expect(bareImportsOf(regressed)).toEqual(['clsx', 'react'])
    expect(unsharedImportsOf(regressed, allowed)).toEqual(['clsx'])
  })

  it('rejects a relative specifier, which the loader cannot resolve', () => {
    expect(unsharedImportsOf('require("./helper.js")', allowed)).toEqual(['./helper.js'])
  })

  it('rejects a computed specifier instead of passing it over', () => {
    expect(() => bareImportsOf('require(name)')).toThrow('non-literal specifier')
  })
})
