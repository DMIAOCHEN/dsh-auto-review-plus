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

**This package is a stopgap.** When upstream ships the same behaviour, use upstream's and delete this one.
The judgement is two criteria:

- **A — session context:** an Auto review request carries the session id and the session's reasoning effort.
- **B — reviewer choice:** which model reviews a session can be configured (ideally per session).

If upstream ships **A** alone, this package's remaining value is **B**, so it still earns its place. If
upstream ships **A and B**, this package is obsolete: [uninstall](#uninstall) it and let
`@deepseek-ai/dsh-experimental-auto-review` own the preset again.

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

Then:

1. **Fully restart `dsh web`.** Profile layers are composed at startup only — a running process keeps the
   plugin set it booted with, so a plugin installed (or upgraded) mid-run has no effect until you restart.
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
this (only the relevant field shown):

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
- **Asked once.** The first time a session is in Auto review without a record, the chooser also opens by
  itself, once per session.

## Upgrading dsh

The peers in `package.json` are pinned to an **exact** harness version. After a `dsh` upgrade the startup
preflight sees the mismatch and **disables this plugin by itself** (fail-safe: never a half-loaded plugin),
printing on stderr:

```
dsh: disabling profile plugin row "auto-review-plus": <reason>
```

Two remedies:

- **Exempt this exact version** — fastest, keeps the current build. The approval is exact on both sides:
  one package version, one `dsh` version.
  ```bash
  npx -y @deepseek-ai/dsh plugin --profile web allow-version dsh-auto-review-plus@0.1.0 --dsh-version <new-dsh-version> --accept-risk
  npx -y @deepseek-ai/dsh plugin --profile web version-exemptions
  npx -y @deepseek-ai/dsh plugin --profile web revoke-version dsh-auto-review-plus@0.1.0 --dsh-version <new-dsh-version>
  ```
  `allow-version` warns before it writes: allowing an incompatible plugin version can break the application
  or corrupt data. Only do it when you accept that.
- **Move the pins** — the supported path: update the `@deepseek-ai/dsh-*` versions in `package.json`, run
  `npm install && npm run build`, commit the regenerated `lib/`, bump the version, tag it, and reinstall.

## Reinstalling or upgrading this package

A `file:` (tarball) dependency carries **no integrity record** in the package manager, so reinstalling the
**same path at the same version** is silently skipped: you keep running the old code and see no error. So
versions always move:

- **Development:** bump the `-dev.N` suffix (`0.1.0-dev.1` → `0.1.0-dev.2` …) so every rebuild is a
  distinct version.
- **Release:** bump the version itself (`0.1.0` → `0.1.1`) and tag the release.

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

## Known limitations

- **Two permission-catalog readers per browser process.** This plugin keeps its own permission-catalog
  directory, and the shipped `@deepseek-ai/dsh-client-ui-permission-presets` keeps its own (it still owns
  the settings row and the `/permission` popup). Both subscribe to `permission-presets/catalog-changed`, so
  each catalog change costs one extra Remote read. Sharing is not possible without depending on that
  package's non-exported internals — its `client` entry exports only the plugin's `apply`/`inject`, not its
  directory — so this is accepted as a known cost.
- **The composer slot is claimed by priority, not reserved.** `conversation.input.permission` is a
  single-occupant cell and this plugin renders at `priority: -1`. A third party registering at a lower
  priority would displace this control; this plugin's fiber then fails to start and the shipped control
  stays in place — a graceful fallback, but the reviewer picker becomes unreachable.
- **State is not in the session log** (deliberately, see below), so do not delete
  `$DSH_HOME/storages/auto_review_plus` while `dsh` is running. Stop it, delete, restart.

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
