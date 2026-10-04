[简体中文](README.zh.md) · **English**

# dsh-auto-review-plus

Auto review for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`) that sends the
**session context** with every review request and lets you pick the **reviewing model per session**.

> **Status:** experimental, pinned to `dsh` `0.2.0-rc.2`. It replaces the shipped Auto review preset,
> so read [Take over from the official Auto review](#take-over-from-the-official-auto-review-mandatory)
> before installing.

## What this is

`dsh` ships an experimental **Auto review** permission preset: instead of sandboxing a tool call, a model
reviews it first and decides whether it may run or has to be handed back to you for approval. This package
replaces that preset implementation and adds two things:

- **Session context in the review request.** Every review carries the `sessionId` it belongs to and the
  session's `reasoningEffort`, so a review is attributable to a session and reasons at the level that
  session is configured for.
- **A per-session reviewer model.** The Auto confirmation dialog carries a reviewer picker (provider /
  model / reasoning levels). The choice is stored per session. Left at
  *Follow the current session model*, the reviewer is the session's own model — upstream's behaviour.

Everything else is upstream's and unchanged: the risk gate and its acknowledgement copy, the approval
flow, PTC inner-call review, the risk policy, sandbox values, and the tool definitions.

## Why it exists

Upstream discussions this package answers:

- <https://github.com/deepseek-ai/deepseek-harness/discussions/8670>
- <https://github.com/deepseek-ai/deepseek-harness/discussions/8764>

**This package is a stopgap, and the exit rule is explicit.** As soon as **either** upstream discussion
lands a fix and the official review request carries the `sessionId` and the session's reasoning effort,
this package should be **deprecated**: [uninstall](#uninstall) it and let
`@deepseek-ai/dsh-experimental-auto-review` own the preset again.

- **Exit criterion (decides deprecation):** an official Auto review request carries the session id and the
  session's own reasoning effort. The project spec fixes this as the criterion, and it is sufficient on its
  own — there is nothing else to wait for.
- **Secondary consideration (does not decide deprecation):** whether the reviewing model can be configured
  per session. If that is still missing once the criterion above is met, the only question left is whether
  to keep a forked picker — *not* whether to keep this package installed. Leaving it installed keeps its
  `disabled: true` patch in `dsh.profile.bundles`, which would switch **off** the official Auto review that
  upstream has just fixed.

## Requirements

| | |
| --- | --- |
| `dsh` | `0.2.0-rc.2` — the harness peers are pinned to this **exact** version (see [Upgrading dsh](#upgrading-dsh)) |
| Node.js | **≥ 22** — the build targets `ES2024` and the host half uses `Promise.withResolvers` |
| OS | any (verified on Windows; the build is machine-independent and the artifacts are committed) |

## Install

**GitHub first.** The build artifacts (`lib/`) are committed, and this package declares no `prepare`
script, so installing from git needs **no build step** on your machine.

Pick one — and keep the profile name (`web` is the GUI profile) consistent with the one you launch:

```bash
# GitHub, pinned to the release tag (recommended: reproducible)
npx -y @deepseek-ai/dsh plugin --profile web add github:DMIAOCHEN/dsh-auto-review-plus#v0.1.0

# GitHub, following the default branch (drifts with every push)
npx -y @deepseek-ai/dsh plugin --profile web add github:DMIAOCHEN/dsh-auto-review-plus

# Local tarball, from a checkout at the repository root
npm pack && npx -y @deepseek-ai/dsh plugin --profile web add ./dsh-auto-review-plus-0.1.0.tgz

# npm — not published yet: this command fails with 404 until the first release is bootstrapped
npx -y @deepseek-ai/dsh plugin --profile web add dsh-auto-review-plus@latest --registry=https://registry.npmjs.org
```

Do **not** use `dsh plugin --profile web add .`: a directory dependency rewrites the profile's dependency
layout in place. This project is always installed from a tarball or a git source.

> **No tag exists yet.** The repository has no release tag until the maintainers cut `v0.1.0` — `git tag -l`
> is empty today — so the pinned `#v0.1.0` command fails until then. Use the untagged GitHub command or a
> local tarball in the meantime; see the release checklist before you rely on the pinned form.

Then:

