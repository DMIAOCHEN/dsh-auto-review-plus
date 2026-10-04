/**
 * Static checks over the committed client bundle.
 *
 * Lives outside `tests/client` on purpose: it reads files, so it belongs to the
 * host Program (node types), not to the browser-shaped client Program.
 * @module dsh-auto-review-plus/tests/support/client-bundle
 */

/**
 * The shell's frozen module table, verbatim from
 * `packages/client/web/src/platform.ts` (0.2.0-rc.2):
 *
 *     export const PLATFORM_MODULES = [
 *       'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
 *       '@deepseek-ai/dsh-client-store',
 *       '@deepseek-ai/dsh-client-ui-slots',
 *       '@deepseek-ai/dsh-client-ui-primitives',
 *       '@deepseek-ai/dsh-client-ui-dockkit',
 *     ] as const
 *
 * `packages/client/web/src/seed.ts` pins the same nine words with
 * `satisfies Record<PlatformModule, unknown>`, so the table cannot drift from
 * the shell's static imports. A client bundle may import NOTHING else: the
 * loader's `require` resolves only these keys, so any other bare specifier makes
 * the plugin fail at load time — in the browser, after the artifacts shipped.
 */
export const FROZEN_CLIENT_MODULES: readonly string[] = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
]

/**
 * The module table this package's client bundle may use: the platform table,
 * plus this package's own `dsh.client.external` additions (the manifest field
 * the shell's bundler reads for extra shared modules).
 * @param manifestSource - `package.json` text.
 * @returns every allowed module specifier.
 */
export function frozenModulesOf(manifestSource: string): readonly string[] {
  const manifest: unknown = JSON.parse(manifestSource)
  const declared: unknown = Reflect.get(Reflect.get(manifest as object, 'dsh') ?? {}, 'client')
  const external: unknown = Reflect.get(declared ?? {}, 'external')
  const extra = Array.isArray(external) ? external.filter((value): value is string => typeof value === 'string') : []
  return [...FROZEN_CLIENT_MODULES, ...extra]
}

/**
 * Read every module specifier one client bundle body requires.
 *
 * Only literal specifiers are accepted: the loader's `require` is a table
 * lookup, so a computed specifier could never resolve and must fail this check
 * rather than pass silently.
 * @param source - bundle text (the ModuleLoader wrapper around the CJS body).
 * @returns the distinct specifiers, sorted.
 * @throws when a `require` call does not name a literal specifier.
 */
export function bareImportsOf(source: string): readonly string[] {
  const found = new Set<string>()
  for (const match of source.matchAll(/require\s*\(\s*([^)]*?)\s*\)/g)) {
    const argument = match[1] ?? ''
    const literal = /^(["'])([^"']*)\1$/.exec(argument)
    if (literal === null) {
      throw new Error(`the client bundle requires a non-literal specifier: require(${argument})`)
    }
    found.add(literal[2] ?? '')
  }
  return [...found].sort()
}

/**
 * Report the specifiers one client bundle requires that its module table cannot
 * serve. Relative specifiers are reported too: the loader's `require` is not a
 * filesystem resolver, so a relative edge is just as unresolvable.
 * @param source - bundle text.
 * @param allowed - module table the bundle may use.
 * @returns the offending specifiers, sorted.
 */
export function unsharedImportsOf(source: string, allowed: readonly string[]): readonly string[] {
  return bareImportsOf(source).filter(specifier => !allowed.includes(specifier))
}
