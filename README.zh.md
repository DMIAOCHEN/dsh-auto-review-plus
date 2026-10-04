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

**本包是权宜之计，退出规则是明确的一条。** 上游两条讨论中**任一条**的修复发布后，只要官方审查请求已经
携带 `sessionId` 与该会话的思考级别，本包就应**被弃用**：请[卸载](#卸载)本包，让
`@deepseek-ai/dsh-experimental-auto-review` 重新拥有该 preset。

- **退出判据（决定弃用与否）**：官方 Auto review 请求携带会话 id 与会话自身的思考级别。spec 把这一条
  定为判据，它单独成立即足够——不需要再等别的条件。
- **补充考量（不决定弃用与否）**：能否按会话配置审查模型。若上述判据已满足而这一项仍缺，剩下的问题只是
  「要不要自己留一个 fork 的选择器」，而**不是**「要不要继续装着本包」。继续装着，本包那层
  `disabled: true` 就会留在 `dsh.profile.bundles` 里，把上游**刚刚修好**的官方 Auto review 关掉。

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

> **目前还没有任何 tag。** 在维护者切出 `v0.1.0` 之前，仓库没有发布 tag（现在 `git tag -l` 是空的），
> 所以上面那条钉版本的 `#v0.1.0` 命令在此之前会失败。请先用不带 tag 的 GitHub 命令或本地 tarball；
> 发布清单见下文。

然后：

1. **重启 `dsh web`**。安装或卸载包会改动 profile 的依赖树与 `dsh.profile.bundles` 列表，这两者在启动时
   读取，所以运行中的进程仍持有启动时的插件集合。**patch 内容**是例外：profile 的 patch 层在长驻界面上是
   **热重载**的（dsh 对 profile patch 层自己的说法；真机 web profile 也声明了 `"patchReload": "live"`），
   所以改动 patch 文件——包括本包自己的 `cordis.patch.yml`——无需重启即可生效。
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
长这样（这里是节选：真机里还有 `dsh-better-sidebar` 等其他 bundle，`dsh` 之外的其他字段也一并省略）：

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
- **路由拒绝会话的思考级别时，会重试一次**：若钉住的审查路由不支持该会话正在使用的思考级别，这次审查
  不会就此结束——插件会报告该级别与确切路由，然后**不带思考级别**重试这次审查。调用仍然会被审查，
  而不是因为审查者根本没机会考虑的理由被拒绝。这是一次重试，不是兜底链：重试本身若失败，这次审查
  仍然是失败（审查保持 fail-closed）。
- **每次访问只问一次**：某个会话处于 Auto review 且没有记录时，选择器会自动弹出。这份记忆是组件内的
  状态、不是落盘的标记：每个会话每次页面加载问一次；刷新页面会再问一次（因为记录仍然缺失，仍然表示
  「跟随」）。

## 升级 dsh

`package.json` 里的 peer 是**精确**版本。升级 `dsh` 后，版本不匹配是在 **bundle 准入**时被发现的：
本包是 profile **bundle**（`package.json` 声明了 `dsh.bundle.patch`，所以它出现在 `dsh.profile.bundles`
里），而 bundle 不是插件行，行级准入根本不会读它的 peer。不兼容的 bundle 会被**跳过**；跳过发生在它的层
被装配之前，因此本包的 `cordis.patch.yml` 不参与装配、插件直接不存在——fail-safe，绝不会半加载。
标准错误输出是：

```
dsh: skipping profile bundle "dsh-auto-review-plus": Error: Plugin dsh-auto-review-plus@0.1.0 is incompatible with dsh <新的版本>: peerDependencies {...}. Running it may cause crashes or data loss. Update the plugin or install a plugin version compatible with this dsh runtime. To accept this risk explicitly, grant the exact-version exemption for dsh-auto-review-plus@0.1.0 on dsh <新的版本> with `dsh plugin allow-version` or the plugin manager, then retry the installation or restart dsh. Exact-version exemption: not active.
```

（`{...}` 代表完整的 `@deepseek-ai/dsh-*` peer 映射。）`dsh: disabling profile plugin row "…"` 是**另一条**
兼容性消息：它属于行级准入，而后者只看装配产出的行。它不可能点到本包——bundle 被跳过时，那条 patch 从未
插入 `auto-review-plus` 行——所以两条消息在构造上互斥。

两种补救：

- **给这个精确版本开豁免** —— 最快，沿用现有构建。豁免是**两端都精确**的：一个包版本 + 一个 dsh 版本。
  ```bash
  npx -y @deepseek-ai/dsh plugin --profile web allow-version dsh-auto-review-plus@0.1.0 --dsh-version <新的-dsh-版本> --accept-risk
  npx -y @deepseek-ai/dsh plugin --profile web version-exemptions
  npx -y @deepseek-ai/dsh plugin --profile web revoke-version dsh-auto-review-plus@0.1.0 --dsh-version <新的-dsh-版本>
  ```
  `allow-version` 会先警告：允许不兼容的插件版本可能破坏应用或损坏数据。请在你接受该风险时再执行。
  **bundle 准入同样会读这份豁免**，所以这一条命令也能清掉上面这条路径（警告文案本身就点名了这个命令）。
- **改 peer 版本** —— 受支持的路径：更新 `package.json` 里的 `@deepseek-ai/dsh-*` 版本，执行
  `npm install && npm run build`，提交重新生成的 `lib/`，升版本、打 tag、重新安装。

## 重装或升级本包

`file:`（tarball）依赖在包管理器里**不记 integrity**，所以"同路径同版本"的重装会被**静默跳过**：你仍然
在跑旧代码，而且没有任何报错。因此版本号必须一直往前走：

- **开发期**：递增 `-dev.N` 后缀（`0.1.0-dev.1` → `0.1.0-dev.2` …），让每次重建都是不同版本。
- **正式发布**：递增版本本身（`0.1.0` → `0.1.1`）并打 tag。

### 发布（维护者）

`npm publish` **默认关闭**，所以推发布 tag 就是一次纯粹的 GitHub 优先发布：`publish` 工作流照样跑完全部校验
（install → typecheck → test → build → 整 `lib/` 漂移校验 → tag 与 `package.json` 版本比对 → 打包清单守卫），
然后**停在上传之前**，并在日志里打印一条说明。要打开上传，把仓库**变量** `NPM_PUBLISH_ENABLED` 设为 `true`
（Settings → Secrets and variables → Actions → Variables）；从此推 tag 时，每次发布也会同步发到 npm，
无需 token，带 provenance。

**首发**是一次性的人工 bootstrap，必须在设置该变量**之前**完成：npm 的 Trusted Publishing 是包作用域的，
且 npm 不允许用 OIDC 创建尚不存在的包，所以需要有人先从 tag checkout 手动 `npm publish --access public`
一次，并在 npmjs.com 上配置 trusted publisher。`workflow_dispatch` 的空跑路径不受该开关影响，全程可用。

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

## 故障与排查

### Auto review 选项消失，或会话拒绝恢复

本包用自己的 patch 停用了官方的 `auto-review` 行，所以**只有本包这一行成功挂载时，Auto review 才存在**。
如果这一行挂载失败——最常见的是 `storageDomain` 服务缺失，或审查路由的存储域 `open` 失败——官方那一行
仍然是被停用的，而没有任何东西接替它。宿主半是**先开域、后注册 preset** 的（域打不开就不会对外宣告这个
准入口），所以存储故障的表现正好就是这个形状。

- **现象**：新会话的权限控件里**看不到 Auto review**；已经处于 Auto review 的会话在**恢复时会响亮报错**
  ——它存的 preset 需要活的集成，`permissionPresets.pinInitialPermission` 会拒绝，错误信息为
  `permission: cannot restore preset "auto" without its active integration`。
- **这是可见的失败，不是静默失败**：选项从界面上消失，恢复路径会抛错；这期间没有任何调用被审查。
- **如何确认**：在 `dsh web` 的日志里找本包的挂载/注册诊断（加载器把它记为 `auto-review-plus`；
  `storageDomain.open` 失败是重点要找的错误），并用
  `npx -y @deepseek-ai/dsh plugin --profile web list` 确认本包究竟装没装上。
- **如何回到可用的 Auto review**：修掉报出来的原因（通常是存储服务，或 `$DSH_HOME/storages` 下的数据
  目录），然后重启 `dsh web`。卸载本包同样能立刻恢复官方 Auto review：那条 `disabled: true` 的 patch 是
  随本包发布的，卸载它就会重新启用官方行。

### 包装上了但没有接管

见[必须停用官方 Auto review](#必须停用官方-auto-review强制)：日志里的
`auto-review-plus: cannot take over the "auto" preset …` 说明官方那一行仍然生效，属于
`dsh.profile.bundles` 的顺序问题。

## 已知限制

- **每个浏览器进程有两份 permission catalog 读取器。** 本插件自己维护一份 catalog 目录，官方
  `@deepseek-ai/dsh-client-ui-permission-presets` 也维护一份（它仍然拥有设置页那一行和 `/permission`
  弹框）。两者都订阅 `permission-presets/catalog-changed`，所以每次目录变更会多一次 Remote 读取。
  共享是不可能的：该包的 `client` 入口只导出插件的 `apply`/`inject`，不导出它自己的目录，共享就等于依赖
  它的非导出内部实现。作为已知成本接受。
- **输入框席位是按优先级抢占的，不是预留的。** `conversation.input.permission` 是单占用 cell，本插件以
  `priority: -1` 渲染。同一个 cell 上**不同优先级**的条目是共存的，且**最低的存活条目渲染**：因此第三方以
  更低优先级（例如 `-2`）注册会**静默**赢得该 cell——既不是本控件渲染，也不是官方控件渲染，审查模型
  选择器因此不可达。只有**恰好同优先级**的注册才会冲突——那一次会抛错，本插件的 fiber 起不来，官方控件
  （默认优先级 `0`）继续渲染。两条路径都不会让应用崩溃，只有第一条会让选择器消失。
- **不要在 `dsh` 运行时删除 `$DSH_HOME/storages/auto_review_plus`。** 运行中的进程读写的是域的内存表，
  那份 per-record 目录只是它的持久化投影，所以在域存活时抽掉底层文件只会让下一次写入困惑。请先停掉
  `dsh`，删除目录，再重启。（「这份状态不在会话日志里」是另一件事、也是有意的决定，见下。）

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