1. **Restart `dsh web`.** Installing or removing a package changes the profile's dependency tree and its
   `dsh.profile.bundles` list, which are read when the app starts, so a running process keeps the plugin set
   it booted with. Patch *content* is the exception: a profile's patch layers are hot-reloaded on long-lived
   surfaces (dsh's own wording for the profile patch layer; the shipped web profile declares
   `"patchReload": "live"`), so an edit to a patch file — including this package's own `cordis.patch.yml` —
   is picked up without a restart.
2. Confirm it landed: `npx -y @deepseek-ai/dsh plugin --profile web list` prints the profile's dependencies
   (the same command is `pnpm list` inside `$DSH_HOME/profiles/web`).

## Take over from the official Auto review (mandatory)

`permissionPresets.registerAuto` is a **single-slot** registration: whichever layer registers first wins
and the other throws. Two layers therefore cannot both own the `auto` preset, and this package's
`cordis.patch.yml` must turn the official row off:

```yaml
- id: auto-review
  disabled: true

- insert:
    - id: auto-review-plus
      name: 'dsh-auto-review-plus'
```

A patch can only disable a row that the composition already declares, and a later layer wins. So
**the official `@deepseek-ai/dsh-experimental-auto-review` row must come before this package in
`dsh.profile.bundles`** — our patch layer is applied *after* it. `dsh plugin add` appends a newly installed
bundle to the end of that array, so the default order is already correct. The list lives in
`$DSH_HOME/profiles/web/package.json` (default `$DSH_HOME` is `~/.dsh`) and a healthy install looks like
this (the manifest is elided: other bundles such as `dsh-better-sidebar`, and everything outside `dsh`, are
not shown):

```json
{
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "@deepseek-ai/dsh-experimental-auto-review",
        "dsh-auto-review-plus"
      ]
    }
  }
}
```

If the official package is listed **after** this one, move it up (or remove the entry entirely — the preset
is then only ours) and restart.

If the official row is somehow still active, the package does not fail silently: it **stands down safely**
(it withdraws its own listener, so an Auto call is not reviewed twice — once by each layer) and writes to
the log:

```
auto-review-plus: cannot take over the "auto" preset — the official @deepseek-ai/dsh-experimental-auto-review layer is still active. Disable its row (disabled: true) or remove it from the profile bundles.
```

That line is the troubleshooting clue: fix the bundle order (or remove the official package), then restart.

## Use

1. Open a session, click the permission control in the composer and pick **Auto review** (badged `EXP`).
2. The confirmation dialog carries the reviewer picker: **Provider**, **Model**, **Reasoning levels**. It
   opens on **Follow the current session model**.
3. Acknowledge the risk and enable. The reviewer route is written before the preset switches, so a failed
   write keeps the dialog open instead of enabling Auto as if the choice had been stored.
4. To change or reset the choice later, pick **Auto review** again in the same menu — the chooser reopens.
   Choosing **Follow the current session model** deletes the record and returns to the session's own model.

Semantics:

- **Session-scoped.** One record per `sessionId`; there is no global default. It survives a restart and a
  session resume.
- **No record = follow.** The absence of a record means "use the session's own route"; following is never
  stored as an explicit value.
- **The picker shows the reviewing model's capability.** The *Reasoning levels* row lists what the chosen
  model supports. The effort actually sent with a review is the session's own effort, or — when the session
  pins none — the level configured as `fallbackReasoningEffort`, applied only if the review route really
  offers it.
- **A route that rejects the session's level retries once.** If the pinned reviewer route does not support
  the reasoning level the session is using, that review is not ended: the plugin reports the level and the
  exact route, then retries the review **without** a reasoning effort. The call is still judged instead of
  being denied for a reason the reviewer never got to consider. The retry is one attempt, not a fallback
  chain: if it fails too, that failure is the review's failure (reviews stay fail-closed).
- **Asked once per visit.** The first time a session is in Auto review without a record, the chooser also
  opens by itself. That memory is component state, not a stored flag: one question per session per page
  load. Reloading the page asks again, because the missing record still means "follow".

## Upgrading dsh

The peers in `package.json` are pinned to an **exact** harness version. After a `dsh` upgrade the mismatch
is caught at **bundle admission**: this package is a profile *bundle* (its `package.json` declares
`dsh.bundle.patch`, which is why it is listed in `dsh.profile.bundles`), and a bundle is not a plugin row,
so the row-level admission never reads its peers. An incompatible bundle is **skipped**, and because the
skip happens before its layers are composed, this package's `cordis.patch.yml` never runs and the plugin is
simply absent — fail-safe, never half-loaded. The startup diagnostic on stderr is:

