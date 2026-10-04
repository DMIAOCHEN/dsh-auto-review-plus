import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { basename, dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'tsdown'

/** Module id stamped into the ModuleLoader registration and onto injected style tags. */
const CLIENT_ID = 'dsh-auto-review-plus'

/** Package root, the anchor for the machine-independent virtual ids below. */
const PACKAGE_ROOT = dirname(fileURLToPath(import.meta.url))

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
 * Compile `*.module.css` into a hashed class map plus one tagged style
 * injection, without a CSS toolchain dependency.
 *
 * The shell compiles its own client bundles with lightningcss; this package
 * cannot add that dependency, so the class-name rewrite is done here with a
 * deliberate, narrow rule: only `.identifier` occurrences that are not followed
 * by another identifier character are rewritten (`.trigger` never matches
 * inside `.triggerIcon`, and `0.2px` never matches at all). Names are hashed
 * per file exactly as CSS Modules does, so two plugins' sheets cannot collide.
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
      for (const local of new Set([...source.matchAll(/\.([A-Za-z_][A-Za-z0-9_-]*)/g)].map(match => match[1]))) {
        classMap[local] = `${hash}_${local}`
      }
      let compiled = source
      for (const local of Object.keys(classMap).sort((left, right) => right.length - left.length)) {
        compiled = compiled.replaceAll(
          new RegExp(`\\.${local}(?![A-Za-z0-9_-])`, 'g'),
          `.${classMap[local]}`,
        )
      }
      return styleInjectionModule(id, fileId, compiled, classMap)
    },
  }
}

/** Host half: plain ESM, dsh peers stay external (same shape as the shipped plugin). */
const host = {
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  dts: { emitDtsOnly: false },
  outDir: 'lib',
  external: [/^@deepseek-ai\//],
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

export default defineConfig([host, client, types])
