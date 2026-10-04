# dsh-auto-review-plus 设计（spec）

- 日期：2026-10-02
- 状态：已与需求方逐节确认（第 1 节架构与形态、第 2 节宿主侧、第 3 节客户端侧）
- 目标仓库／包名：`dsh-auto-review-plus`（v1 走 GitHub，稳定后再发 npm）

## 1. 背景

DeepSeek Harness 自带的实验性 `@deepseek-ai/dsh-experimental-auto-review`（Auto review 权限模式）会在每次工具调用执行前，用当前 agent 的 provider/model 单独发一次审查请求。但该审查请求**没有沿用会话请求的上下文**，导致两类必然失败：

1. **缺 `sessionId`** → pi-ai 的 opencode / opencode-go provider 不会注入必需的 `x-opencode-session` 路由头 → 网关返回 400 `MissingSessionID`。上游讨论：<https://github.com/deepseek-ai/deepseek-harness/discussions/8764>
2. **缺 `reasoningEffort`** → 对"始终思考"的目录型模型（如 GLM-5.3-Flash），pi-ai 的缺省分发会发出 thinking disabled → 智谱 API 返回 400 / code 1210。上游讨论：<https://github.com/deepseek-ai/deepseek-harness/discussions/8670>

两者都使该次工具调用 **fail-closed**（工具体不执行），Auto 模式在这些 provider／模型组合下完全不可用。此外，使用者希望审查**可以使用另一个模型**，而不是永远跟随当前会话模型。

## 2. 目标与非目标

### 目标

- **G1 修复请求上下文**：审查请求携带 `sessionId` 与 `reasoningEffort`。
- **G2 健壮性**：思考级别缺省时可回退到可配置默认值（仅当目标模型支持该级别时套用）；审查失败信息带实际路由；官方 auto-review 冲突时给出可读诊断而非静默失败。
- **G3 审查模型可选**：默认跟随当前会话模型；一经选定，本会话内无视会话模型变化；可重置为跟随；**作用域仅当前会话**。
- **G4 独立发布**：以 `dsh-auto-review-plus` 名义独立仓库发布，v1 走 GitHub 且构建产物入库，MIT 许可并保留上游署名。

### 非目标（v1 明确不做）

- 不改风险策略（low / medium / high 的判定与处置）、审批交互、PTC 内层审查语义、工具定义与沙箱值。
- 不做跨会话的审查模型偏好。
- 不 fork 官方客户端包，不替换官方客户端行。
- v1 不发布到 npm。

## 3. 需求决策清单（均已确认）

| 项 | 决定 |
|---|---|
| 范围 | 修复两处缺陷 + 少量健壮性增强 + 审查模型可选 |
| 包名／仓库名 | `dsh-auto-review-plus`（专用仓库） |
| 审查模型默认 | 跟随当前会话模型（与现状一致） |
| 选定后行为 | 本会话内无视会话模型切换，固定用所选模型审查 |
| 作用域 | 仅当前会话；新会话回到"跟随会话模型" |
| 重置入口 | 重开弹框并选"跟随当前会话模型"（不新增斜杠命令） |
| 进入 Auto 时 | 若本会话尚未选择过，弹框自动出现一次（可直接关闭＝跟随） |
| 分发 | v1 GitHub 立即可用（产物入库）；同时提供 tag 触发的 npm 发布流水线（首次发布由你打 tag 决定） |
| 方案 | 遮蔽 `conversation.input.permission` 单槽，自建含模型选择的确认弹框 |

## 4. 架构

### 4.1 仓库与产物

单包双半（宿主半与客户端半**必须同包**：`dsh.client` 声明与 `exports["./client"]` 同属一个 `package.json`，客户端 bundle 由该包的宿主 Loader 行触发加载）。