```
dsh: skipping profile bundle "dsh-auto-review-plus": Error: Plugin dsh-auto-review-plus@0.1.0 is incompatible with dsh <new>: peerDependencies {...}. Running it may cause crashes or data loss. Update the plugin or install a plugin version compatible with this dsh runtime. To accept this risk explicitly, grant the exact-version exemption for dsh-auto-review-plus@0.1.0 on dsh <new> with `dsh plugin allow-version` or the plugin manager, then retry the installation or restart dsh. Exact-version exemption: not active.
```

(`{...}` stands for the full `@deepseek-ai/dsh-*` peer map.) `dsh: disabling profile plugin row "…"` is the
*other* compatibility message: it belongs to the row-level admission, which only sees rows the composition
produced. It cannot name this package — when the bundle is skipped its patch never contributes the
`auto-review-plus` row — so the two messages are mutually exclusive by construction.

Two remedies:

- **Exempt this exact version** — fastest, keeps the current build. The approval is exact on both sides:
  one package version, one `dsh` version.
  ```bash
  npx -y @deepseek-ai/dsh plugin --profile web allow-version dsh-auto-review-plus@0.1.0 --dsh-version <new-dsh-version> --accept-risk
  npx -y @deepseek-ai/dsh plugin --profile web version-exemptions
  npx -y @deepseek-ai/dsh plugin --profile web revoke-version dsh-auto-review-plus@0.1.0 --dsh-version <new-dsh-version>
  ```
  `allow-version` warns before it writes: allowing an incompatible plugin version can break the application
  or corrupt data. Only do it when you accept that. The exemption is read by **bundle admission** too, so the
  same grant clears this path (the warning above even names the command).
- **Move the pins** — the supported path: update the `@deepseek-ai/dsh-*` versions in `package.json`, run
  `npm install && npm run build`, commit the regenerated `lib/`, bump the version, tag it, and reinstall.

## Reinstalling or upgrading this package

A `file:` (tarball) dependency carries **no integrity record** in the package manager, so reinstalling the
**same path at the same version** is silently skipped: you keep running the old code and see no error. So
versions always move:

- **Development:** bump the `-dev.N` suffix (`0.1.0-dev.1` → `0.1.0-dev.2` …) so every rebuild is a
  distinct version.
- **Release:** bump the version itself (`0.1.0` → `0.1.1`) and tag the release.

### Releasing (maintainers)

`npm publish` is **off by default**, so pushing the release tag is a pure GitHub-first release: the
`publish` workflow still runs every check (install → typecheck → test → build → the whole-`lib/` drift
check → the tag-vs-`package.json` check → the pack-manifest guard) and then stops, logging a notice
instead of uploading. To switch the upload on, set the repository **variable** `NPM_PUBLISH_ENABLED` to
`true` (Settings → Secrets and variables → Actions → Variables); from the next tag every release also
publishes to npm, tokenless, with provenance.

The **first** publish is a one-time manual bootstrap and must happen **before** the variable is set: npm's
Trusted Publishing is package-scoped and npm refuses to create a package from an OIDC-only publish, so
someone has to `npm publish --access public` once from a tag checkout and configure the trusted publisher
on npmjs.com. The `workflow_dispatch` dry run is not affected by the switch and stays available throughout.

After installing a new build, **fully restart `dsh web`** again.

## Uninstall

```bash
npx -y @deepseek-ai/dsh plugin --profile web remove dsh-auto-review-plus
```

then fully restart `dsh web`.

While unloading, the plugin **migrates live Auto sessions to Full access** (`danger-full-access`), because
the preset they point at is about to disappear. Sessions that are not in Auto review are untouched.

The per-session reviewer records are **not** deleted with the plugin: they sit in a storage domain under
`$DSH_HOME/storages/auto_review_plus` (see below). Removing that directory afterwards is safe and only
loses the pinned reviewer models.

## Troubleshooting

### The Auto review option disappears, or a session refuses to resume

This build disables the official `auto-review` row from its own patch, so **Auto review exists only while
this package's own row is mounted**. If that row fails to mount — most often the `storageDomain` service is
missing, or opening the reviewer-route storage domain fails — the official row stays disabled and nothing
replaces it. The host half opens the domain *before* it registers the preset (a domain that fails to open
keeps the gate from being advertised at all), so a storage failure has exactly this shape.

