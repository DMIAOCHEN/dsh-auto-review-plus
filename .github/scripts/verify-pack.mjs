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
import { execFileSync } from 'node:child_process'
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

const manifest = JSON.parse(readFileSync('package.json', 'utf8'))
const refs = {
  main: manifest.main,
  types: manifest.types,
  'exports["."].types': manifest.exports['.'].types,
  'exports["."].default': manifest.exports['.'].default,
  'exports["./client"].types': manifest.exports['./client'].types,
  'exports["./client"].default': manifest.exports['./client'].default,
  'exports["./cordis.patch.yml"]': manifest.exports['./cordis.patch.yml'],
}
const broken = Object.entries(refs)
  .filter(([, path]) => typeof path !== 'string' || !existsSync(path.replace(/^\.\//, '')))
if (broken.length > 0) {
  console.error(`::error::package.json points at missing files: ${broken.map(([key, path]) => `${key} -> ${path}`).join(', ')}`)
  process.exit(1)
}
console.log(`manifest entry points exist: ${Object.values(refs).join(', ')}`)

const report = process.argv[2]
let raw
if (report === undefined) {
  // `--dry-run` packs and reports without uploading; stderr is inherited so npm's
  // own notices stay visible in the job log. `shell` is needed on Windows: Node
  // refuses to spawn `npm.cmd` directly (EINVAL) since the 2024 command-injection
  // fix, and the arguments here are fixed literals.
  try {
    raw = execFileSync('npm', ['pack', '--dry-run', '--json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
      shell: process.platform === 'win32',
    })
  } catch (error) {
    console.error(`::error::npm pack --dry-run --json failed: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
} else {
  raw = readFileSync(report, 'utf8')
}

const packed = JSON.parse(raw)
// npm prints a one-element array (npm >= 7); tolerate a bare object so an npm that
// changed shape fails with this message, not a TypeError.
const entry = Array.isArray(packed) ? packed[0] : packed
if (entry === undefined || !Array.isArray(entry.files)) {
  console.error(`::error::unexpected \`npm pack --json\` shape: ${JSON.stringify(packed).slice(0, 200)}`)
  process.exit(1)
}
// Some npm versions list directories too; only files count here.
const files = entry.files.map(item => item.path).filter(path => !path.endsWith('/')).sort()
const missing = EXPECTED.filter(path => !files.includes(path))
const extra = files.filter(path => !EXPECTED.includes(path))
if (missing.length > 0) console.error(`::error::npm pack would omit: ${missing.join(', ')}`)
if (extra.length > 0) console.error(`::error::npm pack would add unexpected files: ${extra.join(', ')}`)
if (missing.length > 0 || extra.length > 0) {
  console.error(`packed ${files.length} files, expected ${EXPECTED.length}`)
  process.exit(1)
}
console.log(`packed file list matches the expected ${files.length} files`)