```
dsh-auto-review-plus/
  package.json          # name / exports["."] / exports["./client"] / dsh.bundle.patch / dsh.client
  cordis.patch.yml      # 停用官方 auto-review 行 + 插入自己的行
  src/index.ts          # 宿主半：reviewer、会话级状态、Remote API
  src/client/index.tsx  # 客户端半：遮蔽权限槽 + 含模型选择的确认弹框
  lib/index.js          # 宿主产物（入库）
  lib/client.js         # 客户端产物（入库）
  locale/{en,zh}.json   # 含新增文案
  README.md / README.zh.md
  LICENSE (MIT) + NOTICE  # 派生自 deepseek-harness/auto-review 的署名与说明
  docs/superpowers/specs/2026-10-02-dsh-auto-review-plus-design.md
```

`cordis.patch.yml` 承担两件事（我们的层排在官方之后 = 后层胜）：

```yaml
- id: auto-review
  disabled: true            # 停用官方行（官方 bundle 仍启用时也生效）
- insert:
    - id: auto-review-plus
      name: 'dsh-auto-review-plus'
```

### 4.2 三个硬前置

1. **必须使用新包名**：`resolveBundleDir` 安装目录优先（`packages/boot/app-boot/src/profile.ts:630-641`），profile 内的同名包会被安装自带的副本遮蔽。
2. **官方 auto-review 必须不加载**：`registerAuto` 是单占用，重复注册会同步抛错（`packages/interaction/permission-presets/src/index.ts:307-317`），使后注册者（我们）起不来。通过上面的 `disabled: true` 停用官方行实现；README 需说明"官方行必须排在本包之前；也可直接把官方包从 `dsh.profile.bundles` 移除"。
3. **preset id 沿用 `auto`**：不得自建等价 preset 抢占显示，也不得把 `auto` 写进 `config.presets`（构造函数会抛错并炸掉整个权限插件，`src/index.ts:213-218`）。

### 4.3 数据流

```
GUI 权限控件（本包，priority: -1 遮蔽官方 PermissionSelect）
  │  选择 "Auto review" → 确认弹框（内置审查模型选择器）
  ├─▶ 提交 preset "auto"：复用既有 remote submit(sessionId, preset)
  └─▶ 若选定了审查模型 → 调用本插件 Remote
                            → 写入审查路由 storage domain：table.put(sessionId, route)
宿主半
  registerAuto(admit)                      ← 单占用；官方那份必须不加载
  工具调用前置审查：route = 域表记录(sessionId) ?? 会话当前 route
  审查请求 = { provider, model, sessionId, reasoningEffort, temperature: 0, system, messages }
```

## 5. 宿主侧设计

### 5.1 审查请求的两处修复

在 `classifyRisk` 构造的 `GenerateOptions` 中补充：

| 字段 | 取值 | 作用 |
|---|---|---|
| `sessionId` | `String(session.id)` | pi-ai 据此注入 `x-opencode-session`（`@earendil-works/pi-ai` 的 `dist/providers/opencode-headers.js`），非 opencode 系 provider 不受影响 |
| `reasoningEffort` | `session.requestHeader()?.config.reasoningEffort` | 审查与主对话同级 → 消除 GLM 1210，且不再依赖 provider 的 `reasoning: low` 临时配置 |

其余形态不变：`temperature: 0`、固定 `REVIEW_POLICY`、单条 user 消息；响应解析仍按"零个或多个 reasoning 块 + 恰好一个 text 块"（原 `readDecision` 语义）。

### 5.2 健壮性增强

- **思考级别回退**：判定条件是会话头的 `config.reasoningEffort === undefined`（`adapterDefaults.reasoningEffort: true` 只表示"适配器默认生效"，不作为我们的取值来源）。此时若本插件的配置项 `fallbackReasoningEffort`（宿主半 Config schema 的字段，通过本包行的 `config:` 设置；**默认不设＝保持原行为**）有值，则使用它。**套用前校验目标模型支持该级别**（`ctx.llm.resolveModelInfo(provider, model).reasoning.efforts`），不支持则省略该字段——否则只是把 1210 换成 `UNSUPPORTED_REASONING_EFFORT`。
- **诊断信息**：审查失败时在既有消息后追加实际路由与失败类别，形如 `Auto review of tool "X" failed; its body was not executed: <error> (route: provider/model)`。
- **启动诊断**：捕获 `registerAuto` 的"already registered"冲突并输出明确指引（提示停用官方 auto-review），避免本插件静默不加载。

