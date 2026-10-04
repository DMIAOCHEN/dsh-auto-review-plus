**简体中文** · [English](README.md)

# dsh-auto-review-plus

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）的 **Auto review** 补充
**会话上下文**，并支持**按会话选择审查模型**。

> **状态**：实验性，钉在 `dsh` `0.2.0-rc.2`。它接管官方 Auto review preset，安装前请先读
> [必须停用官方 Auto review](#必须停用官方-auto-review强制)。

## 这是什么

`dsh` 内置一个实验性的 **Auto review** 权限 preset：不再用沙箱兜底，而是先让模型审查这次工具调用，
由它决定能否直接执行，还是要交回给你审批。本包替换该 preset 的实现，只加两件事：

- **审查请求带上会话上下文**：每次审查都携带所属的 `sessionId` 与该会话的 `reasoningEffort`，因此审查
  可归属到具体会话，并使用该会话配置的思考级别。
- **按会话选审查模型**：Auto 确认弹框里带一个审查模型选择器（服务商／模型／思考级别），选择**按会话**
  保存。留在「跟随当前会话模型」时，审查者就是会话自己的模型——即上游行为。

其余全部沿用上游、不做改动：风险确认弹框与确认文案、审批流程、PTC 内层调用审查、风险策略、沙箱取值、
工具定义。

## 为什么存在

本包回应的上游讨论：

- <https://github.com/deepseek-ai/deepseek-harness/discussions/8670>
- <https://github.com/deepseek-ai/deepseek-harness/discussions/8764>

**本包是权宜之计。** 上游实现同等能力后，请改用上游并删除本包。判断标准是两条：

- **A —— 会话上下文**：Auto review 请求携带会话 id 与该会话的思考级别。
- **B —— 审查模型可选**：可以配置由哪个模型审查（最好能按会话）。

上游只补齐 **A** 时，本包剩下的价值是 **B**，仍然值得存在；**A 与 B 都补齐**后本包即被取代：
请[卸载](#卸载)本包，让 `@deepseek-ai/dsh-experimental-auto-review` 重新拥有该 preset。

## 环境要求

| | |
| --- | --- |
| `dsh` | `0.2.0-rc.2` —— 宿主侧 peer 是**精确版本**（见[升级 dsh](#升级-dsh)） |
| Node.js | **≥ 22** —— 构建 target 为 `ES2024`，宿主半使用 `Promise.withResolvers` |
| 操作系统 | 不限（已在 Windows 验证；构建与机器无关，产物已入库） |

## 安装

**以 GitHub 为主**。构建产物（`lib/`）已入库，且本包没有声明 `prepare` 脚本，所以从 git 安装
**不需要**在你机器上执行构建。

任选一条（profile 名与你要启动的那个保持一致，`web` 是 GUI profile）：

```bash
# GitHub，钉住发布 tag（推荐：可复现）
npx -y @deepseek-ai/dsh plugin --profile web add github:DMIAOCHEN/dsh-auto-review-plus#v0.1.0

# GitHub，跟随默认分支（每次推送都会漂移）
npx -y @deepseek-ai/dsh plugin --profile web add github:DMIAOCHEN/dsh-auto-review-plus

# 本地 tarball，在仓库根目录执行
npm pack && npx -y @deepseek-ai/dsh plugin --profile web add ./dsh-auto-review-plus-0.1.0.tgz

# npm —— 尚未发布：首发 bootstrap 之前该命令会 404
npx -y @deepseek-ai/dsh plugin --profile web add dsh-auto-review-plus@latest --registry=https://registry.npmjs.org
```

**不要**用 `dsh plugin --profile web add .`：目录依赖会就地改写 profile 的依赖布局。本项目一律从
tarball 或 git 源安装。

然后：

1. **完全重启 `dsh web`**。profile 层只在启动时装配——正在运行的进程仍持有启动时的插件集合，运行中安装
   （或升级）的插件必须重启才生效。
2. 确认安装：`npx -y @deepseek-ai/dsh plugin --profile web list` 会打印 profile 的依赖（该命令就是
   在 `$DSH_HOME/profiles/web` 里执行 `pnpm list`）。

## 必须停用官方 Auto review（强制）

`permissionPresets.registerAuto` 是**单占用**注册：先注册的层胜出，另一个直接抛错。所以两层不可能同时
拥有 `auto` preset，本包的 `cordis.patch.yml` 必须把官方那一行关掉：

```yaml
- id: auto-review
  disabled: true

- insert:
    - id: auto-review-plus
      name: 'dsh-auto-review-plus'
```

patch 只能停用装配时**已经声明**的行，且后层胜出。因此
**`dsh.profile.bundles` 里官方的 `@deepseek-ai/dsh-experimental-auto-review` 必须排在本包之前**——
我们的 patch 层是排在他**之后**应用的。`dsh plugin add` 会把新装的 bundle 追加到数组末尾，所以默认顺序
本来就是对的。该列表在 `$DSH_HOME/profiles/web/package.json`（`$DSH_HOME` 默认是 `~/.dsh`），健康安装
长这样（只列出相关字段）：

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

如果官方包被排到了本包**之后**，把它移上去（或直接删掉该条目——preset 就只归本包所有），然后重启。

万一官方那行仍然生效，本包**不会静默失败**：它会**安全降级**（撤下自己的监听器，避免每次 Auto 调用被两层
各审一遍），并在日志里打印：

```
auto-review-plus: cannot take over the "auto" preset — the official @deepseek-ai/dsh-experimental-auto-review layer is still active. Disable its row (disabled: true) or remove it from the profile bundles.
```

看到这句就是排查线索：修 `dsh.profile.bundles` 顺序（或移除官方包），然后重启。

## 使用

1. 打开会话，点输入框里的权限控件，选 **Auto review**（带 `EXP` 角标）。
2. 确认弹框里带审查模型选择器：**服务商**、**模型**、**思考级别**。默认停在
   **跟随当前会话模型**。
3. 勾选风险确认并启用。审查路由**先写后切 preset**，所以写入失败时弹框会保留并显示错误，而不是"看起来
   启用成功"。
4. 之后想改或重置，在同一菜单里**再次**选 **Auto review**，选择器会重新打开；选
   **跟随当前会话模型**即删除记录，回到会话自己的模型。

语义：

- **作用域仅当前会话**：每个 `sessionId` 一条记录，没有全局默认值；进程重启、会话恢复后仍在。
- **记录缺失 = 跟随**：「跟随」是记录的**缺失**，不会存成一个显式值。
- **选择器展示的是审查模型的能力**：*思考级别* 行列出所选模型支持的级别。真正随审查请求发出的级别是
  该会话自己的思考级别；会话没有钉住时，才使用配置项 `fallbackReasoningEffort`（且仅当该审查路由确实
  提供该级别时才生效）。
- **只问一次**：某个会话处于 Auto review 且没有记录时，选择器会自动弹出一次（每会话一次）。

## 升级 dsh

`package.json` 里的 peer 是**精确**版本。升级 `dsh` 后，启动预检会发现版本不再匹配，并**自动停用本插件**
（fail-safe：绝不会半加载），在标准错误输出：

```
dsh: disabling profile plugin row "auto-review-plus": <reason>
```

两种补救：

- **给这个精确版本开豁免** —— 最快，沿用现有构建。豁免是**两端都精确**的：一个包版本 + 一个 dsh 版本。
  ```bash
  npx -y @deepseek-ai/dsh plugin --profile web allow-version dsh-auto-review-plus@0.1.0 --dsh-version <新的-dsh-版本> --accept-risk
  npx -y @deepseek-ai/dsh plugin --profile web version-exemptions
  npx -y @deepseek-ai/dsh plugin --profile web revoke-version dsh-auto-review-plus@0.1.0 --dsh-version <新的-dsh-版本>
  ```
  `allow-version` 会先警告：允许不兼容的插件版本可能破坏应用或损坏数据。请在你接受该风险时再执行。
- **改 peer 版本** —— 受支持的路径：更新 `package.json` 里的 `@deepseek-ai/dsh-*` 版本，执行
  `npm install && npm run build`，提交重新生成的 `lib/`，升版本、打 tag、重新安装。

## 重装或升级本包

`file:`（tarball）依赖在包管理器里**不记 integrity**，所以"同路径同版本"的重装会被**静默跳过**：你仍然
在跑旧代码，而且没有任何报错。因此版本号必须一直往前走：

- **开发期**：递增 `-dev.N` 后缀（`0.1.0-dev.1` → `0.1.0-dev.2` …），让每次重建都是不同版本。
- **正式发布**：递增版本本身（`0.1.0` → `0.1.1`）并打 tag。

装入新构建后，同样要**完全重启 `dsh web`**。

## 卸载

```bash
npx -y @deepseek-ai/dsh plugin --profile web remove dsh-auto-review-plus
```

然后完全重启 `dsh web`。

卸载过程中，本插件会把**存活的 Auto 会话迁移到 Full access**（`danger-full-access`），因为它们指向的
preset 即将消失；不处于 Auto review 的会话不受影响。

按会话保存的审查记录**不会**随插件一起删除：它们在 storage domain 里，位于
`$DSH_HOME/storages/auto_review_plus`（见下）。之后删掉该目录是安全的，只会丢失钉住的审查模型。

## 已知限制

- **每个浏览器进程有两份 permission catalog 读取器。** 本插件自己维护一份 catalog 目录，官方
  `@deepseek-ai/dsh-client-ui-permission-presets` 也维护一份（它仍然拥有设置页那一行和 `/permission`
  弹框）。两者都订阅 `permission-presets/catalog-changed`，所以每次目录变更会多一次 Remote 读取。
  共享是不可能的：该包的 `client` 入口只导出插件的 `apply`/`inject`，不导出它自己的目录，共享就等于依赖
  它的非导出内部实现。作为已知成本接受。
- **输入框席位是按优先级抢占的，不是预留的。** `conversation.input.permission` 是单占用 cell，本插件以
  `priority: -1` 渲染。若第三方以更低优先级注册，会顶掉本控件；此时本插件的 fiber 起不来，官方控件继续
  生效——属于优雅回退，但审查模型选择器就不可达了。
- **状态不在会话日志里**（有意为之，见下），所以不要在 `dsh` 运行时删除
  `$DSH_HOME/storages/auto_review_plus`。请先停掉 `dsh`，删除，再重启。

## 给贡献者：插件状态不得写成会话事件

**不要**用追加会话事件的方式持久化任何插件状态。这种做法的故障在写入时静默、在读取时永久：

- 会话事件类型是**构建期生成的封闭集合**（`KNOWN_SESSION_EVENT_TYPES`）。仓库外插件的事件类型按构造
  不在其中。
- `Session.append` 无法把第三方事件类型标记为 `ignorable`（非 surface 类型会被丢弃）。
- 持久化**读取**路径对"未知且非 ignorable"**fail-closed**：抛 `SessionFormatUnsupportedError`；而**写入**
  路径不校验，所以故障只会在下一次 resume 时暴露——那时日志早已落盘。
- 后果不是一条警告：凡是见过该事件的会话会**永久无法 resume**。

因此本包把每会话的审查路由放在 **storage domain** 里：域 `auto_review_plus`，`layout: 'per-record'`，
表 `routes`，键为 `sessionId`。落到磁盘就是 `$DSH_HOME/storages/auto_review_plus`（`$DSH_HOME` 默认
`~/.dsh`）。域数据的生命周期与 profile 一致，**不随会话删除清理**；量级是每会话一条小记录。

## 许可与出处

MIT —— 见 [LICENSE](LICENSE) 与 [NOTICE](NOTICE)。

这是**派生作品，不是原创代码**：宿主半改写自
[`deepseek-ai/deepseek-harness`](https://github.com/deepseek-ai/deepseek-harness)（MIT）的
`packages/experimental/auto-review`，客户端半移植自 `packages/client/ui-permission-presets`，文案取自
同样的包。任何再分发或 fork 请保留 `NOTICE` 与上游署名。