- **Symptoms.** New sessions show no **Auto review** entry in the composer permission menu. A session that
  was already in Auto review fails **loudly** when it is resumed: its stored preset requires its live
  integration, and `permissionPresets.pinInitialPermission` refuses with
  `permission: cannot restore preset "auto" without its active integration`.
- **This is a visible failure, not a silent one.** The entry is gone from the UI and the resume path raises;
  nothing is reviewed in the meantime.
- **Confirm it.** Look in the `dsh web` log for this package's mount/registration diagnostics (the loader
  reports it as `auto-review-plus`; a failed `storageDomain.open` is the error to look for) and check that
  the package is installed at all with `npx -y @deepseek-ai/dsh plugin --profile web list`.
- **Get back to a working Auto review.** Fix the reported cause — usually the storage service or its data
  under `$DSH_HOME/storages` — and restart `dsh web`. Removing this package also restores the official Auto
  review right away: the `disabled: true` patch ships with this package, so uninstalling it re-enables the
  official row.

### The package loaded but did not take over

See [Take over from the official Auto review](#take-over-from-the-official-auto-review-mandatory): the log
line `auto-review-plus: cannot take over the "auto" preset …` means the official row is still active, which
is a bundle-order problem in `dsh.profile.bundles`.

## Known limitations

- **Two permission-catalog readers per browser process.** This plugin keeps its own permission-catalog
  directory, and the shipped `@deepseek-ai/dsh-client-ui-permission-presets` keeps its own (it still owns
  the settings row and the `/permission` popup). Both subscribe to `permission-presets/catalog-changed`, so
  each catalog change costs one extra Remote read. Sharing is not possible without depending on that
  package's non-exported internals — its `client` entry exports only the plugin's `apply`/`inject`, not its
  directory — so this is accepted as a known cost.
- **The composer slot is claimed by priority, not reserved.** `conversation.input.permission` is a
  single-occupant cell and this plugin renders at `priority: -1`. Several entries at *distinct* priorities
  coexist in one cell and the **lowest live entry renders**, so a third party registering at a lower
  priority (say `-2`) silently wins the cell: neither this control nor the shipped one renders, and the
  reviewer picker becomes unreachable. Only a registration at the **exact same** priority collides — that
  one throws, this plugin's fiber does not start, and the shipped control (default priority `0`) keeps
  rendering. Neither path crashes the app; only the first hides the picker.
- **Do not delete `$DSH_HOME/storages/auto_review_plus` while `dsh` is running.** The domain's in-memory
  table is what the running process reads and writes, and the per-record directory is only its persisted
  projection, so removing files underneath a live domain only confuses the next write. Stop `dsh`, delete
  the directory, restart. (That this state is deliberately *not* in the session log is a separate decision,
  see below.)

## For contributors: plugin state must never be written as session events

Do not persist any plugin state by appending a session event. The failure is silent when written and
permanent when read back:

- Session event types are a **build-time generated** closed set (`KNOWN_SESSION_EVENT_TYPES`). An event type
  from outside the repository is, by construction, not in it.
- `Session.append` cannot mark a third-party event type `ignorable` (for non-surface types it is dropped).
- The persistence **read** path is **fail-closed** for "unknown and not ignorable": it throws
  `SessionFormatUnsupportedError`. The **write** path does not validate, so the damage surfaces only at the
  next resume — and by then the log is already on disk.
- The consequence is not a warning: every session that saw that event becomes **permanently unresumable**.

This package therefore keeps its per-session reviewer route in a **storage domain** instead:
domain `auto_review_plus`, `layout: 'per-record'`, table `routes`, keyed by `sessionId`. On disk that is
`$DSH_HOME/storages/auto_review_plus` (`$DSH_HOME` defaults to `~/.dsh`). Domain data lives as long as the
profile and is **not** cleaned up when a session is deleted; the volume is one small record per session.

## License and provenance

MIT — see [LICENSE](LICENSE) and [NOTICE](NOTICE).

This is a **derivative work, not original code**. The host half is adapted from
`packages/experimental/auto-review`, the client half is ported from `packages/client/ui-permission-presets`,
and the locale strings come from the same packages of
[`deepseek-ai/deepseek-harness`](https://github.com/deepseek-ai/deepseek-harness) (MIT). Keep the `NOTICE`
file and the upstream attribution in place in any redistribution or fork.