### 5.3 会话级"审查路由"状态

**状态存放在 storage domain，绝不写入会话日志。**（原方案的"自定义会话事件 + 投影"经查证会让受影响会话永久无法 resume，已推翻。）

- **域**：`ctx.storageDomain.open(autoReviewPlusDomainSpec)`，`layout: 'per-record'`（每个会话一份文档，与官方 `dsh-session-projection-cache` 的 `session_projcache` 同构）；域名为满足 `UNIT_NAME_RE` 的常量（如 `auto_review_plus`，最终值以实现为准）；表 `routes` 键 = sessionId，值 = `{ provider, model }`（zod `.strict()` 校验）。
- **读**：`table.get(sessionId)`（同步内存读）→ `ReviewerRoute | undefined`，返回**分离副本**（`KvTable` 文档明确：返回的是存储对象本身、**禁止就地修改**）；`undefined` = **跟随会话模型**。
- **写**：`table.put(sessionId, route)` 钉住；`table.delete(sessionId)` 重置为跟随（忽略返回值，不因"本来不存在"报错）。
- **生命周期**：`DomainFacility.open` 返回的句柄由调用方负责 `close()`，宿主半用 `ctx.effect` 持有 disposer；域数据在 `$DSH_HOME/storages` 下、与 profile 同生命周期，**不随会话删除自动清理**（量级为一个会话一条小记录）。
- **语义**：仅当前会话键；进程重启／会话恢复后仍在；新会话无记录 → 自然跟随会话模型。
- **写入校验**：提交前确认该路由存在于当前 provider/model 目录，未知路由返回明确错误（不静默接受）。
- **证据（为什么不能用会话事件）**：`KNOWN_SESSION_EVENT_TYPES` 是构建期生成的静态集合，repo 外插件事件按构造不在其中，且官方明确否决"事件名注册"（`@deepseek-ai/dsh-session/lib/types/known-event-types.js:1-21`）；`Session.append` 对非 surface 类型不允许第三个参数、运行时静默丢弃 `ignorable`（`lib/index.js:1441-1459`）；持久化读路径对"未知 + 非 ignorable"**fail-closed 抛 `SessionFormatUnsupportedError`**（`@deepseek-ai/dsh-session-persistence/lib/index.js:182-189`；调用点 `dsh-session-persistence-jsonl/lib/index.js:2824/2720/1818`、`worker.cjs:12765`）；而**写路径不校验**，故障被推迟到 resume 时刻且已落盘日志无法自愈。

### 5.4 客户端接口面（本包 Remote）

`LlmRuntime` 的 `listProviders` / `listConfigurableProviders` 是 `@Remote`，而 `listModels(provider)` 与 `resolveModelInfo(provider, model)` **不是**，客户端取不到，必须由宿主半代理。分三级懒加载，避免弹框一次性枚举全部 provider 的全部模型：

```
@Remote providers()                     → 可选 provider 列表
@Remote models(provider)                → 该 provider 的模型列表
@Remote modelInfo(provider, model)      → 该模型的 reasoning 能力（显示 + 校验）
@Remote reviewerRoute(sessionId)        → { route: 域表记录 | null, sessionRoute: 当前会话路由 }
@Remote setReviewerRoute(sessionId, r)  → 写 storage domain 的 routes 表：r = null → delete（重置），否则 put
```

### 5.5 生命周期与错误处理（与官方对齐）

- `registerAuto(admit)` 注册；
- 前置审查监听器：deny → `ask()` 交用户审批；允许 → 以 Full access 执行；无效响应／技术失败 → **fail-closed**（工具体不执行）；
- 卸载时：关闭选择与审查准入 → 将存活 Auto 会话迁移到 Full access（复用既有 preset writer）→ 中止并结清在途审查 → 撤回监听器与 contribution。此条必须保留，否则会话会指向已消失的 preset。

### 5.6 不变项

风险策略、审批交互、PTC 内层审查、会话历史读取方式（仍用被豁免的同步 `snapshotEvents()`）、工具定义与沙箱值。

