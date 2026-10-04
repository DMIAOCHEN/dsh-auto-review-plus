# dsh-auto-review-plus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付一个独立发布的 dsh 插件 `dsh-auto-review-plus`，它接管 Auto review 权限模式：审查请求携带会话上下文（`sessionId`、`reasoningEffort`），并支持按会话选定审查模型（含弹框与重置）。

**Architecture:** 单包双半。宿主半（`src/index.ts`）实现审查请求、健壮性回退、会话级"审查路由"（会话事件 + projection）与给客户端用的 Remote API，并通过 `registerAuto` 接管 `auto` preset；客户端半（`src/client/index.tsx`）以更低 priority 遮蔽 `conversation.input.permission` 单槽，自建含模型选择器的确认弹框。官方 auto-review 由本包 patch 停用。

**Tech Stack:** TypeScript、ESM、cordis 插件模型（`@deepseek-ai/cordis`）、`@deepseek-ai/dsh-*` 0.2.0-rc.2、tsdown/esbuild 构建、vitest 单测、GitHub Actions（CI + tag 触发 npm 发布）。

**Spec:** `docs/superpowers/specs/2026-10-02-dsh-auto-review-plus-design.md`

## Global Constraints

- 目标运行时：dsh `0.2.0-rc.2`（已发布的 `latest`/`next` 均为此版本）。
- 包名固定 `dsh-auto-review-plus`；**不得**使用 `@deepseek-ai/dsh-experimental-auto-review`（安装目录优先解析会遮蔽同名 profile 包）。
- preset id 沿用 harness 的 `AUTO_PRESET = 'auto'`；**不得**把 `auto` 写入 `permission` 行的 `config.presets`。
- 会话级状态**一律走 storage domain**（`ctx.storageDomain`，`layout: 'per-record'`，键 = sessionId）；**禁止**声明 `SessionEventMap` 扩展或调用 `session.append`（第三方事件不在构建期生成的 `KNOWN_SESSION_EVENT_TYPES` 内，持久化读路径 fail-closed → 会话永久无法 resume）。
- 行 id：`auto-review-plus`；patch 中必须包含对官方 `auto-review` 行的 `disabled: true`。
- 审查请求必须携带 `sessionId` 与（会话存在时）`reasoningEffort`；`temperature` 固定 `0`。
- 审查失败必须 fail-closed（工具体不执行）；风险策略／审批语义不得改变。
- 构建产物 `lib/index.js` 与 `lib/client.js` **入库**，CI 必须校验产物与源码一致。
- 提交信息用英文祈使句；每个任务结束时提交一次。
- 所有命令行示例在仓库根目录（`D:\02.LocalDemo\dsh\dsh-auto-review-plus`）执行。

---

## File Structure

| 文件 | 职责 |
|---|---|
| `package.json` | 包身份、exports（`.` 与 `./client`）、peers、`dsh.bundle.patch`、`dsh.client` |
| `tsconfig.json` | 宿主半 TS 配置（仅类型检查用，构建走 tsdown/esbuild） |
| `tsdown.config.ts` | 双产物构建配置（host face / client face） |
| `cordis.patch.yml` | 停用官方 `auto-review` 行 + 插入 `auto-review-plus` 行 |
| `src/index.ts` | 宿主半入口：注册 preset、前置审查监听器、卸载迁移 |
| `src/review.ts` | 审查请求构造与响应解析（修复两处 + 回退 + 诊断） |
| `src/reviewer-route.ts` | 会话级审查路由：事件声明、projection、读写 |
| `src/remote.ts` | 暴露给客户端半的 Remote API（provider/model/能力/路由） |
| `src/client/index.tsx` | 客户端半入口：遮蔽权限槽 |
| `src/client/PermissionControl.tsx` | 权限控件（chip + 菜单 + 确认弹框），移植官方并加模型选择器 |
| `locale/en.json`、`locale/zh.json` | 文案（沿用官方权限文案 + 新增模型选择器文案） |
| `.github/workflows/ci.yml` | 安装、构建、产物漂移校验、单测 |
| `.github/workflows/publish.yml` | tag `v*` 触发：一致性校验 → 构建 → 产物校验 → `npm publish --provenance` |
| `LICENSE`、`NOTICE` | MIT + 派生署名 |
| `README.md`、`README.zh.md` | 安装、冲突处理、升级、退出策略 |

**移植约定（适用于所有客户端任务）**：客户端半是"移植 + 精确改动"型工作。每个任务都给出上游源文件绝对路径、需要逐字复制的范围、以及必须改动的差异点；实现者不得凭记忆重写上游逻辑，也不得改动本计划未列出的行为。

---

### Task 0: 仓库骨架与 CI（先让 CI 跑起来）

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitattributes`, `.gitignore`, `LICENSE`, `NOTICE`
- Create: `.github/workflows/ci.yml`
- Test: `npm run typecheck` 与 `npm run build` 在本地通过；CI 在首次 push 后绿色

**Interfaces:**
- Consumes: 无（首个任务）
- Produces: `npm run build`（产出 `lib/index.js`、`lib/client.js`）、`npm run typecheck`、`npm run test`；后续任务依赖这三个脚本名

- [ ] **Step 1: 写 `.gitattributes` 与 `.gitignore`**

`.gitattributes`：

```
* text=auto eol=lf
*.png binary
*.ico binary
```

`.gitignore`：

```
node_modules/
*.log
.DS_Store
coverage/
```

- [ ] **Step 2: 写 `package.json`**

```json
{
  "name": "dsh-auto-review-plus",
  "version": "0.1.0",
  "description": "Auto review for dsh with session context (sessionId, reasoningEffort) and a per-session review-model picker",
  "type": "module",
  "main": "lib/index.js",
  "types": "lib/types/index.d.ts",
  "exports": {
    ".": { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },
    "./client": { "types": "./lib/types/client/index.d.ts", "default": "./lib/client.js" },
    "./locale/*.json": "./locale/*.json",
    "./package.json": "./package.json",
    "./cordis.patch.yml": "./cordis.patch.yml"
  },
  "files": [
    "lib/index.js",
    "lib/client.js",
    "lib/types/**/*.d.ts",
    "cordis.patch.yml",
    "locale/*.json",
    "README.md",
    "README.zh.md",
    "LICENSE",
    "NOTICE"
  ],
  "license": "MIT",
  "scripts": {
    "build": "tsdown",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "test": "vitest run"
  },
  "peerDependencies": {
    "@deepseek-ai/cordis": "~4.0.4",
    "@deepseek-ai/dsh-agent": "0.2.0-rc.2",
    "@deepseek-ai/dsh-agent-instructions": "0.2.0-rc.2",
    "@deepseek-ai/dsh-llm": "0.2.0-rc.2",
    "@deepseek-ai/dsh-permission-presets": "0.2.0-rc.2",
    "@deepseek-ai/dsh-session": "0.2.0-rc.2",
    "@deepseek-ai/dsh-session-projection": "0.2.0-rc.2",
    "@deepseek-ai/dsh-tools": "0.2.0-rc.2",
    "@deepseek-ai/dsh-user-approval": "0.2.0-rc.2"
  },
  "dependencies": {
    "@deepseek-ai/dsh-util-values": "0.2.0-rc.2"
  },
  "devDependencies": {
    "@deepseek-ai/dsh-agent": "0.2.0-rc.2",
    "@deepseek-ai/dsh-llm": "0.2.0-rc.2",
    "@deepseek-ai/dsh-session": "0.2.0-rc.2",
    "@deepseek-ai/dsh-session-projection": "0.2.0-rc.2",
    "@deepseek-ai/dsh-tools": "0.2.0-rc.2",
    "@deepseek-ai/dsh-permission-presets": "0.2.0-rc.2",
    "@deepseek-ai/cordis": "~4.0.4",
    "@types/react": "^19.0.0",
    "react": "^19.0.0",
    "tsdown": "^0.9.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": {
      "platform": "web",
      "inject": [
        "@deepseek-ai/dsh-client-locale",
        "@deepseek-ai/dsh-client-ui-slots",
        "@deepseek-ai/dsh-client-ui-primitives",
        "@deepseek-ai/dsh-client-ui-conversation",
        "@deepseek-ai/dsh-client-modules"
      ]
    }
  }
}
```

- [ ] **Step 3: 写 `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 4: 写 `LICENSE` 与 `NOTICE`**

