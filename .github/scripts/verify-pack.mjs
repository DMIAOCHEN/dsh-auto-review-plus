/**
 * Publish-payload guard — the single source of truth for "is this checkout
 * publishable?".
 *
 * Called by `ci.yml` (every push/PR) and by `publish.yml` (every release tag,
 * whether or not the npm upload is switched on). It verifies two things the
 * whole-`lib/` drift check cannot see:
 *
 *   1. every entry point in `package.json` (`main`, `types`, the `exports`
 *      targets) exists on disk — a dangling `exports["./client"]` breaks in the
 *      browser, after install;
 *   2. `npm pack` would ship exactly the expected file list — a file missing
 *      from `files` ships silently and only surfaces for users.
 *
 * Usage:
 *   node .github/scripts/verify-pack.mjs              # runs `npm pack --dry-run --json`
 *   node .github/scripts/verify-pack.mjs <report.json> # reads a saved report (tests)
 *
 * Exits non-zero with a `::error::` annotation on any mismatch. This file must
 * stay out of the published payload: it is not in `package.json`'s `files`.
 */
import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

// The published payload, in full. Derivation: package.json's `files` whitelist
// expands to 11 paths (`lib/types/**` and `locale/*` each contribute two) and npm
// always adds package.json itself; the count was confirmed once by hand against a
// real `npm pack --dry-run` (12 files). Keep this list in sync with `files` —
// that is the point of the guard.
const EXPECTED = [
  'LICENSE',
  'NOTICE',
  'README.md',
  'README.zh.md',
  'cordis.patch.yml',
  'lib/client.js',
  'lib/index.js',
  'lib/types/client/index.d.ts',
  'lib/types/index.d.ts',
  'locale/en.json',
  'locale/zh.json',
  'package.json',
]

// The pack report comes FIRST: the manifest check below needs the file list, not
// just the disk. An entry point that exists but is not in `files` is on disk and
// still never ships, so a real publish would break for every consumer while a
// disk-only check stayed green.
const report = process.argv[2]
let raw
if (report === undefined) {
  // One command string, run through a shell on every platform. That is what
  // Windows needs — Node refuses to spawn `npm.cmd` directly (EINVAL) since the
  // 2024 argument-injection fix — and it avoids the `args` + `shell: true` shape
  // Node deprecates (DEP0190). `--dry-run` packs and reports without uploading;
  // stderr is inherited so npm's own notices stay visible in the job log.
  try {
    raw = execSync('npm pack --dry-run --json', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    })
  } catch (error) {
    console.error(`::error::npm pack --dry-run --json failed: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
} else {
  raw = readFileSync(report, 'utf8')
}

const packed = JSON.parse(raw)
/**
 * Normalize every `npm pack --json` shape into a list of pack results.
 *
 * npm has shipped three of them, and this guard runs under two npm majors at
 * once (CI uses the bundled npm 10, the release workflow upgrades to npm 11):
 *   - an array of results (npm 7 through 10);
 *   - one result object carrying `files` (a single-package pack);
 *   - an object KEYED BY PACKAGE NAME whose values are the results (npm 11) —
 *     this one failed a real release: the guard saw no `files` at the top level
 *     and rejected a perfectly good pack report.
 * Anything else is reported below; nothing is guessed.
 * @param parsed - the parsed report.
 * @returns the pack results found, or an empty list when the shape is unknown.
 */
function packResults(parsed) {
  if (Array.isArray(parsed)) return parsed
  if (parsed === null || typeof parsed !== 'object') return []
  if (Array.isArray(parsed.files)) return [parsed]
  return Object.values(parsed)
}
const results = packResults(packed)
const usable = results.length > 0
  && results.every(result => result !== null && typeof result === 'object' && Array.isArray(result.files))
if (!usable) {
  console.error(`::error::unexpected \`npm pack --json\` shape (expected an array of results, one result object, or an object keyed by package name): ${JSON.stringify(packed).slice(0, 200)}`)
  process.exit(1)
}
// Some npm versions list directories too; only files count here. The set covers a
// multi-package report as well, where several results contribute paths.
const files = [...new Set(results.flatMap(result => result.files.map(item => item.path)))]
  .filter(path => !path.endsWith('/')).sort()

const manifest = JSON.parse(readFileSync('package.json', 'utf8'))
// Optional chaining on purpose: a manifest that lost an `exports` key must be
// reported by the check below, not crash the guard with a TypeError.
const refs = {
  main: manifest.main,
  types: manifest.types,
  'exports["."].types': manifest.exports?.['.']?.types,
  'exports["."].default': manifest.exports?.['.']?.default,
  'exports["./client"].types': manifest.exports?.['./client']?.types,
  'exports["./client"].default': manifest.exports?.['./client']?.default,
  'exports["./cordis.patch.yml"]': manifest.exports?.['./cordis.patch.yml'],
}
const normalize = value => (typeof value === 'string' ? value.replace(/^\.\//, '') : value)
const absent = Object.entries(refs)
  .filter(([, value]) => typeof value !== 'string' || !existsSync(normalize(value)))
if (absent.length > 0) {
  console.error(`::error::package.json points at missing files: ${absent.map(([key, value]) => `${key} -> ${value}`).join(', ')}`)
  process.exit(1)
}
// Present on disk is not enough: it has to be in the packed list too.
const unpacked = Object.entries(refs)
  .filter(([, value]) => typeof value === 'string' && !files.includes(normalize(value)))
if (unpacked.length > 0) {
  console.error(`::error::package.json entry points missing from the packed file list: ${unpacked.map(([key, value]) => `${key} -> ${value}`).join(', ')}; add them to package.json's \`files\``)
  process.exit(1)
}
console.log(`manifest entry points exist and ship: ${Object.values(refs).join(', ')}`)

const missing = EXPECTED.filter(path => !files.includes(path))
const extra = files.filter(path => !EXPECTED.includes(path))
if (missing.length > 0) console.error(`::error::npm pack would omit: ${missing.join(', ')}`)
if (extra.length > 0) console.error(`::error::npm pack would add unexpected files: ${extra.join(', ')}`)
if (missing.length > 0 || extra.length > 0) {
  console.error(`packed ${files.length} files, expected ${EXPECTED.length}`)
  process.exit(1)
}
console.log(`packed file list matches the expected ${files.length} files`)