## 6. 客户端侧设计

### 6.1 遮蔽权限槽

- 以 `priority: -1` 注册单槽 `conversation.input.permission`（官方注册在默认 priority 0，"最低者渲染"；slot 目录已将该槽标为 `replaceRisk: 'shadows-shipped-ui'`）。
- **需复刻的官方语义**：输入框权限 chip + 下拉菜单、选择提交（复用同一 remote `submit(sessionId, preset)`）、`danger-full-access` 与 `auto` 的确认弹框、`locked`／忙碌语义、目录失效时的 dismiss。
- 以官方 `packages/client/ui-permission-presets` 源码为蓝本改写（MIT，NOTICE 署名），**不 fork 官方包、不替换官方客户端行**。

### 6.2 Auto 确认弹框（含模型选择器）

- 默认项"跟随当前会话模型"；其余选项经宿主 Remote 以 provider → model 两级选择（选中后显示该模型 reasoning 能力）。
- 确认后：提交 preset `auto`，并写入会话级路由——选定模型则写 `{ provider, model }`，"跟随当前会话模型"则写 `{ route: null }`（见 6.3）；取消则不切换模式、不写任何事件。

### 6.3 进入 Auto 时自动弹框一次

`/permission auto` 这类斜杠命令路径的确认弹框仍由官方包渲染（本包未接管命令），为闭合该缺口：**任何路径进入 Auto 时，若本会话尚未做过模型选择，本包弹框自动出现一次**（可直接关闭＝不记录选择）。

精确语义（消除歧义）：

- **触发条件**：会话进入 Auto 且满足全部三条——该会话在**审查路由域表里没有记录**；客户端本会话内未做过选择／未关闭过该弹框；当前没有其它路径已打开该弹框。
- **"跟随当前会话模型"= 删除记录**（`table.delete(sessionId)`），与"从未选择"在存储上等价；客户端在**内存**里记住"本会话做过选择"，因此同一会话内不再重复弹出（跨会话／刷新后，若仍无记录会再出现一次——这与"尚未选择"的语义一致，可接受）。
- **关闭（不选择）**：不写任何记录；同样只记在客户端内存里，避免反复打扰。
- **页面刷新／会话恢复后**：内存标记丢失，若仍无记录，下次进入 Auto 会再出现一次。
- 从输入框 chip 路径选择 Auto 时，弹框由该路径同步打开（同一次交互，不重复弹出）。

### 6.4 文案与 i18n

`locale/{en,zh}.json` 提供同名命名空间的键（沿用官方中英文文案，MIT 署名）＋新增键（模型选择器标题、跟随项、能力提示、错误）。

## 7. 构建与产物

### 7.1 宿主半

普通 ESM bundle，外部化 `@deepseek-ai/dsh-*` 与 `@deepseek-ai/cordis`（与官方发布包一致，主体为单个 `lib/index.js`）。

### 7.2 客户端半（先行 spike，风险最高）

产物必须是 ModuleLoader 包装形式（`window.__ModuleLoader__.load({ id, factory })`，导出 `apply` / `inject`），且只引用平台冻结模块表或 `dsh.client.external` 声明过的模块。

- **先做最小验证**：注册一个设置行（或遮蔽一个无害 slot）仅渲染一行文字，产出 `lib/client.js`，确认它出现在 `/plugins` 启动图并在浏览器生效；
- 构建配置以官方 `tsdown.config.ts` + `--env.DSH_BUILD_FACE client` 为参考；若其依赖 monorepo 内部插件，退路是**手写 ModuleLoader 包装**包住 esbuild/tsdown 产物，并正确映射冻结模块表（React、cordis、`client-ui-primitives`、`client-ui-slots`、`client-locale` 等）；
- **验证失败即回头重估方案**（退回 fork 官方客户端包，或 v1 先不做 UI），不硬撑。

### 7.3 发布流水线（GitHub Actions → npm）

两条工作流，均放在 `.github/workflows/`：

**`ci.yml`（push / PR 触发）**