`LICENSE` 用标准 MIT 全文，版权行 `Copyright (c) 2026 DMIAOCHEN`。

`NOTICE`：

```
dsh-auto-review-plus
Copyright (c) 2026 DMIAOCHEN

This package is a modified derivative of works from the DeepSeek Harness project
(https://github.com/deepseek-ai/deepseek-harness), MIT licensed:

  - packages/experimental/auto-review            → src/review.ts, src/index.ts (adapted)
  - packages/client/ui-permission-presets        → src/client/PermissionControl.tsx (ported)
  - locale strings from the same packages        → locale/en.json, locale/zh.json

Modifications: the review request carries the session id and reasoning effort,
adds a configurable fallback reasoning level, adds a session-scoped reviewer
route (session event + projection) with a client picker, and shadows the
permission slot to host that picker.
```

- [ ] **Step 5: 写 `.github/workflows/ci.yml`**

```yaml
name: ci

on:
  push:
    branches: [main]
  pull_request:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm install --no-audit --no-fund
      - run: npm run typecheck
      - run: npm run build
      - name: Verify committed artifacts match a fresh build
        run: |
          git diff --exit-code -- lib/index.js lib/client.js \
            || { echo "::error::lib/ is stale — run 'npm run build' and commit the result"; exit 1; }
      - run: npm test
```

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "Add repository skeleton and CI workflow"
```

Expected: CI 在 push 后失败于 `npm run build`（尚无构建配置）——这是预期的；Task 1 会补上构建。

---

### Task 1: 客户端构建 spike（决定方案能否成立）

**Files:**
- Create: `tsdown.config.ts`
- Create: `src/client/index.tsx`（spike 版：只注册一个设置行渲染一行文字）
- Create: `src/index.ts`（spike 版：仅作为宿主行存在，空 apply）
- Create: `cordis.patch.yml`
- Test: 在真实 dsh web 中安装并确认浏览器端出现该文字

**Interfaces:**
- Consumes: Task 0 的 `npm run build`
- Produces: 可复用的构建配置（产出 ModuleLoader 包装的 `lib/client.js`）与 `cordis.patch.yml` 的行结构；后续所有客户端任务依赖它

- [ ] **Step 1: 写 `tsdown.config.ts`**

```ts
import { defineConfig } from 'tsdown'

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

/** Client half: CJS bundle wrapped for the browser ModuleLoader (see the wrapper plugin below). */
const client = {
  entry: ['src/client/index.tsx'],
  format: ['cjs'],
  platform: 'browser',
  target: 'es2022',
  dts: { emitDtsOnly: false },
  outDir: 'lib',
  external: [/^@deepseek-ai\//, 'react', 'react-dom', 'react/jsx-runtime'],
  outputOptions: { entryFileNames: 'client.body.js' },
}

export default defineConfig([host, client])
```

- [ ] **Step 2: 写 ModuleLoader 包装脚本 `scripts/wrap-client.mjs`**

```js
// Wraps the CJS client body into the browser ModuleLoader contract:
//   window.__ModuleLoader__.load({ id, factory: (require) => exports })
import { readFileSync, writeFileSync, rmSync } from 'node:fs'

const id = 'dsh-auto-review-plus'
const body = readFileSync('lib/client.body.js', 'utf8')
const wrapped = `window.__ModuleLoader__.load({
	id: ${JSON.stringify(id)},
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
${body}
		return module.exports;
	},
});
`
writeFileSync('lib/client.js', wrapped)
rmSync('lib/client.body.js')
```

并把 `package.json` 的 `build` 脚本改为：

```json
"build": "tsdown && node scripts/wrap-client.mjs"
```

- [ ] **Step 3: 写 spike 版客户端半 `src/client/index.tsx`**

```tsx
import type { Context } from '@deepseek-ai/cordis'

export const inject = ['slots']

export function apply(ctx: Context): void {
  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'auto-review-plus-spike',
    order: 10,
  }, () => 'dsh-auto-review-plus client half loaded'))
}
```

- [ ] **Step 4: 写 spike 版宿主半 `src/index.ts`**

```ts
import type { Context } from '@deepseek-ai/cordis'

export function apply(_ctx: Context): void {
  // Task 1 only proves the client bundle loads; the real host half arrives in Tasks 2–5.
}
```

- [ ] **Step 5: 写 `cordis.patch.yml`（本任务只插入自己的行）**

```yaml
# Task 5 adds the `- id: auto-review` / `disabled: true` override when this
# plugin actually takes over the `auto` preset; until then the official layer
# stays active so the user's working Auto review is not broken mid-development.
- insert:
    - id: auto-review-plus
      name: 'dsh-auto-review-plus'
