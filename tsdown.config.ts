import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { basename, dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'tsdown'

/** Package root, the anchor for the machine-independent virtual ids below. */
const PACKAGE_ROOT = dirname(fileURLToPath(import.meta.url))

/**
 * Read this package's own `name`, the single source of truth for the plugin id.
 *
 * Hard-coding the id here as well would let the ModuleLoader registration drift
 * away from the name the shell resolves the installed package by — and the
 * shell only finds the client half under the id it just loaded.
 * `scripts/wrap-client.mjs` reads the same field for the same reason.
 * @returns the package name.
 * @throws when `package.json` carries no usable name.
 */
function packageName(): string {
  const parsed: unknown = JSON.parse(readFileSync(resolve(PACKAGE_ROOT, 'package.json'), 'utf8'))
  const name = (parsed as { name?: unknown }).name
  if (typeof name !== 'string' || name === '') {
    throw new Error('tsdown.config.ts: package.json has no name to use as the plugin id')
  }
  return name
}

/** Module id stamped into the ModuleLoader registration and onto injected style tags. */
const CLIENT_ID = packageName()

/**
 * Virtual-id wrapper keeping module CSS away from tsdown's own CSS pipeline
 * (which requires @tsdown/css). The suffix matters: tsdown's guard matches ids
 * ending in `.css`, so the virtual id must not — same trick as the upstream
 * client bundle preset (`packages/client/tsdown.client.ts`).
 */
const CSS_VIRTUAL_PREFIX = '\0dsh-css:'
const CSS_VIRTUAL_SUFFIX = '.mjs'

/**
 * Emit one plugin-owned style injector plus the CSS Modules class map, matching
 * the shape the shell's loader claims (`style[data-plugin-css]` on a tag also
 * carrying `data-plugin`, see `client-modules`'s `claimStyles`).
 * @param id - plugin id stamped on the tag.
 * @param fileId - physical stylesheet path.
 * @param css - compiled stylesheet text.
 * @param classMap - local class name to hashed class name.
 * @returns the module source.
 */
function styleInjectionModule(id, fileId, css, classMap) {
  const tagId = `${id}/${basename(fileId)}`
  return [
    `const css = ${JSON.stringify(css)};`,
    `const tagId = ${JSON.stringify(tagId)};`,
    "if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']') === null) {",
    "  const tag = document.createElement('style');",
    `  tag.dataset.plugin = ${JSON.stringify(id)};`,
    '  tag.dataset.pluginCss = tagId;',
    '  tag.textContent = css;',
    '  document.head.appendChild(tag);',
    '}',
    `export default ${JSON.stringify(classMap)};`,
  ].join('\n')
}

/**
 * Rewrite `.class` selectors in one stylesheet while leaving every context a
 * global replace would corrupt verbatim: comments, quoted strings, `url(…)`
 * targets and `:global(…)` escape hatches. The upstream lightningcss parser
 * draws the same boundaries; rewriting a comment's prose (or a `url()` path)
 * would otherwise emit ghost class names and, in a `content`/`url` value, an
 * actual behavioural difference.
 * @param source - stylesheet text.
 * @param rename - maps one local class name to its emitted name.
 * @returns the rewritten stylesheet.
 */
function rewriteClassSelectors(source, rename) {
  let out = ''
  let index = 0
  const copyBalancedParens = () => {
    let depth = 1
    while (index < source.length && depth > 0) {
      const char = source[index++]
      out += char
      if (char === '(') depth += 1
      else if (char === ')') depth -= 1
    }
  }
  while (index < source.length) {
    const char = source[index]
    if (char === '/' && source[index + 1] === '*') {
      const end = source.indexOf('*/', index + 2)
      const stop = end === -1 ? source.length : end + 2
      out += source.slice(index, stop)
      index = stop
      continue
    }
    if (char === '"' || char === "'") {
      out += char
      index += 1
      while (index < source.length) {
        const inner = source[index++]
        out += inner
        if (inner === '\\') {
          if (index < source.length) { out += source[index]; index += 1 }
          continue
        }
        if (inner === char) break
      }
      continue
    }
    const opener = source.startsWith(':global(', index)
      ? ':global('
      : source.slice(index, index + 4).toLowerCase() === 'url(' ? 'url(' : undefined
    if (opener !== undefined) {
      out += opener
      index += opener.length
      copyBalancedParens()
      continue
    }
    // A selector needs a letter or underscore after the dot, so decimals like
    // `0.2px` are never touched.
    const selector = char === '.' ? /^\.([A-Za-z_][A-Za-z0-9_-]*)/.exec(source.slice(index)) : null
    if (selector !== null) {
      out += `.${rename(selector[1])}`
      index += selector[0].length
      continue
    }
    out += char
    index += 1
  }
  return out
}

/**
 * Compile `*.module.css` into a hashed class map plus one tagged style
 * injection, without a CSS toolchain dependency.
 *
 * The shell compiles its own client bundles with lightningcss; this package
 * cannot add that dependency, so the class-name rewrite is done here with a
 * deliberate, narrow rule (see {@link rewriteClassSelectors}). Names are hashed
 * per file the way CSS Modules does, so two plugins' sheets cannot collide.
 * @param id - plugin id stamped on the injected tag.
 * @param root - package root; virtual ids are relative to it so the emitted
 * bundle never carries the build machine's directory.
 * @returns the rolldown plugin.
 */
function cssModulesPlugin(id, root) {
  return {
    name: 'dsh-css-modules-inline',
    resolveId(source, importer) {
      if (!source.endsWith('.module.css')) return null
      const file = importer === undefined ? source : resolve(dirname(importer), source)
      // The virtual id rides into rolldown's `//#region` comment, so it must be
      // machine-independent (and must not leak the build directory): a
      // package-relative, slash-normalized path, not the absolute one.
      return CSS_VIRTUAL_PREFIX + relative(root, file).split(sep).join('/') + CSS_VIRTUAL_SUFFIX
    },
    async load(virtualId) {
      if (!virtualId.startsWith(CSS_VIRTUAL_PREFIX)) return null
      const fileId = resolve(root, virtualId.slice(CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length))
      // The virtual id otherwise hides the physical stylesheet from the watch graph.
      this.addWatchFile(fileId)
      const source = await readFile(fileId, 'utf8')
      // Hash the plugin id and the stylesheet TEXT, never the absolute path: a
      // path-dependent name would make the committed artifact differ from a
      // build on any other machine (CI's drift check caught exactly that), while
      // the id keeps two plugins' identical sheets from colliding.
      const hash = createHash('sha1').update(`${id}\n${source}`).digest('hex').slice(0, 6)
      const classMap = {}
      const compiled = rewriteClassSelectors(source, local => (classMap[local] ??= `${hash}_${local}`))
      return styleInjectionModule(id, fileId, compiled, classMap)
    },
  }
}

/**
 * Host half: the JavaScript `tsc` emitted from `tsconfig.build.json`, bundled
 * into one ESM file with every dsh peer left external. The intermediate is
 * JavaScript on purpose: rolldown's own TypeScript transform keeps standard
 * decorators as native syntax (`@Remote`), and Node parses no decorators at
 * all, while `tsc` downlevels them to its `__esDecorate` helpers — the same
 * shape the harness's own packages ship.
 */
const host = {
  entry: ['build/host/index.js'],
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  dts: false,
  outDir: 'lib',
  external: [/^@deepseek-ai\//],
  outputOptions: { entryFileNames: 'index.js' },
}

/** Client half: CJS bundle wrapped for the browser ModuleLoader (see scripts/wrap-client.mjs). */
const client = {
  entry: ['src/client/index.tsx'],
  format: ['cjs'],
  platform: 'browser',
  target: 'es2022',
  dts: { emitDtsOnly: false },
  outDir: 'lib',
  external: [/^@deepseek-ai\//, 'react', 'react-dom', 'react/jsx-runtime'],
  plugins: [cssModulesPlugin(CLIENT_ID, PACKAGE_ROOT)],
  outputOptions: { entryFileNames: 'client.body.js' },
}

/** Type declarations only: emitted to lib/types so package.json's types/exports/files all resolve. */
const types = {
  entry: ['src/index.ts', 'src/client/index.tsx'],
  format: ['es'],
  platform: 'node',
  target: 'node20',
  dts: { emitDtsOnly: true },
  outDir: 'lib/types',
}

/**
 * The host entry's own declaration, next to `lib/index.js`. It used to ride the
 * host bundle's `dts` emit; that bundle now starts from JavaScript, so the
 * declaration is emitted from the TypeScript source instead (a JS entry has no
 * types to emit).
 */
const rootTypes = {
  entry: ['src/index.ts'],
  format: ['es'],
  platform: 'node',
  target: 'node20',
  dts: { emitDtsOnly: true },
  outDir: 'lib',
}

export default defineConfig([host, client, types, rootTypes])