1. `actions/checkout` + `actions/setup-node`（Node 22，`registry-url: https://registry.npmjs.org`）+ pnpm 安装；
2. `npm run build` 构建宿主半与客户端半；
3. **产物漂移校验**：把本次构建结果与仓库内已提交的 `lib/index.js`、`lib/client.js` 逐字节比较，不一致即失败——本包入库构建产物，必须保证"源码 ↔ 入库产物"永远同步；
4. 类型检查与单元测试（若有）。

**`publish.yml`（push tag `v*` 触发）**

1. 同样的安装与构建步骤；
2. **一致性校验**：tag 名（去掉前缀 `v`）必须等于 `package.json.version`，否则失败；
3. **产物漂移校验**（同 `ci.yml`）；
4. `npm publish --provenance --access public --registry=https://registry.npmjs.org`。

**凭据二选一（含取舍）**

| 方式 | 配置 | 取舍 |
|---|---|---|
| npm Trusted Publishing（OIDC，推荐） | 在 npm 该包的设置里登记本仓库与工作流文件名；工作流声明 `permissions: id-token: write` | 无长期令牌、发布自动带 provenance 证明；需在 npm 侧做一次性登记（首次发布前完成） |
| 长期令牌 | 仓库 secret `NPM_TOKEN`（Granular Access Token，仅本包写权限），工作流用 `NODE_AUTH_TOKEN` | 配置最简单；但令牌需轮换、泄露风险更高 |

**必须显式指定 registry**：`registry.npmmirror.com` 这类镜像是只读的，发布必须指向 `registry.npmjs.org`——工作流里显式写出，不依赖环境默认。

**版本与 tag 约定**：包自身版本独立于 dsh（首版 `0.1.0`）；peers 仍钉 `0.2.0-rc.2`。dsh 升级时：改 peers → 重新构建产物 → 提交 → 打 tag → 流水线自动发布。

## 8. 测试与端到端验证清单

1. 安装后启动：无 `failed to import`、无 `preset "auto" is already registered`，本包行激活；
2. 权限控件由本包接管：三种官方模式 + Auto 均可选；Full access 确认弹框正常；锁定／忙碌语义正常；
3. 选 Auto → 弹框出现且默认"跟随当前会话模型"；不选则行为与"仅修复版"一致；
4. 选定审查模型后 → **切换会话模型，审查仍使用钉住的模型**（关键断言）；
5. 重开弹框选"跟随当前会话模型" → 恢复跟随；
6. 重启 `dsh web`／会话恢复后，钉住的路由仍在；
7. `opencode-go/deepseek-v4.1-flash` 下工具调用审查通过（无 `MissingSessionID`）；
8. `zai/glm-5.3-flash`（始终思考）下审查通过（无 1210），且**不需要** provider 上的 `reasoning: low` 临时配置；
9. 中风险动作（删除既有文件）仍弹审批；审查失败时工具体不执行（fail-closed 未被破坏）；
10. 卸载本包后：存活 Auto 会话迁移到 Full access，官方 auto-review 可重新启用。

## 9. 风险、维护与退出策略

| 风险 | 说明 | 缓解 |
|---|---|---|
| 上游 UI 漂移 | 本包复刻了官方权限控件 | 控件保持最小、钉定版本、README 记录与上游差异 |
| 版本耦合 | peers 钉 `0.2.0-rc.2`，dsh 升级触发兼容性校验 | 重建产物或申请精确版本豁免；README 写明升级步骤 |
| 客户端产物格式变化 | 依赖 ModuleLoader 包装与冻结模块表 | 由 7.2 的 spike 早期暴露；格式变化时优先修包装层 |
| 与官方插件冲突 | 单占用 preset、同名包遮蔽 | 4.2 的三个硬前置 + 启动诊断 |
| 发布凭据与产物漂移 | npm 发布需凭据；入库产物可能落后于源码 | 7.3 的产物漂移校验与 tag↔version 校验；凭据方式二选一并在 README 写明 |
| **插件状态误入会话日志** | 第三方扩展的事件类型不在构建期生成的 `KNOWN_SESSION_EVENT_TYPES` 内，且 `Session.append` 无法标 `ignorable`；持久化读路径对此 fail-closed → **会话永久无法 resume**（写路径不校验，故障推迟到 resume） | **硬约束**：本包不得声明 `SessionEventMap` 扩展、不得调用 `session.append`；会话级状态一律走 storage domain（见 5.3）。README 写明该约束与原因 |