```

- [ ] **Step 6: 构建、打包并用 tarball 安装**

```bash
npm run build
npm pack
npx -y @deepseek-ai/dsh plugin --profile web add ./dsh-auto-review-plus-0.1.0.tgz
npx -y @deepseek-ai/dsh plugin --profile web list
```

Expected: `lib/index.js` 与 `lib/client.js` 生成；`dsh plugin list` 显示 `dsh-auto-review-plus` 已启用（注意：`dsh plugin --profile web root` 不是清单命令——`plugin` 把参数原样转发给 pnpm，`root` 等价于 `pnpm root`，只打印 node_modules 路径）；profile 的 `dsh.profile.bundles` 末尾出现它。**不要移除也不要停用官方 auto-review**——`auto` preset 的接管发生在 Task 5。

必须用 tarball 而不是 `add .`：目录安装会产生 `link:` 依赖，把本仓库的 `node_modules`（含 react/tsdown/vitest 与 `@deepseek-ai/*` 的开发副本）暴露进 profile 的解析链，遮蔽运行安装自带的同名包。

- [ ] **Step 7: 把构建与产物漂移校验补进 `ci.yml`**

在 `npm test` 之后追加（这是计划全局约束「CI 必须校验产物与源码一致」的落点；Task 0 按裁定未包含这两步）：

```yaml
      - run: npm run build
      - name: Verify committed artifacts match a fresh build
        run: |
          git diff --exit-code -- lib/index.js lib/client.js \
            || { echo "::error::lib/ is stale — run 'npm run build' and commit the result"; exit 1; }
```

- [ ] **Step 8: 在 GUI 中验证**

重启 `npx -y @deepseek-ai/dsh web`，打开 设置 → 通用：应看到一行文字 `dsh-auto-review-plus client half loaded`。

可编程的旁证（在重启后执行）：`http://127.0.0.1:3080/plugins/` 下应能取到本包的客户端 bundle（具体路径按 `packages/client/modules/src/index.ts` 的路由拼装规则确定）。

- **若成功**：记录构建方式（tsdown + 包装脚本），继续 Task 2。
- **若失败**（`/plugins` 无该模块、浏览器报错、或 `lib/client.js` 契约不匹配）：改用退路——用 esbuild 直接产出 CJS 再走同一包装脚本；仍失败则**停止本计划并回报**，方案退回 spec §7.2 的另两个选项（fork 官方客户端包 / v1 先不做 UI）。

- [ ] **Step 9: 提交**

先把 `*.tgz` 加入 `.gitignore`（`npm pack` 的产物不入库），再提交：

```bash
git add -A
git commit -m "Add dual-face build spike for the client ModuleLoader contract"
```

---

### Task 2: 审查请求修复（`sessionId` 与 `reasoningEffort`）

**Files:**
- Create: `src/review.ts`
- Test: `tests/review.spec.ts`

**Interfaces:**
- Consumes: Task 1 的构建；`@deepseek-ai/dsh-llm` 的 `GenerateOptions`、`StreamChunk`、`BlockAssembler`
- Produces: `buildReviewRequest(input): GenerateOptions`、`readReviewDecision(stream): Promise<AutoReviewDecision>`；Task 3、5 依赖这两个函数

- [ ] **Step 1: 写失败测试 `tests/review.spec.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { buildReviewRequest } from '../src/review.ts'

const base = {
  provider: 'opencode-go',
  model: 'deepseek-v4.1-flash',
  sessionId: 'session-1',
  reasoningEffort: 'high',
  system: 'REVIEW_POLICY',
  userText: 'PENDING ACTION',
  signal: new AbortController().signal,
}

describe('buildReviewRequest', () => {
  it('carries the session id so providers can route the review request', () => {
    expect(buildReviewRequest(base).sessionId).toBe('session-1')
  })

  it('carries the session reasoning effort verbatim', () => {
    expect(buildReviewRequest(base).reasoningEffort).toBe('high')
  })

  it('omits reasoningEffort when neither the session nor the fallback names one', () => {
    const { reasoningEffort: _drop, ...rest } = base
    expect(buildReviewRequest(rest).reasoningEffort).toBeUndefined()
  })

  it('pins temperature to zero and keeps one user message', () => {
    const request = buildReviewRequest(base)
    expect(request.temperature).toBe(0)
    expect(request.messages).toHaveLength(1)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/review.spec.ts`
Expected: FAIL — `buildReviewRequest` 未定义。

- [ ] **Step 3: 写最小实现 `src/review.ts`**

```ts
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { BlockAssembler } from '@deepseek-ai/dsh-llm'
import { deepFreeze } from '@deepseek-ai/dsh-util-values'

export type AutoReviewRisk = 'low' | 'medium' | 'high'
export type AutoReviewDecision =
  | { readonly risk: 'low' | 'medium'; readonly decision: 'allow' }
  | { readonly risk: 'medium' | 'high'; readonly decision: 'deny'; readonly reason?: string }

export interface ReviewRequestInput {
  readonly provider: string
  readonly model: string
  readonly sessionId: string
  /** Explicit level from the session header, else the configured fallback, else undefined. */
  readonly reasoningEffort?: string
  readonly system: string
  readonly userText: string
  readonly signal: AbortSignal
}

/** Build the frozen review request: session context plus the fixed policy. */
export function buildReviewRequest(input: ReviewRequestInput): GenerateOptions {
  return deepFreeze({
    provider: input.provider,
    model: input.model,
    system: input.system,
    messages: [{ role: 'user', content: [{ type: 'text', text: input.userText }] }],
    temperature: 0,
    sessionId: input.sessionId,
    ...input.reasoningEffort === undefined ? {} : { reasoningEffort: input.reasoningEffort },
    signal: input.signal,
  }) as GenerateOptions
}

/** Consume zero or more reasoning blocks, one JSON text block, and one terminal stop. */
export async function readReviewDecision(stream: AsyncIterable<StreamChunk>): Promise<AutoReviewDecision> {
  const assembler = new BlockAssembler()
  let finished = false
  for await (const chunk of stream) {
    if (finished) throw new Error('auto-review-plus: reviewer emitted data after its terminal finish')
    assembler.push(chunk)
    if (chunk.type === 'finish') {
      finished = true
      if (chunk.reason.kind === 'error' || chunk.reason.kind === 'aborted') {
        const { code, message } = chunk.reason.failure
        throw new Error(`auto-review-plus: reviewer ended with ${chunk.reason.kind} ${code}: ${message}`)
      }
      if (chunk.reason.kind !== 'stop') {
        throw new Error(`auto-review-plus: reviewer ended with ${chunk.reason.kind}`)
      }
    }
  }
  if (!finished) throw new Error('auto-review-plus: reviewer emitted no terminal finish')
  const blocks = assembler.blocks()
  const final = blocks.at(-1)
  if (final?.type !== 'text' || blocks.slice(0, -1).some(block => block.type !== 'reasoning')) {
    throw new Error('auto-review-plus: reviewer must emit zero or more reasoning blocks followed by exactly one text block')
  }
  return parseDecision(final.text)
}

