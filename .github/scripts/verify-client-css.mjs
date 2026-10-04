/**
 * Client-CSS guard: every class name this package emits must be a legal CSS
 * identifier.
 *
 * Why this exists: `tsdown.config.ts` builds class names as `<hash>_<local>`,
 * where the hash is hex — so a name can start with a DIGIT. A class selector that
 * starts with a digit is invalid CSS, and a browser drops the WHOLE rule while
 * the class name stays on the element: the surface renders with the browser's
 * defaults and nothing reports an error anywhere. That shipped once
 * (`632ba0_picker` in `ReviewerRoutePicker.module.css`; only the module whose
 * hash happened to start with a letter, `ca829f_trigger`, was styled).
 *
 * The artifact that reaches a browser is the bundled JavaScript, so this reads
 * the COMMITTED bundle rather than the sources — and the same run exercises the
 * predicate against known-good and known-bad names, so "no violations" cannot
 * come from a check that never fires.
 *
 * Usage: node .github/scripts/verify-client-css.mjs [lib/client.js]
 */
import { existsSync, readFileSync } from 'node:fs'

const BUNDLE = process.argv[2] ?? 'lib/client.js'

/** The CSS identifier grammar: a letter or underscore, then identifier characters. */
const LEGAL_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_-]*$/

// Negative and positive controls, checked on every run: if the predicate ever
// stopped rejecting a digit-leading name, the scan below would be vacuous.
const SELF_TEST = [
  { name: '632ba0_picker', legal: false, why: 'digit-leading name (the bug)' },
  { name: '7f194c_dialog', legal: false, why: 'digit-leading name (the bug)' },
  { name: 'ca829f_trigger', legal: true, why: 'letter-leading name' },
  { name: '_632ba0_picker', legal: true, why: 'the prefixed shape' },
]
const misclassified = SELF_TEST.filter(entry => LEGAL_IDENTIFIER.test(entry.name) !== entry.legal)
if (misclassified.length > 0) {
  console.error(`::error::the identifier predicate is broken: ${misclassified.map(e => `${e.name} (${e.why})`).join(', ')}`)
  process.exit(1)
}
console.log(`self-test: ${SELF_TEST.length}/${SELF_TEST.length} control names classified as expected`)

if (!existsSync(BUNDLE)) {
  console.error(`::error::${BUNDLE} is missing — run \`npm run build\` first`)
  process.exit(1)
}
const bundle = readFileSync(BUNDLE, 'utf8')

// The inlined stylesheets, as emitted by the CSS-modules plugin: `const css = "..."`
// (rolldown may suffix the identifier: `css$2`).
const stylesheets = [...bundle.matchAll(/const css(?:\$\d+)? = ("(?:[^"\\]|\\.)*")/g)]
  .map(match => JSON.parse(match[1]))
if (stylesheets.length === 0) {
  console.error(`::error::no inlined stylesheet found in ${BUNDLE} — the extraction is stale, fix the guard`)
  process.exit(1)
}

// Class selectors inside those stylesheets. A token that starts with a digit only
// counts as a generated name when it also carries the `_` separator, which keeps
// decimals (`0.5rem`) out of the check.
const selectors = new Set()
for (const css of stylesheets) {
  for (const match of css.matchAll(/\.([A-Za-z0-9_-]+)/g)) {
    const name = match[1]
    if (/^\d/.test(name) && !name.includes('_')) continue
    selectors.add(name)
  }
}

// The per-stylesheet class maps: `var <Module>_module_css_default = { "local": "name" }`.
const mapped = new Set()
const perModule = []
for (const match of bundle.matchAll(/var (\w+)_module_css_default = \{([\s\S]*?)\n\};/g)) {
  const [, moduleName, body] = match
  const names = [...body.matchAll(/"([^"]+)":\s*"([^"]+)"/g)].map(pair => pair[2])
  names.forEach(name => mapped.add(name))
  // The generated shape is `<prefix><hash>_<local>`; the first two `_`-separated
  // segments are what identifies the stylesheet, so print those.
  const keys = [...new Set(names.map(name => name.split('_').slice(0, 2).join('_')))].sort()
  perModule.push(`${moduleName}: ${names.length} names, keys ${keys.join(', ')}`)
}

const names = [...new Set([...selectors, ...mapped])].sort()
console.log(`${BUNDLE}: ${selectors.size} class selectors, ${mapped.size} mapped names, ${stylesheets.length} stylesheets`)
for (const line of perModule) console.log(`  ${line}`)

const illegal = names.filter(name => !LEGAL_IDENTIFIER.test(name))
if (illegal.length > 0) {
  console.error(`::error::${BUNDLE} carries CSS class names that are not legal identifiers (a class selector must start with a letter or underscore, or the browser drops the whole rule in silence): ${illegal.join(', ')}`)
  process.exit(1)
}
console.log(`all ${names.length} class names are legal CSS identifiers`)