**退出策略**：上游 #8670 / #8764 任一修复发布后，若官方审查请求已携带 `sessionId` 与会话思考级别，本包应被弃用；README 写明判断标准与卸载步骤。

## 10. 许可与署名

- 本包以 MIT 发布；
- 派生自 `deepseek-ai/deepseek-harness` 的 `packages/experimental/auto-review` 与 `packages/client/ui-permission-presets`；
- 仓库包含 `LICENSE`（MIT）与 `NOTICE`，说明派生来源、原版权与改动范围；
- 文档不得把上游实现表述为本包原创。

## 11. 实施顺序（交由 writing-plans 细化）

1. 建仓库骨架：许可／署名文件、`.gitattributes`（`* text=auto eol=lf`）、`.gitignore`；
2. **客户端构建 spike**（决定后面走 UI 还是退回）；
3. 宿主半：修复两处 + 健壮性 + 会话级路由状态（**storage domain**，非会话事件）+ Remote；
4. 宿主半单元／端到端验证（清单 7、8、9）；
5. 客户端半：遮蔽权限槽 + 含模型选择器的确认弹框 + 自动弹框一次 + i18n；
6. 产物构建与入库，端到端验证清单全量回归（1–10）；
7. CI 与发布流水线：`ci.yml`（构建 + 产物漂移校验）与 `publish.yml`（tag 触发，含 tag↔version 一致性校验、provenance、显式 registry）；
8. README（安装、冲突处理、升级、退出策略）与首次发布（打 tag 走流水线）。

## 附录 A：证据索引

- 审查请求构造与解析：`packages/experimental/auto-review/src/index.ts`（`classifyRisk`、`readDecision`、`snapshotAutoReview`）
- pi-ai 路由头注入：`@earendil-works/pi-ai` `dist/providers/opencode-headers.js`
- 适配器透传：`packages/llm/llm-pi-ai/src/adapter.ts`（`streamWithSnapshot` 的 `sessionId` 与 `reasoningEffort` 处理）
- 会话请求头字段：`packages/session/session-format-v0-to-v1/src/payload-validation.ts`（`config.reasoningEffort`、`adapterDefaults.reasoningEffort`）
- 每会话状态先例（**storage domain**）：`@deepseek-ai/dsh-session-projection-cache` 的 `session_projcache` 域（每个会话一份文档、`layout: 'per-record'`）；`dsh-better-sidebar` 亦把插件自有状态放在会话日志之外
- **禁止**把插件状态写进会话日志的证据：`@deepseek-ai/dsh-session/lib/types/known-event-types.js:1-21`；`lib/index.js:1441-1459`（`append` 无 `ignorable` 槽位）；`@deepseek-ai/dsh-session-persistence/lib/index.js:182-189`（读路径 fail-closed）；`dsh-session-persistence-jsonl/lib/index.js:2824/2720/1818`、`worker.cjs:12765`（三处调用点 + worker 双份）
- preset 单占用：`packages/interaction/permission-presets/src/index.ts:213-218, 307-317`
- 权限槽与遮蔽：`packages/client/ui-conversation/src/client/contract/slots.ts:217`；`packages/client/ui-slots/src/index.ts:1210-1220, 1352-1367`
- 官方客户端实现蓝本：`packages/client/ui-permission-presets/src/client/PermissionSelect.tsx`、`src/client/index.ts`
- 第三方客户端插件先例：`dsh-better-sidebar`（`package.json` 的 `dsh.client`、`exports["./client"]`、`lib/client.js`）
- 客户端产物校验：`packages/client/modules/src/index.ts`（`/plugins`、`clientExportOf`、`CLIENT_BUNDLE_BUILD_INSTRUCTION`）
- 包解析与行覆盖：`packages/boot/app-boot/src/profile.ts:630-641`；`packages/boot/plugin-manager/src/index.ts:635`