/** Parse the single strict-JSON decision object. */
export function parseDecision(text: string): AutoReviewDecision {
  const parsed: unknown = JSON.parse(text)
  if (typeof parsed !== 'object' || parsed === null) throw new Error('auto-review-plus: reviewer returned a non-object decision')
  const record = parsed as Record<string, unknown>
  const risk = record['risk']
  const decision = record['decision']
  if (risk === 'low' && decision === 'allow') return { risk: 'low', decision: 'allow' }
  if (risk === 'medium' && decision === 'allow') return { risk: 'medium', decision: 'allow' }
  if ((risk === 'medium' || risk === 'high') && decision === 'deny') {
    return Object.hasOwn(record, 'reason') && typeof record['reason'] === 'string'
      ? { risk, decision: 'deny', reason: record['reason'] }
      : { risk, decision: 'deny' }
  }
  throw new Error(`auto-review-plus: invalid reviewer decision ${JSON.stringify(parsed)}`)
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- tests/review.spec.ts`
Expected: PASS（4 个用例）。

- [ ] **Step 5: 提交**

```bash
git add src/review.ts tests/review.spec.ts
git commit -m "Carry session id and reasoning effort into the review request"
```

---

### Task 3: 健壮性（回退级别与可诊断失败）

**Files:**
- Modify: `src/review.ts`
- Test: `tests/review.spec.ts`（追加用例）

**Interfaces:**
- Consumes: Task 2 的 `buildReviewRequest`、`ReviewRequestInput`
- Produces: `resolveReviewReasoning(input): Promise<string | undefined>`（在模型支持时返回要发送的级别）；Task 5 在构造请求前调用它

- [ ] **Step 1: 追加失败测试**

```ts
import { describe, expect, it, vi } from 'vitest'
import { resolveReviewReasoning } from '../src/review.ts'

const llm = (efforts: readonly string[]) => ({
  resolveModelInfo: vi.fn(async () => ({ reasoning: { efforts: efforts.map(id => ({ id, name: id })) } })),
})

describe('resolveReviewReasoning', () => {
  it('prefers the session level and never consults capabilities for it', async () => {
    const client = llm([])
    await expect(resolveReviewReasoning({
      llm: client as never, provider: 'p', model: 'm', sessionEffort: 'high', fallbackEffort: 'low',
    })).resolves.toBe('high')
  })

  it('applies the fallback when the session names none and the model supports it', async () => {
    await expect(resolveReviewReasoning({
      llm: llm(['off', 'low', 'high']) as never, provider: 'p', model: 'm', fallbackEffort: 'low',
    })).resolves.toBe('low')
  })

  it('omits the level when the model does not support the fallback', async () => {
    await expect(resolveReviewReasoning({
      llm: llm(['off', 'high']) as never, provider: 'p', model: 'm', fallbackEffort: 'low',
    })).resolves.toBeUndefined()
  })

  it('omits the level when no fallback is configured', async () => {
    await expect(resolveReviewReasoning({
      llm: llm(['low']) as never, provider: 'p', model: 'm',
    })).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- tests/review.spec.ts`
Expected: FAIL — `resolveReviewReasoning` 未定义。

- [ ] **Step 3: 实现**

```ts
/** The slice of the llm service this module needs. */
export interface ReasoningCapabilities {
  resolveModelInfo(provider: string, model: string): Promise<{ reasoning?: { efforts?: readonly { id: string }[] } }>
}

export interface ResolveReviewReasoningInput {
  readonly llm: ReasoningCapabilities
  readonly provider: string
  readonly model: string
  readonly sessionEffort?: string
  readonly fallbackEffort?: string
}

/**
 * The reasoning level the review request should send: the session's own level
 * verbatim, else the configured fallback when this exact model offers it.
 * Never invents a level a model cannot take (`resolveReasoningLevel` would throw).
 */
export async function resolveReviewReasoning(input: ResolveReviewReasoningInput): Promise<string | undefined> {
  if (input.sessionEffort !== undefined) return input.sessionEffort
  if (input.fallbackEffort === undefined) return undefined
  const info = await input.llm.resolveModelInfo(input.provider, input.model)
  const offered = info.reasoning?.efforts?.some(effort => effort.id === input.fallbackEffort) === true
  return offered ? input.fallbackEffort : undefined
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test -- tests/review.spec.ts`
Expected: PASS（8 个用例）。

- [ ] **Step 5: 提交**

```bash
git add src/review.ts tests/review.spec.ts
git commit -m "Add capability-checked fallback reasoning for the reviewer"
```

---

### Task 4: 会话级审查路由（事件 + projection + 读写）

> ⚠️ **本节已被取代（2026-10-04）**：状态机制由「会话事件 + 投影」改为 **storage domain**。权威描述见 spec §5.3；实现简报见 `.sdd/dsh-auto-review-plus/task-4-redo-brief.md`。下面的旧代码块与测试**仅作历史记录，不得据以实现**——理由：第三方自定义事件类型不在构建期生成的 `KNOWN_SESSION_EVENT_TYPES` 内，且 `Session.append` 无法标记 `ignorable`，持久化读路径 fail-closed 抛 `SessionFormatUnsupportedError`，会让受影响会话**永久无法 resume**。

**Files:**
- Create: `src/reviewer-route.ts`
- Modify: `package.json`（`dependencies` 增加 `"zod": "4.6.5"`）
- Test: `tests/reviewer-route.spec.ts`

**Interfaces:**
- Consumes: `@deepseek-ai/dsh-session` 的 `Session`、`@deepseek-ai/dsh-session-projection` 的 `ProjectionDefinition`
- Produces: `ReviewerRoute`、`autoReviewPlusRouteProjectionDefinition`、`reviewerRoute(projections, session): ReviewerRoute | undefined`、`setReviewerRoute(session, route | null): void`；Task 5、7 依赖它们

- [ ] **Step 1: 写失败测试 `tests/reviewer-route.spec.ts`**

```ts
import { describe, expect, it, vi } from 'vitest'
import { autoReviewPlusRouteProjectionDefinition, reviewerRoute, setReviewerRoute } from '../src/reviewer-route.ts'

const { apply, init, key, stateVersion } = autoReviewPlusRouteProjectionDefinition

const routeEvent = (route: { provider: string; model: string } | null) => ({
  type: 'auto-review-plus/reviewer-route', data: { route },
}) as never

describe('reviewer route projection', () => {
  it('starts following the session route', () => {
    expect(init()).toBeNull()
    expect(key).toBe('autoReviewPlusRoute')
    expect(stateVersion).toBe(1)
  })

  it('lets the last selection win', () => {
    const pinned = apply(apply(init(), routeEvent({ provider: 'zai', model: 'glm-5.3-flash' })), routeEvent(null))
    expect(pinned).toBeNull()
  })

  it('ignores unrelated events', () => {
    expect(apply(null, { type: 'other/event', data: {} } as never)).toBeNull()
  })
})

describe('reviewer route helpers', () => {
  it('reads a detached copy of the pinned route', () => {
    const pinned = { provider: 'zai', model: 'glm-5.3-flash' }
    const projections = { stateOf: vi.fn(() => pinned) }
    const read = reviewerRoute(projections as never, {} as never)
    expect(read).toEqual(pinned)
    expect(read).not.toBe(pinned)
  })

  it('reports no pin when the state is null', () => {
    expect(reviewerRoute({ stateOf: () => null } as never, {} as never)).toBeUndefined()
  })

  it('appends the chosen route and the explicit reset', () => {
    const append = vi.fn()
    setReviewerRoute({ append } as never, { provider: 'zai', model: 'glm-5.3-flash' })
    setReviewerRoute({ append } as never, null)
    expect(append.mock.calls).toEqual([
      ['auto-review-plus/reviewer-route', { route: { provider: 'zai', model: 'glm-5.3-flash' } }],
      ['auto-review-plus/reviewer-route', { route: null }],
    ])
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- tests/reviewer-route.spec.ts`
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 实现 `src/reviewer-route.ts`**

```ts
/** Durable per-session reviewer route for Auto review. */
import { z as zod } from 'zod'
import type { Session } from '@deepseek-ai/dsh-session'
import type SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'

/** The exact route the reviewer uses instead of the session's own route. */
export interface ReviewerRoute {
  readonly provider: string
  readonly model: string
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /**
     * Records the Auto review reviewer route chosen for this session. `null`
     * means "follow the session's own route" (an explicit reset). Log-only:
     * it carries no `surfaceOp` and never enters model history.
     */
    'auto-review-plus/reviewer-route': { route: ReviewerRoute | null }
  }
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    /** Pinned reviewer route, or null when the review follows the session route. */
    autoReviewPlusRoute: ReviewerRoute | null
  }
}

const reviewerRouteSchema: zod.ZodType<ReviewerRoute | null> = zod.object({
  provider: zod.string().min(1),
  model: zod.string().min(1),
}).strict().nullable()

/** Host-only projection of the durable reviewer route. */
export const autoReviewPlusRouteProjectionDefinition = {
  key: 'autoReviewPlusRoute',
  stateVersion: 1,
  stateSchema: reviewerRouteSchema,
  init: () => null,
  apply: (state, event) => event.type === 'auto-review-plus/reviewer-route' ? event.data.route : state,
} satisfies ProjectionDefinition<'autoReviewPlusRoute', ReviewerRoute | null>

/**
 * Read the pinned reviewer route.
 * @param projections - registry that owns the route projection.
 * @param session - session whose durable decision is read.
 * @returns a detached route, or undefined to follow the session's own route.
 */
export function reviewerRoute(
  projections: Pick<SessionProjectionRegistry, 'stateOf'>,
  session: Session,
): ReviewerRoute | undefined {
  const route = projections.stateOf(session, 'autoReviewPlusRoute')
  return route === null || route === undefined ? undefined : { ...route }
}

/**
 * Record the chosen reviewer route, or the explicit reset to the session route.
 * @param session - session receiving the decision.
 * @param route - the pinned route, or null to follow the session route.
 */
export function setReviewerRoute(session: Session, route: ReviewerRoute | null): void {
  session.append('auto-review-plus/reviewer-route', {
    route: route === null ? null : { provider: route.provider, model: route.model },
  })
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test -- tests/reviewer-route.spec.ts`
Expected: PASS（6 个用例）。

- [ ] **Step 5: 提交**

```bash
git add package.json src/reviewer-route.ts tests/reviewer-route.spec.ts
git commit -m "Add session-scoped reviewer route state"
```

---

### Task 5: 宿主半接线（preset 接管、审查监听器、卸载迁移）

**Files:**
- Create: `src/index.ts`（以官方宿主半为蓝本 + 差异点）
- Modify: `src/review.ts`（导出供本任务使用的 `ReviewRequestInput`）
- Test: 手工端到端验证（见 Step 5–6）

**Interfaces:**
- Consumes: Task 2/3 的 `buildReviewRequest`、`readReviewDecision`、`resolveReviewReasoning`；Task 4 的 `reviewerRoute`、`autoReviewPlusRouteProjectionDefinition`
- Produces: 一个可加载的宿主半：注册 `auto` preset、拦截每次工具调用、卸载时迁移存活 Auto 会话

**移植约定**：官方宿主半是单文件 `packages/experimental/auto-review/src/index.ts`（约 740 行，纯 TS，无同包兄弟模块）。**逐字复制该文件**到 `src/index.ts`，然后只应用下面列出的差异点；未列出的代码不得改动。

- [ ] **Step 1: 复制官方宿主半**

```bash
cp "E:/03.Github/deepseek-harness/packages/experimental/auto-review/src/index.ts" src/index.ts
```

同时把官方 `locale/en.json`、`locale/zh.json` 复制到本包 `locale/`（Task 7 会追加新键）。

- [ ] **Step 2: 应用差异点 A —— 用我们的请求构造替换官方 `classifyRisk` 内部实现**

把复制进来的 `classifyRisk` 中构造 `GenerateOptions` 的那段（官方文件里 `const options: GenerateOptions = deepFreeze({...})` 至 `return readDecision(ctx.llm.stream(options))`）替换为：

```ts
  const route = reviewerRoute(reviewerRouteTable, String(agent.session.id)) ?? {
    provider: snapshot.provider, model: snapshot.model,
  }
  const reasoningEffort = await resolveReviewReasoning({
    llm: ctx.llm,
    provider: route.provider,
    model: route.model,
    ...snapshot.reasoningEffort === undefined ? {} : { sessionEffort: snapshot.reasoningEffort },
    ...fallbackReasoningEffort === undefined ? {} : { fallbackEffort: fallbackReasoningEffort },
  })
  const request = buildReviewRequest({
    provider: route.provider,
    model: route.model,
    sessionId: String(agent.session.id),
    ...reasoningEffort === undefined ? {} : { reasoningEffort },
    system: REVIEW_POLICY,
    userText: reviewUserText(snapshot),
    signal,
  })
  return readReviewDecision(ctx.llm.stream(request))
```

并在 `snapshotAutoReview` 的返回对象里补一个字段 `reasoningEffort: header.config.reasoningEffort`（其类型来自 Task 2 的 `ReviewRequestInput` 语义）。

- [ ] **Step 3: 应用差异点 B —— 配置项、失败诊断与冲突诊断**

1. 插件 Config 增加可选字段 `fallbackReasoningEffort?: string`，并在 `apply` 顶部解析为局部常量 `fallbackReasoningEffort`。
2. 失败信息追加路由上下文：官方 `failed()` 里的消息改为
   `` `Auto review of tool "${exec.name}" failed; its body was not executed: ${message} (route: ${route.provider}/${route.model})` ``（`route` 由该次调用解析所得，随结果一起传递）。
3. `registerAuto` 调用包一层 try/catch：

```ts
    let stopContribution: () => Promise<void>
    try {
      stopContribution = permissionPresets.registerAuto(() => {
        if (!accepting) throw new Error('auto-review-plus: integration is closing')
      })
    } catch (error) {
      ctx.logger.error(
        'auto-review-plus: cannot take over the "auto" preset — the official '
        + '@deepseek-ai/dsh-experimental-auto-review layer is still active. '
        + 'Disable its row (disabled: true) or remove it from the profile bundles.',
        error,
      )
      return
    }
```

4. 其余（前置监听器的 prepend 语义、deny → `ask()`、allow → Full access、卸载时把存活 Auto 会话迁移到 Full access 并结清在途审查）**保持官方实现原样**。

- [ ] **Step 4: 构建并安装**

```bash
npm run build
npm run typecheck
npm pack
npx -y @deepseek-ai/dsh plugin --profile web add ./dsh-auto-review-plus-0.1.0.tgz
npx -y @deepseek-ai/dsh plugin --profile web list
```

Expected: 构建通过；`dsh plugin list` 显示 `dsh-auto-review-plus` 已安装且启用（不要用 `root`，它是 `pnpm root` 的转发）；本包 `cordis.patch.yml` 对官方 `auto-review` 行写入 `disabled: true`。

- [ ] **Step 5: 端到端验证（spec 清单 7/8/9）**

重启 `npx -y @deepseek-ai/dsh web`，在会话里切到 Auto review，然后：

1. 在 `opencode-go/deepseek-v4.1-flash` 下执行一次只读工具调用 → 通过，无 `MissingSessionID`；
2. 切到 `zai/glm-5.3-flash`（始终思考模型）再执行一次 → 通过，无 1210；
3. 删除一个**本会话之前就存在**的文件 → 弹审批（中风险语义未被破坏）；
4. 若某次审查失败，模型侧消息必须形如 `Auto review of tool "X" failed; its body was not executed: ... (route: provider/model)`。

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "Take over the auto preset with session-aware review requests"
```

---

### Task 6: 客户端半 —— 遮蔽权限槽（移植官方控件）

**Files:**
- Modify: `src/client/index.tsx`（替换 Task 1 的 spike）
- Create: `src/client/PermissionControl.tsx`（官方 `PermissionSelect.tsx` 的移植版）

**Interfaces:**
- Consumes: 官方客户端半的 slots/hooks 用法；Task 5 已注册的 `auto` preset
- Produces: 一个以 `priority: -1` 注册到 `conversation.input.permission` 的控件；Task 7 在其 Auto 分支上扩展模型选择器

**移植约定**：逐字复制官方文件，按下述差异改动，不得重写上游逻辑。

- [ ] **Step 1: 复制官方客户端文件**

```bash
mkdir -p src/client
cp "E:/03.Github/deepseek-harness/packages/client/ui-permission-presets/src/client/PermissionSelect.tsx" src/client/PermissionControl.tsx
cp "E:/03.Github/deepseek-harness/packages/client/ui-permission-presets/src/client/presentation.ts" src/client/presentation.ts
```

若 `PermissionSelect.tsx` 还 import 了同包其他相对模块（如 CSS module、`locales.ts`），一并复制，保持相对路径不变。

- [ ] **Step 2: 改写 `src/client/index.tsx` 的注册（遮蔽官方槽）**

```tsx
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { PermissionControl, type PermissionControlInjected } from './PermissionControl.tsx'

export const inject = ['slots', 'sessions', 'locale']

export function apply(ctx: Context): void {
  ctx.slots.inject('conversation.input.permission', () => ctx.slots.register({
    name: 'conversation.input.permission',
    priority: -1,
    locale: 'permissionAccess',
    inject: (sessionId: SessionId): PermissionControlInjected => ({
      hooks: { permissionCatalog: ctx.permissionPresets.catalog.store },
      select: preset => ctx.permissionPresets.set(sessionId, preset),
    }),
  }, PermissionControl))
}
```

（`inject` 的字段名与 hook 名必须与官方 `src/client/index.ts` 中同一段的写法一致——实现时对照官方文件逐字校对该映射，不要凭猜测改动。）

- [ ] **Step 3: 构建并验证控件接管**

```bash
npm run build
npx -y @deepseek-ai/dsh plugin --profile web add .
```

重启 GUI，验证 spec 清单第 2 项：

1. 输入框旁的权限 chip 存在且可展开；
2. `Read only`、`Workspace write`、`Full access` 三个模式可切换并生效；
3. 选 `Full access` 仍出现风险确认弹框；
4. 会话忙碌／锁定时 chip 为禁用态（与官方一致）。

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "Shadow the permission slot with a ported permission control"
```

---

### Task 7: 客户端半 —— 审查模型选择器、自动弹框与文案

**Files:**
- Modify: `src/client/PermissionControl.tsx`
- Create: `src/client/ReviewerRoutePicker.tsx`
- Modify: `src/index.ts`（新增 Remote API）
- Modify: `locale/en.json`、`locale/zh.json`
- Test: 手工端到端验证（spec 清单 3–6）

**Interfaces:**
- Consumes: `@Remote` 方法 `providers()`、`models(provider)`、`modelInfo(provider, model)`、`reviewerRoute(sessionId)`、`setReviewerRoute(sessionId, route)`
- Produces: 弹框中的审查模型选择器与"进入 Auto 自动弹框一次"的行为

- [ ] **Step 1: 宿主侧新增 Remote API**

在官方宿主半的 API 里追加（保留官方原有公开方法）：

```ts
  @Remote
  async reviewerRouteView(sessionId: string): Promise<{
    route: ReviewerRoute | null
    sessionRoute: { provider: string; model: string }
  }> {
    const session = this.ctx.sessions.get(sessionId as never)
    if (session === undefined) throw new Error(`auto-review-plus: unknown session ${sessionId}`)
    const header = session.requestHeader()
    if (header === undefined) throw new Error('auto-review-plus: the session has no request header yet')
    return {
      route: reviewerRoute(this.reviewerRouteTable, String(sessionId)) ?? null,
      sessionRoute: { provider: header.config.provider, model: header.config.model },
    }
  }

  @Remote
  providers(): ReturnType<Context['llm']['listProviders']> {
    return this.ctx.llm.listProviders()
  }

  @Remote
  models(provider: string): Promise<{ id: string; name: string }[]> {
    return this.ctx.llm.listModels(provider).then(models => models.map(m => ({ id: m.id, name: m.name })))
  }

  @Remote
  async modelInfo(provider: string, model: string): Promise<{ reasoningEfforts: string[] }> {
    const info = await this.ctx.llm.resolveModelInfo(provider, model)
    return { reasoningEfforts: (info.reasoning?.efforts ?? []).map(effort => effort.id) }
  }

  @Remote
  setReviewerRoute(sessionId: string, route: ReviewerRoute | null): void {
    const session = this.ctx.sessions.get(sessionId as never)
    if (session === undefined) throw new Error(`auto-review-plus: unknown session ${sessionId}`)
    if (route !== null) this.assertKnownRoute(route)
    await setReviewerRoute(this.reviewerRouteTable, String(sessionId), route)
  }
```

并实现 `assertKnownRoute(route)`：`listProviders()` 必须包含 `route.provider`，`await listModels(route.provider)` 必须包含 `route.model`，否则抛 `auto-review-plus: unknown reviewer route "provider/model"`。写失败测试 `tests/route-validation.spec.ts` 覆盖"未知 provider / 未知 model 被拒、已知路由通过"三种情况后再接线。

- [ ] **Step 2: 新增选择器组件 `src/client/ReviewerRoutePicker.tsx`**

```tsx
import type { ReactNode } from 'react'

export interface ReviewerRouteValue {
  readonly provider: string
  readonly model: string
}

export interface ReviewerRoutePickerProps {
  /** Currently pinned route, or null when the review follows the session route. */
  readonly value: ReviewerRouteValue | null
  readonly sessionRoute: ReviewerRouteValue
  readonly providers: readonly { id: string; name: string }[]
  readonly models: readonly { id: string; name: string }[]
  readonly reasoningEfforts: readonly string[]
  readonly t: (key: string) => string
  readonly onChange: (route: ReviewerRouteValue | null) => void
}

/** Two-level provider/model chooser with an explicit "follow the session model" default. */
export function ReviewerRoutePicker(props: ReviewerRoutePickerProps): ReactNode {
  // Renders: a first option "follow the session model" (checked when value === null),
  // a provider select, a model select, and the selected model's reasoning efforts as text.
  // Selecting the first option calls onChange(null); choosing a model calls onChange({provider, model}).
}
```

实现要求：默认选中"跟随当前会话模型"；切换 provider 时重置 model 选择；`value !== null` 时回显钉住的路由；能力文案显示 `reasoningEfforts`（空数组时显示"该模型不暴露思考级别"）。

- [ ] **Step 3: 把选择器接进 Auto 确认弹框**

在 `PermissionControl.tsx` 里，当 `confirmation === AUTO_REVIEW_PRESET` 时，在官方 `RiskConfirmation` 的 `description` 内容之后渲染 `<ReviewerRoutePicker ... />`（`RiskConfirmation` 本身没有 children，因此选择器渲染在它上方的弹框容器内，或改为用同一 `ui-primitives` 的对话框原语包一层——两种做法都必须保持官方确认文案与"确认后提交 preset"的行为不变）。

- [ ] **Step 4: 实现"进入 Auto 自动弹框一次"（spec §6.3）**

在 `PermissionControl.tsx` 中：

1. 订阅本会话的权限选择状态；当其变为 `auto` 时调用 `reviewerRouteView(sessionId)`；
2. 满足全部条件才自动打开弹框：`route === null` 且本会话未关闭过 且 弹框当前未打开；
3. "跟随当前会话模型"确认 → `setReviewerRoute(sessionId, null)`；选定模型 → `setReviewerRoute(sessionId, route)`；
4. 关闭（不选择）→ 仅在组件内存（per-session Map）标记已关闭，不写任何事件。

- [ ] **Step 5: 追加文案**

`locale/zh.json` 追加（`locale/en.json` 提供对应英文）：

```json
{
  "reviewerRoute": {
    "title": "审查模型",
    "followSession": "跟随当前会话模型",
    "provider": "服务商",
    "model": "模型",
    "noReasoning": "该模型不暴露思考级别",
    "unknownRoute": "该路由不可用"
  },
  "auto.confirm.reviewerHint": "可指定用哪个模型做审查；本会话内固定生效，重开此弹框可改回跟随会话模型。"
}
```

- [ ] **Step 6: 端到端验证（spec 清单 3–6）**

1. 选 Auto → 弹框出现，默认"跟随当前会话模型"；
2. 选一个不同于会话的审查模型（例：会话用 `opencode-go/deepseek-v4.1-flash`，审查选 `zai/glm-5.3-flash`）→ 触发一次工具调用，确认审查用的是所选模型（会话日志里审查请求失败信息或 provider 侧用量可见）；
3. **切换会话模型**（例：切到 `ew-glm-52/deepseek-v4.1-flash`）→ 再触发工具调用，审查仍用钉住的模型（关键断言）；
4. 重开弹框选"跟随当前会话模型" → 恢复跟随；
5. 重启 `dsh web` → 会话恢复后钉住的路由仍在。

- [ ] **Step 7: 提交**

```bash
git add -A
git commit -m "Add per-session reviewer model picker to the Auto confirmation"
```

---

### Task 8: 发布流水线与文档

**Files:**
- Create: `.github/workflows/publish.yml`
- Create: `README.md`、`README.zh.md`
- Modify: `docs/superpowers/specs/2026-10-02-dsh-auto-review-plus-design.md`（仅在实现偏离设计时同步）

- [ ] **Step 1: 写 `.github/workflows/publish.yml`**

```yaml
name: publish

on:
  push:
    tags: ['v*']

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write          # npm provenance / Trusted Publishing
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          registry-url: https://registry.npmjs.org
      - run: npm install --no-audit --no-fund
      - run: npm run typecheck
      - run: npm run build
      - name: Verify committed artifacts match a fresh build
        run: |
          git diff --exit-code -- lib/index.js lib/client.js \
            || { echo "::error::lib/ is stale — run 'npm run build' and commit the result"; exit 1; }
      - run: npm test
      - name: Verify the tag matches package.json
        run: |
          tag="${GITHUB_REF_NAME#v}"
          pkg="$(node -p "require('./package.json').version")"
          [ "$tag" = "$pkg" ] || { echo "::error::tag v$tag does not match package version $pkg"; exit 1; }
      - name: Publish to npm
        run: npm publish --provenance --access public --registry=https://registry.npmjs.org
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}   # 用 Trusted Publishing 时可删除本行与 secret
```

- [ ] **Step 2: 写 README（中文为主，`README.md` 为英文同构版本）**

必含章节：

1. **这是什么**：为 dsh 的 Auto review 补上会话上下文（`sessionId`、`reasoningEffort`）并支持按会话选择审查模型；
2. **为什么存在**：链接上游讨论 #8670、#8764，并说明"上游修复后应弃用本包"；
3. **安装**（三种方式，明确 registry 必须指 npmjs）：

```bash
# npm（推荐）
npx -y @deepseek-ai/dsh plugin --profile web add dsh-auto-review-plus@latest --registry=https://registry.npmjs.org
# GitHub
npx -y @deepseek-ai/dsh plugin --profile web add github:DMIAOCHEN/dsh-auto-review-plus
# 本地构建产物
npm run build && npx -y @deepseek-ai/dsh plugin --profile web add .
```

4. **必须停用官方 auto-review**（本包 patch 已含 `disabled: true`，但需确认官方行排在本包之前；若从 GUI 重新启用官方包会与 `auto` preset 冲突并让本包起不来——附带排查方法：看启动日志里的 `cannot take over the "auto" preset`）；
5. **使用**：切到 Auto review → 弹框里可选审查模型；重开弹框选"跟随当前会话模型"即重置；作用域仅当前会话；
6. **升级 dsh**：改 peers → `npm run build` → 提交 → 打 tag → 流水线自动发布；
7. **卸载**：`npx dsh plugin --profile web remove dsh-auto-review-plus`，并说明卸载时存活 Auto 会话会被迁到 Full access；
8. **许可与出处**：MIT + NOTICE。

- [ ] **Step 3: 配置 npm 凭据（人工前置，二选一）**

- **Trusted Publishing**：在 npm 上为该包配置发布者 = GitHub 仓库 `DMIAOCHEN/dsh-auto-review-plus` + 工作流 `publish.yml`；工作流无需 secret。
- **长期令牌**：在仓库 Secrets 添加 `NPM_TOKEN`（Granular Access Token，仅本包写权限）。

- [ ] **Step 4: 发布首个版本**

```bash
git add -A
git commit -m "Add npm release workflow and documentation"
git tag v0.1.0
git push origin main --tags
```

Expected: `publish` 工作流成功，npm 上出现 `dsh-auto-review-plus@0.1.0`（带 provenance）。

- [ ] **Step 5: 端到端最终回归**

按 spec §8 清单 1–10 全量过一遍，特别是第 10 项（卸载迁移）。

---

## Self-Review

**1. Spec coverage**

| Spec 章节 | 覆盖任务 |
|---|---|
| §5.1 两处修复 | Task 2 |
| §5.2 健壮性（回退/诊断/启动诊断） | Task 3、Task 5 Step 3 |
| §5.3 会话级审查路由 | Task 4 |
| §5.4 Remote 接口 | Task 7 Step 1 |
| §5.5 生命周期与卸载迁移 | Task 5 Step 3（保持官方实现） |
| §6.1 遮蔽权限槽 | Task 6 |
| §6.2 含模型选择器的确认弹框 | Task 7 Step 2–3 |
| §6.3 进入 Auto 自动弹框一次 | Task 7 Step 4 |
| §6.4 文案与 i18n | Task 5 Step 1、Task 7 Step 5 |
| §7.1／7.2 构建与产物 | Task 0 Step 5、Task 1、Task 8 Step 1 |
| §7.3 发布流水线 | Task 8 Step 1、3、4 |
| §9 风险（产物漂移、凭据） | Task 0 Step 5、Task 8 Step 1 |
| §10 许可与署名 | Task 0 Step 4 |
| §8 验证清单 1–10 | Task 5 Step 5、Task 6 Step 3、Task 7 Step 6、Task 8 Step 5 |

**2. Placeholder scan**：无 TODO／TBD；每个代码步骤都给出可粘贴内容；客户端两处"对照官方文件逐字校对"的指令均指向确切的官方路径，且同时给出了我们这一侧的完整代码骨架。

**3. Type consistency**

- `buildReviewRequest`（Task 2）的 `ReviewRequestInput` 字段在 Task 5 调用处一一对应（`provider`/`model`/`sessionId`/`reasoningEffort`/`system`/`userText`/`signal`）。
- `resolveReviewReasoning`（Task 3）的参数名在 Task 5 中一致（`llm`/`provider`/`model`/`sessionEffort`/`fallbackEffort`）。
- `reviewerRoute` / `setReviewerRoute`（Task 4 重做版）在 Task 5、Task 7 中的调用签名一致：均接收（域表切片, sessionId），读为同步、写为异步；**全文不得再出现 `session.append` / `SessionEventMap` / `autoReviewPlusRouteProjectionDefinition`**（Task 4 节的历史代码除外，且该节已标注为不可实现）。
- Task 7 的 Remote 方法名（`providers`/`models`/`modelInfo`/`reviewerRouteView`/`setReviewerRoute`）与其在 `ReviewerRoutePicker` 中的消费一致。

**已知未决（实施时若发生需回报）**：Task 1 的客户端构建契约若不成立，客户端任务（Task 6、7）整体改为 spec §7.2 的退路方案，届时需重新评估计划而不是硬推。

---

## 控制者修订（实施期裁定，覆盖上文对应步骤）

| # | 生效范围 | 修订 |
|---|---|---|
| 1 | Task 0 | `scripts.test` = `vitest run --passWithNoTests`（无测试文件时 vitest 默认判失败）；Task 2 起有真实测试后移除该 flag |
| 2 | Task 0 `ci.yml` | 只含 checkout / setup-node / `npm install` / typecheck / test；**build 与产物漂移校验由 Task 1 Step 7 补回** |
| 3 | Task 0 | 提交 `package-lock.json` → 由裁定 8 撤销 |
| 4 | Task 1 Step 5/6 | 官方 `auto-review` 的停用与移除**推迟到 Task 5**（开发期间保持用户现有 Auto review 可用） |
| 5 | Task 1 Step 6 | 安装改为 **tarball**（`npm pack` + `dsh plugin add <tgz>`），不用 `add .`（避免 `link:` 把仓库 `node_modules` 暴露进 profile 解析链） |
| 6 | 全局 | 本机沙箱 **bash 不可用**、**vitest 不可运行**（`spawn EPERM`）；本地逻辑验证用 `node --experimental-strip-types` 直跑 TS，单测权威执行在 CI |
| 7 | Task 0 | devDependencies 增加 `@types/node`（tsconfig 的 `"types": ["node"]` 需要） |
| 8 | Task 0 | **不提交 lockfile**（镜像 URL 会把 CI 钉在第三方 registry），devDependencies 固定为精确版本；`.gitignore` 忽略 `package-lock.json` |
| 9 | Task 7 | Remote 方法的挂载方式以复制进来的宿主半实际结构为准（官方 auto-review 未必是 class-with-`this.ctx`） |
| 10 | Task 0/Task 1 | `npm install` 在本沙箱需 `--ignore-scripts` 且缓存指向工作区内目录 |
| 11 | Task 1 Step 9 | `*.tgz` 加入 `.gitignore` |
| 12 | Task 4 | `zod` 依赖用**精确 `4.6.5`**（简报原写 `^3.23.0`）：`@deepseek-ai/dsh-session-projection` 自身依赖 zod 4，`ProjectionDefinition.stateSchema` 的类型即 zod 的 `ZodType`，装 v3 会造成双实例类型身份不匹配、typecheck 必失败；且本项目无 lockfile、依赖一律精确固定 |


