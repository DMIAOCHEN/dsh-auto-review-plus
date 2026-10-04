/**
 * Dictionaries owned by this plugin's client half.
 *
 * {@link PERMISSION_ACCESS_NS} carries the ported current-session picker copy
 * (the verbatim upstream `permission.access` dictionaries plus the
 * reviewer-route keys this plugin adds). {@link en} is NOT a registered
 * namespace: it holds the shipped `settings.permission` labels the ported
 * presentation helper falls back to when the host offers no localized preset
 * name, which is why it is the only dictionary here that nothing registers.
 */

/**
 * Locale namespace owned by this plugin's current-session permission picker.
 *
 * Upstream (0.2.0-rc.2) names it `permission.access`; this plugin must not:
 * `ctx.locale.register` throws when a namespace already carries a locale
 * (`locale namespace "permission.access" already has locale "zh"`), and the
 * shipped `@deepseek-ai/dsh-client-ui-permission-presets` client registers that
 * namespace unconditionally. Shadowing its slot therefore requires owning a
 * namespace of our own; the dictionaries below are the verbatim upstream copy,
 * so every rendered label is unchanged.
 */
export const PERMISSION_ACCESS_NS = 'autoReviewPlus.permission'

/** The shipped `settings.permission` namespace key union. */
export type PermissionSettingsKey =
  | 'title'
  | 'description'
  | 'loading'
  | 'unavailable'
  | 'preset.readOnly'
  | 'preset.workspaceWrite'
  | 'preset.fullAccess'
  | 'confirm.title'
  | 'confirm.description'
  | 'confirm.acknowledge'
  | 'confirm.cancel'
  | 'confirm.enable'

/** English labels of the shipped settings row, used as the preset fallbacks. */
export const en = {
  'title': 'Permission',
  'description': 'Choose the default permission mode for new sessions',
  'loading': 'Loading',
  'unavailable': 'Unavailable',
  'preset.readOnly': 'Read Only',
  'preset.workspaceWrite': 'Workspace Write',
  'preset.fullAccess': 'Full access',
  'confirm.title': 'Enable Full access?',
  'confirm.description': 'Full access lets new sessions reduce confirmation steps and perform more actions directly, including sensitive operations, file changes, or external commands. Only use it when you trust subsequent tasks.',
  'confirm.acknowledge': 'I understand the risks and want to continue',
  'confirm.cancel': 'Cancel',
  'confirm.enable': 'Enable Full access',
} satisfies Record<PermissionSettingsKey, string>

/** Simplified Chinese dictionary for the current-session popup gate. */
export const accessZh = {
  'mode': '访问模式，当前：{name}',
  'close': '关闭',
  'preset.readOnly': '仅可查看',
  'preset.workspaceWrite': '工作区内修改',
  'preset.fullAccess': '完全权限',
  'confirm.title': '确认启用完全权限？',
  'confirm.description': '启用完全权限后，智能体将减少确认步骤，并且可以直接执行更多操作，包括敏感操作、文件修改或外部命令。仅建议在你信任当前任务时使用。',
  'confirm.acknowledge': '我已了解风险，并愿意继续',
  'confirm.cancel': '取消',
  'confirm.enable': '启用完全权限',
  'auto.label': 'Auto review',
  'auto.badge': 'EXP',
  'auto.description': '无沙箱运行；每次原生工具调用和 PTC 内层调用前由同一模型进行实验性审查。',
  'auto.confirm.title': '确认启用 Auto review（实验）？',
  'auto.confirm.description': 'Auto review 不使用沙箱。每次原生工具调用和 PTC 内层调用前，都会由与当前 agent 相同的模型进行审查；审查拒绝的调用由你批准或拒绝。此功能仍属实验性，可能误放行或误拒绝，并会消耗额外 token。',
  'auto.confirm.acknowledge': '我已了解这些风险，并愿意继续',
  'auto.confirm.enable': '启用 Auto review',
  'auto.confirm.reviewerHint': '可指定用哪个模型做审查；本会话内固定生效，重开此弹框可改回跟随会话模型。',
  'reviewerRoute.title': '审查模型',
  'reviewerRoute.followSession': '跟随当前会话模型',
  'reviewerRoute.provider': '服务商',
  'reviewerRoute.model': '模型',
  'reviewerRoute.reasoning': '思考级别',
  'reviewerRoute.noReasoning': '该模型不暴露思考级别',
  'reviewerRoute.unknownReasoning': '思考级别未知',
  'reviewerRoute.noModels': '该服务商没有可用模型',
  'reviewerRoute.unknownRoute': '该路由不可用',
  'reviewerRoute.loading': '加载中',
  'reviewerRoute.confirm': '确定',
} satisfies Record<string, string>

/** Current-session popup-gate key union. */
export type PermissionAccessKey = keyof typeof accessZh

/** English dictionary for the current-session popup gate. */
export const accessEn = {
  'mode': 'Access mode, current: {name}',
  'close': 'Close',
  'preset.readOnly': 'Read Only',
  'preset.workspaceWrite': 'Workspace Write',
  'preset.fullAccess': 'Full access',
  'confirm.title': 'Enable Full access?',
  'confirm.description': 'Full access reduces confirmation steps and lets the agent perform more actions directly, including sensitive operations, file changes, or external commands. Only use it when you trust the current task.',
  'confirm.acknowledge': 'I understand the risks and want to continue',
  'confirm.cancel': 'Cancel',
  'confirm.enable': 'Enable Full access',
  'auto.label': 'Auto review',
  'auto.badge': 'EXP',
  'auto.description': 'Run without a sandbox after an experimental same-model review of every native tool call and PTC inner call.',
  'auto.confirm.title': 'Enable Auto review (experimental)?',
  'auto.confirm.description': 'Auto review runs without a sandbox. Before every native tool call and PTC inner call, the same model as the current agent reviews whether to allow it; you approve or reject each call it denies. This feature is experimental, can falsely allow or deny actions, and uses additional tokens.',
  'auto.confirm.acknowledge': 'I understand these risks and want to continue',
  'auto.confirm.enable': 'Enable Auto review',
  'auto.confirm.reviewerHint': 'You can choose which model reviews this session. The choice is fixed for this session; reopen this dialog to follow the session model again.',
  'reviewerRoute.title': 'Review model',
  'reviewerRoute.followSession': 'Follow the current session model',
  'reviewerRoute.provider': 'Provider',
  'reviewerRoute.model': 'Model',
  'reviewerRoute.reasoning': 'Reasoning levels',
  'reviewerRoute.noReasoning': 'This model exposes no reasoning levels',
  'reviewerRoute.unknownReasoning': 'Reasoning levels unknown',
  'reviewerRoute.noModels': 'This provider offers no models',
  'reviewerRoute.unknownRoute': 'This route is unavailable',
  'reviewerRoute.loading': 'Loading',
  'reviewerRoute.confirm': 'Confirm',
} satisfies Record<PermissionAccessKey, string>
