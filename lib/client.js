window.__ModuleLoader__.load({
	id: "dsh-auto-review-plus",
	factory: (require) => {
		"use strict";
		var module = { exports: {} };
		var exports = module.exports;
//#region rolldown:runtime
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));

//#endregion
const __deepseek_ai_dsh_client_store = __toESM(require("@deepseek-ai/dsh-client-store"));
const react = __toESM(require("react"));
const __deepseek_ai_dsh_client_ui_primitives = __toESM(require("@deepseek-ai/dsh-client-ui-primitives"));
const react_jsx_runtime = __toESM(require("react/jsx-runtime"));

//#region src/client/catalog.ts
/** One latest-result-wins catalog reader for the whole browser process. */
var PermissionCatalogDirectory = class {
	/** Complete snapshot consumed by both the slash popup and composer seat. */
	store = (0, __deepseek_ai_dsh_client_store.createSnapshotStore)({ value: null });
	/**
	* One tick per invalidation (a catalog notification or a connection-generation
	* change), published before the replacement read starts. Consumers that must
	* drop displayed options subscribe here instead of to {@link store}, whose
	* publications also settle a read a displayed surface is waiting for.
	*/
	invalidations = (0, __deepseek_ai_dsh_client_store.createSnapshotStore)({ count: 0 });
	connection;
	stopCatalog;
	stopGeneration;
	generationId;
	initialized = false;
	epoch = 0;
	pending;
	failure = new Error("permission catalog has no complete value");
	disposed = false;
	/**
	* Subscribe to both invalidation sources before the first read, closing the
	* install/read race.
	* @param ctx - root Client context carrying Remote and Connection.
	*/
	constructor(ctx) {
		this.ctx = ctx;
		this.connection = ctx.get("connection");
		this.stopCatalog = ctx.remote.$on("permission-presets/catalog-changed", () => {
			this.invalidate();
			this.refresh();
		});
		this.stopGeneration = this.connection.generation.subscribe(() => {
			this.syncGeneration();
		});
		this.syncGeneration();
	}
	/**
	* Publish one invalidation tick for consumers holding displayed options.
	* Neither caller can run after disposal: `dispose()` unsubscribes the
	* catalog-changed listener, and `syncGeneration()` returns early when the
	* directory is disposed.
	*/
	invalidate() {
		this.invalidations.set({ count: this.invalidations.getSnapshot().count + 1 });
	}
	/** Force a fresh complete read for the active connection generation. */
	refresh() {
		if (this.disposed) return;
		const generationId = this.connection.generation.getSnapshot()?.id;
		if (generationId === void 0) return;
		if (generationId !== this.generationId) {
			this.syncGeneration();
			return;
		}
		this.startRead(generationId);
	}
	/**
	* Resolve a complete current-generation catalog for an imperative popup
	* open. An active refresh settles before a retained value can be reused.
	* @returns The active Host generation's complete permission catalog.
	*/
	async load() {
		if (this.pending === void 0 && this.store.getSnapshot().value === null) this.refresh();
		while (!this.disposed) {
			const generationId = this.connection.generation.getSnapshot()?.id;
			if (generationId === void 0) throw new Error("permission catalog has no active Host connection");
			if (generationId !== this.generationId) this.syncGeneration();
			const pending = this.pending;
			if (pending !== void 0) {
				await pending;
				continue;
			}
			const state = this.store.getSnapshot();
			if (state.value !== null) return state.value;
			throw this.failure;
		}
		throw new Error("permission catalog directory is disposed");
	}
	/** Stop subscriptions and revoke every late settlement's write access. */
	dispose() {
		if (this.disposed) return;
		this.disposed = true;
		++this.epoch;
		this.pending = void 0;
		this.stopGeneration();
		this.stopCatalog();
	}
	/** Observe generation loss/replacement and hard-clear the old Host value. */
	syncGeneration() {
		if (this.disposed) return;
		const generationId = this.connection.generation.getSnapshot()?.id;
		if (this.initialized && generationId === this.generationId) return;
		if (this.initialized) this.invalidate();
		this.initialized = true;
		this.generationId = generationId;
		++this.epoch;
		this.pending = void 0;
		this.failure = new Error("permission catalog has no complete value");
		this.store.set({ value: null });
		if (generationId !== void 0) this.startRead(generationId);
	}
	/** Start one independent read; the newest epoch in the same generation wins. */
	startRead(generationId) {
		const epoch = ++this.epoch;
		this.failure = new Error("permission catalog has no complete value");
		const operation = this.ctx.remote.permissionPresets.catalog().then((result) => {
			if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
			if (!this.accepts(epoch, generationId)) return;
			this.store.set({ value: result.value });
		}).catch((error) => {
			if (!this.accepts(epoch, generationId)) return;
			this.failure = error instanceof Error ? error : new Error(String(error));
			this.store.set({ value: null });
		}).finally(() => {
			if (this.pending === operation) this.pending = void 0;
		});
		this.pending = operation;
	}
	/** Fence by disposal, refresh epoch, and the actual Connection generation. */
	accepts(epoch, generationId) {
		return !this.disposed && epoch === this.epoch && generationId === this.generationId && this.connection.generation.getSnapshot()?.id === generationId;
	}
};

//#endregion
//#region src/client/locales.ts
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
const PERMISSION_ACCESS_NS = "autoReviewPlus.permission";
/** English labels of the shipped settings row, used as the preset fallbacks. */
const en = {
	"title": "Permission",
	"description": "Choose the default permission mode for new sessions",
	"loading": "Loading",
	"unavailable": "Unavailable",
	"preset.readOnly": "Read Only",
	"preset.workspaceWrite": "Workspace Write",
	"preset.fullAccess": "Full access",
	"confirm.title": "Enable Full access?",
	"confirm.description": "Full access lets new sessions reduce confirmation steps and perform more actions directly, including sensitive operations, file changes, or external commands. Only use it when you trust subsequent tasks.",
	"confirm.acknowledge": "I understand the risks and want to continue",
	"confirm.cancel": "Cancel",
	"confirm.enable": "Enable Full access"
};
/** Simplified Chinese dictionary for the current-session popup gate. */
const accessZh = {
	"mode": "访问模式，当前：{name}",
	"close": "关闭",
	"preset.readOnly": "仅可查看",
	"preset.workspaceWrite": "工作区内修改",
	"preset.fullAccess": "完全权限",
	"confirm.title": "确认启用完全权限？",
	"confirm.description": "启用完全权限后，智能体将减少确认步骤，并且可以直接执行更多操作，包括敏感操作、文件修改或外部命令。仅建议在你信任当前任务时使用。",
	"confirm.acknowledge": "我已了解风险，并愿意继续",
	"confirm.cancel": "取消",
	"confirm.enable": "启用完全权限",
	"auto.label": "Auto review",
	"auto.badge": "EXP",
	"auto.description": "无沙箱运行；每次原生工具调用和 PTC 内层调用前由同一模型进行实验性审查。",
	"auto.confirm.title": "确认启用 Auto review（实验）？",
	"auto.confirm.description": "Auto review 不使用沙箱。每次原生工具调用和 PTC 内层调用前，都会由与当前 agent 相同的模型进行审查；审查拒绝的调用由你批准或拒绝。此功能仍属实验性，可能误放行或误拒绝，并会消耗额外 token。",
	"auto.confirm.acknowledge": "我已了解这些风险，并愿意继续",
	"auto.confirm.enable": "启用 Auto review",
	"auto.confirm.reviewerHint": "可指定用哪个模型做审查；本会话内固定生效，重开此弹框可改回跟随会话模型。",
	"reviewerRoute.title": "审查模型",
	"reviewerRoute.followSession": "跟随当前会话模型",
	"reviewerRoute.provider": "服务商",
	"reviewerRoute.model": "模型",
	"reviewerRoute.reasoning": "思考级别",
	"reviewerRoute.noReasoning": "该模型不暴露思考级别",
	"reviewerRoute.unknownRoute": "该路由不可用",
	"reviewerRoute.loading": "加载中",
	"reviewerRoute.confirm": "确定"
};
/** English dictionary for the current-session popup gate. */
const accessEn = {
	"mode": "Access mode, current: {name}",
	"close": "Close",
	"preset.readOnly": "Read Only",
	"preset.workspaceWrite": "Workspace Write",
	"preset.fullAccess": "Full access",
	"confirm.title": "Enable Full access?",
	"confirm.description": "Full access reduces confirmation steps and lets the agent perform more actions directly, including sensitive operations, file changes, or external commands. Only use it when you trust the current task.",
	"confirm.acknowledge": "I understand the risks and want to continue",
	"confirm.cancel": "Cancel",
	"confirm.enable": "Enable Full access",
	"auto.label": "Auto review",
	"auto.badge": "EXP",
	"auto.description": "Run without a sandbox after an experimental same-model review of every native tool call and PTC inner call.",
	"auto.confirm.title": "Enable Auto review (experimental)?",
	"auto.confirm.description": "Auto review runs without a sandbox. Before every native tool call and PTC inner call, the same model as the current agent reviews whether to allow it; you approve or reject each call it denies. This feature is experimental, can falsely allow or deny actions, and uses additional tokens.",
	"auto.confirm.acknowledge": "I understand these risks and want to continue",
	"auto.confirm.enable": "Enable Auto review",
	"auto.confirm.reviewerHint": "You can choose which model reviews this session. The choice is fixed for this session; reopen this dialog to follow the session model again.",
	"reviewerRoute.title": "Review model",
	"reviewerRoute.followSession": "Follow the current session model",
	"reviewerRoute.provider": "Provider",
	"reviewerRoute.model": "Model",
	"reviewerRoute.reasoning": "Reasoning levels",
	"reviewerRoute.noReasoning": "This model exposes no reasoning levels",
	"reviewerRoute.unknownRoute": "This route is unavailable",
	"reviewerRoute.loading": "Loading",
	"reviewerRoute.confirm": "Confirm"
};

//#endregion
//#region src/client/presentation.ts
/** Machine value of the preset that requires an explicit GUI risk gate. */
const FULL_ACCESS_PRESET = "danger-full-access";
/** Machine value of the experimental current-session review preset. */
const AUTO_REVIEW_PRESET = "auto";
const PRESET_LABEL_KEYS = new Map([
	["read-only", "preset.readOnly"],
	["workspace-write", "preset.workspaceWrite"],
	[FULL_ACCESS_PRESET, "preset.fullAccess"]
]);
const DEFAULT_PRESET_LABELS = {
	"preset.readOnly": en["preset.readOnly"],
	"preset.workspaceWrite": en["preset.workspaceWrite"],
	"preset.fullAccess": en["preset.fullAccess"]
};
/**
* Convert conventional kebab-case preset names into user-facing title case.
* @param name - host-supplied preset label or key.
* @returns the title-cased conventional key, or a non-kebab label unchanged.
*/
function displayPresetName(name) {
	if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) return name;
	return name.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}
/**
* Render a permission preset under its product label.
* @param value - preset machine value.
* @param name - host-supplied preset name.
* @param t - optional locale dictionary lookup for built-in product labels.
* @returns the built-in product label or the conventional display name.
*/
function displayPermissionPreset(value, name, t) {
	const key = PRESET_LABEL_KEYS.get(value);
	if (key !== void 0 && (name === value || name === DEFAULT_PRESET_LABELS[key])) return t?.(key) ?? DEFAULT_PRESET_LABELS[key];
	return displayPresetName(name);
}

//#endregion
//#region \0dsh-css:src/client/ReviewerRoutePicker.module.css.mjs
const css$2 = "/* The reviewer-model chooser rows. Rendered inside the primitives' dialog, so\n   only the chooser's own stack and its two native selects are styled here. */\n\n.632ba0_picker {\n  display: flex;\n  flex-direction: column;\n  gap: 10px;\n  margin-top: 12px;\n}\n\n.632ba0_field {\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n}\n\n.632ba0_label {\n  font-size: 12px;\n  opacity: 0.7;\n}\n\n.632ba0_select {\n  width: 100%;\n  min-height: 28px;\n  padding: 3px 6px;\n  border: 1px solid color-mix(in srgb, currentColor 22%, transparent);\n  border-radius: 6px;\n  background: transparent;\n  color: inherit;\n  font: inherit;\n}\n\n.632ba0_select:disabled {\n  opacity: 0.6;\n}\n\n.632ba0_capability {\n  margin: 0;\n  font-size: 12px;\n  opacity: 0.7;\n}\n";
const tagId$2 = "dsh-auto-review-plus/ReviewerRoutePicker.module.css";
if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$2) + "]") === null) {
	const tag = document.createElement("style");
	tag.dataset.plugin = "dsh-auto-review-plus";
	tag.dataset.pluginCss = tagId$2;
	tag.textContent = css$2;
	document.head.appendChild(tag);
}
var ReviewerRoutePicker_module_css_default = {
	"picker": "632ba0_picker",
	"field": "632ba0_field",
	"label": "632ba0_label",
	"select": "632ba0_select",
	"capability": "632ba0_capability"
};

//#endregion
//#region src/client/ReviewerRoutePicker.tsx
/** Compare two routes (null is the follow state, not a missing value). */
function sameRoute(left, right) {
	if (left === null || right === null) return left === right;
	return left.provider === right.provider && left.model === right.model;
}
/** Project one parent value into the chooser's selection. */
function selectionOf(value) {
	return value === null ? { kind: "follow" } : {
		kind: "custom",
		provider: value.provider,
		model: value.model
	};
}
/**
* Render the reviewer-model chooser.
* @param props - see {@link ReviewerRoutePickerProps}.
* @returns the chooser's form rows.
*/
function ReviewerRoutePicker({ value, sessionRoute, providers, models, reasoningEfforts, disabled, t, onProviderChange, onChange }) {
	const [selection, setSelection] = (0, react.useState)(() => selectionOf(value));
	const reported = (0, react.useRef)(value);
	(0, react.useEffect)(() => {
		if (sameRoute(value, reported.current)) return;
		reported.current = value;
		setSelection(selectionOf(value));
	}, [value]);
	const report = (next) => {
		reported.current = next;
		onChange(next);
	};
	(0, react.useEffect)(() => {
		if (selection.kind !== "custom" || selection.model !== "") return;
		const [first] = models;
		if (first === void 0) return;
		const next = {
			provider: selection.provider,
			model: first.id
		};
		setSelection({
			kind: "custom",
			...next
		});
		report(next);
	}, [models, selection]);
	const chooseProvider = (next) => {
		if (next === "") {
			setSelection({ kind: "follow" });
			report(null);
			return;
		}
		setSelection({
			kind: "custom",
			provider: next,
			model: ""
		});
		onProviderChange(next);
		report(null);
	};
	const chooseModel = (model) => {
		if (selection.kind !== "custom") return;
		setSelection({
			kind: "custom",
			provider: selection.provider,
			model
		});
		report({
			provider: selection.provider,
			model
		});
	};
	const providerValue = selection.kind === "follow" ? "" : selection.provider;
	const modelValue = selection.kind === "custom" ? selection.model : "";
	const customModel = selection.kind === "custom" && selection.model !== "" ? selection.model : "";
	const missingProvider = providerValue !== "" && !providers.some((provider) => provider.id === providerValue);
	const missingModel = customModel !== "" && !models.some((model) => model.id === customModel);
	const sessionRouteLabel = sessionRoute === null ? t("reviewerRoute.followSession") : `${sessionRoute.provider} / ${sessionRoute.model}`;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: ReviewerRoutePicker_module_css_default.picker,
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
				className: ReviewerRoutePicker_module_css_default.field,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: ReviewerRoutePicker_module_css_default.label,
					children: t("reviewerRoute.provider")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
					className: ReviewerRoutePicker_module_css_default.select,
					disabled,
					value: providerValue,
					onChange: (event) => {
						chooseProvider(event.currentTarget.value);
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
							value: "",
							children: t("reviewerRoute.followSession")
						}),
						providers.map((provider) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
							value: provider.id,
							children: provider.name
						}, provider.id)),
						missingProvider ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
							value: providerValue,
							children: t("reviewerRoute.unknownRoute")
						}) : null
					]
				})]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
				className: ReviewerRoutePicker_module_css_default.field,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: ReviewerRoutePicker_module_css_default.label,
					children: t("reviewerRoute.model")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
					className: ReviewerRoutePicker_module_css_default.select,
					disabled: disabled || selection.kind === "follow" || models.length === 0 && !missingModel,
					value: modelValue,
					onChange: (event) => {
						chooseModel(event.currentTarget.value);
					},
					children: [
						selection.kind === "follow" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
							value: "",
							children: sessionRouteLabel
						}) : null,
						selection.kind === "custom" && selection.model === "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
							value: "",
							children: t("reviewerRoute.loading")
						}) : null,
						selection.kind === "custom" ? models.map((model) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
							value: model.id,
							children: model.name
						}, model.id)) : null,
						selection.kind === "custom" && missingModel ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
							value: customModel,
							children: t("reviewerRoute.unknownRoute")
						}) : null
					]
				})]
			}),
			customModel === "" ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
				className: ReviewerRoutePicker_module_css_default.capability,
				children: [`${t("reviewerRoute.reasoning")}: `, reasoningEfforts.length === 0 ? t("reviewerRoute.noReasoning") : reasoningEfforts.join(" / ")]
			})
		]
	});
}

//#endregion
//#region \0dsh-css:src/client/ReviewerRouteDialog.module.css.mjs
const css$1 = "/* The reviewer-route dialog body. The dialog chrome (card, header, footer,\n   Escape, mask) comes from ui-primitives' Modal, so only the body's own rows are\n   styled here — the risk warning mirrors the shipped confirmation's layout. */\n\n.7f194c_dialog {\n  max-width: 420px;\n}\n\n.7f194c_content {\n  display: flex;\n  flex-direction: column;\n  gap: 10px;\n}\n\n.7f194c_warning {\n  display: flex;\n  gap: 8px;\n  align-items: flex-start;\n}\n\n.7f194c_warningIcon {\n  flex: none;\n  margin-top: 2px;\n}\n\n.7f194c_warning p {\n  margin: 0;\n}\n\n.7f194c_hint {\n  margin: 0;\n  font-size: 12px;\n  opacity: 0.75;\n}\n\n.7f194c_failure {\n  margin: 0;\n  font-size: 12px;\n  color: #d9534f;\n}\n\n.7f194c_capability {\n  margin: 0;\n  font-size: 12px;\n  opacity: 0.7;\n}\n\n.7f194c_acknowledgement {\n  display: flex;\n  gap: 8px;\n  align-items: center;\n  margin-top: 4px;\n}\n\n.7f194c_action,\n.7f194c_confirmAction {\n  min-width: 96px;\n}\n";
const tagId$1 = "dsh-auto-review-plus/ReviewerRouteDialog.module.css";
if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
	const tag = document.createElement("style");
	tag.dataset.plugin = "dsh-auto-review-plus";
	tag.dataset.pluginCss = tagId$1;
	tag.textContent = css$1;
	document.head.appendChild(tag);
}
var ReviewerRouteDialog_module_css_default = {
	"dialog": "7f194c_dialog",
	"content": "7f194c_content",
	"warning": "7f194c_warning",
	"warningIcon": "7f194c_warningIcon",
	"hint": "7f194c_hint",
	"failure": "7f194c_failure",
	"capability": "7f194c_capability",
	"acknowledgement": "7f194c_acknowledgement",
	"action": "7f194c_action",
	"confirmAction": "7f194c_confirmAction"
};

//#endregion
//#region src/client/ReviewerRouteDialog.tsx
/**
* Render the reviewer-route dialog.
* @param props - see {@link ReviewerRouteDialogProps}.
* @returns the dialog tree, or null while closed.
*/
function ReviewerRouteDialog({ open, title, confirmLabel, risk, loading, disabled, failure, value, sessionRoute, providers, models, reasoningEfforts, t, onProviderChange, onChange, onCancel, onConfirm }) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(__deepseek_ai_dsh_client_ui_primitives.Modal, {
		open,
		onClose: onCancel,
		title,
		closeLabel: t("close"),
		className: ReviewerRouteDialog_module_css_default.dialog,
		contentClassName: ReviewerRouteDialog_module_css_default.content,
		footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.Button, {
			variant: "outline",
			className: ReviewerRouteDialog_module_css_default.action,
			onClick: onCancel,
			children: t("confirm.cancel")
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.Button, {
			variant: "primary",
			className: ReviewerRouteDialog_module_css_default.confirmAction,
			disabled: disabled || risk !== void 0 && !risk.acknowledged,
			onClick: onConfirm,
			children: confirmLabel
		})] }),
		children: [
			risk === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: ReviewerRouteDialog_module_css_default.warning,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.IconWarningOutlineRegular, {
					size: 18,
					className: ReviewerRouteDialog_module_css_default.warningIcon
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: risk.description })]
			}),
			risk === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: ReviewerRouteDialog_module_css_default.hint,
				children: t("auto.confirm.reviewerHint")
			}),
			failure === null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: ReviewerRouteDialog_module_css_default.failure,
				role: "alert",
				children: failure
			}),
			loading ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: ReviewerRouteDialog_module_css_default.capability,
				children: t("reviewerRoute.loading")
			}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ReviewerRoutePicker, {
				value,
				sessionRoute,
				providers,
				models,
				reasoningEfforts,
				disabled,
				t,
				onProviderChange,
				onChange
			}),
			risk === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
				className: ReviewerRouteDialog_module_css_default.acknowledgement,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
					type: "checkbox",
					checked: risk.acknowledged,
					disabled,
					"data-modal-autofocus": true,
					onChange: (event) => {
						risk.onAcknowledgedChange(event.currentTarget.checked);
					}
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: risk.acknowledgeLabel })]
			})
		]
	});
}

//#endregion
//#region src/client/reviewer-route-prompt.ts
/**
* Decide whether Auto must ask for a reviewer model now.
*
* All three conditions are required: no pin, never asked for this session, and
* no dialog already up. The prompt exists to make the choice once, so it must
* not reappear after the person declined it, answered it, or while another
* confirmation owns the screen.
* @param input - current route knowledge and prompt state.
* @returns whether the prompt opens now.
*/
function shouldPromptReviewerRoute(input) {
	return input.route === null && !input.answered && !input.dialogOpen;
}
/**
* In-memory record of the sessions that were already asked once.
*
* Component memory on purpose: the question is a per-visit one, it writes
* nothing anywhere, and it disappears with the control (a reload asks again,
* because a stale pin still does not exist).
*/
var ReviewerRoutePrompts = class {
	answered = new Set();
	/**
	* Record that one session was asked, whichever way it answered.
	* @param sessionId - session whose prompt ran.
	*/
	answer(sessionId) {
		this.answered.add(sessionId);
	}
	/**
	* Whether one session was already asked.
	* @param sessionId - session to read.
	* @returns true once {@link answer} ran for that session.
	*/
	isAnswered(sessionId) {
		return this.answered.has(sessionId);
	}
};

//#endregion
//#region src/client/use-reviewer-route.ts
/** Render an unknown rejection as one line of copy. */
function messageOf(error) {
	return error instanceof Error ? error.message : String(error);
}
/**
* Subscribe one session's reviewer-route data while a surface needs it.
* @param api - injected reviewer-route face of this plugin's host half.
* @param sessionId - session whose route is being chosen.
* @param enabled - whether a surface showing the chooser is open.
* @returns the loaded values and their loaders.
*/
function useReviewerRoute(api, sessionId, enabled) {
	const [view, setView] = (0, react.useState)(null);
	const [providers, setProviders] = (0, react.useState)([]);
	const [models, setModels] = (0, react.useState)([]);
	const [reasoningEfforts, setReasoningEfforts] = (0, react.useState)([]);
	const [failure, setFailure] = (0, react.useState)(null);
	const apiRef = (0, react.useRef)(api);
	apiRef.current = api;
	const generation = (0, react.useRef)(0);
	const reload = (0, react.useCallback)(() => {
		const mine = ++generation.current;
		const current = () => generation.current === mine;
		setFailure(null);
		apiRef.current.view(sessionId).then((next) => {
			if (current()) setView(next);
		}, (error) => {
			if (!current()) return;
			setView(null);
			setFailure(messageOf(error));
		});
		apiRef.current.providers().then((next) => {
			if (current()) setProviders(next);
		}, (error) => {
			if (current()) setFailure(messageOf(error));
		});
	}, [sessionId]);
	(0, react.useEffect)(() => {
		if (!enabled) return;
		reload();
		return () => {
			generation.current += 1;
		};
	}, [enabled, reload]);
	const selectProvider = (0, react.useCallback)((provider) => {
		const mine = generation.current;
		const current = () => generation.current === mine;
		setModels([]);
		setReasoningEfforts([]);
		apiRef.current.models(provider).then((next) => {
			if (current()) setModels(next);
		}, (error) => {
			if (!current()) return;
			setModels([]);
			setFailure(messageOf(error));
		});
	}, []);
	const selectRoute = (0, react.useCallback)((route) => {
		const mine = generation.current;
		const current = () => generation.current === mine;
		setReasoningEfforts([]);
		apiRef.current.modelInfo(route.provider, route.model).then(
			// A capability read that fails is not a reason to refuse the route: the
			// host validates it on write, and the chooser then reports "no efforts".
			(info) => {
				if (current()) setReasoningEfforts(info.reasoningEfforts);
			},
			() => {
				if (current()) setReasoningEfforts([]);
			}
);
	}, []);
	return {
		view,
		providers,
		models,
		reasoningEfforts,
		failure,
		reload,
		selectProvider,
		selectRoute
	};
}

//#endregion
//#region \0dsh-css:src/client/PermissionSelect.module.css.mjs
const css = ".ca829f_trigger {\n  display: inline-flex;\n  align-items: center;\n  gap: 4px;\n  min-width: 0;\n  max-width: 220px;\n  height: 28px;\n  padding: 0 4px 0 8px;\n  border: none;\n  /* Rounded chip chrome, matching the sibling model trigger. */\n  border-radius: var(--dsw-radius-sm);\n  outline: none;\n  background: transparent;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 13px;\n  line-height: 20px;\n  font-weight: 500;\n  cursor: pointer;\n}\n\n.ca829f_trigger:hover:not(:disabled) {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.ca829f_trigger:focus-visible {\n  box-shadow: 0 0 0 2px var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));\n}\n\n.ca829f_trigger:disabled {\n  color: var(--dsw-alias-label-dimmed);\n  cursor: default;\n}\n\n.ca829f_triggerIcon {\n  display: inline-flex;\n  flex: 0 0 auto;\n}\n\n/* The shared 16px glyphs render one step smaller on the exposed trigger;\n   the dropdown rows keep the full 16px. */\n.ca829f_triggerIcon svg {\n  width: 14px;\n  height: 14px;\n}\n\n.ca829f_triggerLabel {\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.ca829f_optionLabel {\n  display: inline-flex;\n  align-items: baseline;\n  gap: 4px;\n  min-width: 0;\n  max-width: 100%;\n}\n\n.ca829f_optionLabelText {\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.ca829f_badge {\n  flex: none;\n  align-self: flex-start;\n  margin-top: -1px;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 8px;\n  line-height: 10px;\n  font-weight: 600;\n  letter-spacing: 0.2px;\n}\n\n.ca829f_chevron {\n  /* inline-flex, not inline: an inline seat reserves baseline descent under\n     the svg and floats the glyph off-center in the 28px trigger. */\n  display: inline-flex;\n  flex: 0 0 auto;\n  color: var(--dsw-alias-label-caption);\n  transition: transform 120ms ease;\n}\n\n/* Narrow composer: the trigger collapses to icon + chevron so the row keeps\n   fitting. Only triggers that actually carry a mode glyph drop their label —\n   a host-configured mode without one keeps its text as the sole identifier.\n   The 460px cut is the point where the row (attach + modes + model + send)\n   starts squeezing labels; the container is the composer row (InputBar .row —\n   anonymous query because CSS modules hash container-names per module). */\n@container (max-width: 460px) {\n  .ca829f_trigger:has(.ca829f_triggerIcon) .ca829f_triggerLabel {\n    display: none;\n  }\n}\n\n.ca829f_chevronOpen {\n  transform: rotate(180deg);\n}\n";
const tagId = "dsh-auto-review-plus/PermissionSelect.module.css";
if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
	const tag = document.createElement("style");
	tag.dataset.plugin = "dsh-auto-review-plus";
	tag.dataset.pluginCss = tagId;
	tag.textContent = css;
	document.head.appendChild(tag);
}
var PermissionSelect_module_css_default = {
	"trigger": "ca829f_trigger",
	"triggerIcon": "ca829f_triggerIcon",
	"triggerLabel": "ca829f_triggerLabel",
	"optionLabel": "ca829f_optionLabel",
	"optionLabelText": "ca829f_optionLabelText",
	"badge": "ca829f_badge",
	"chevron": "ca829f_chevron",
	"chevronOpen": "ca829f_chevronOpen"
};

//#endregion
//#region src/client/PermissionControl.tsx
/** Minimal inlined replacement for `clsx` (two class names, no object/array forms). */
function classNames(...names) {
	return names.filter((name) => typeof name === "string" && name !== "").join(" ");
}
const permissionGlyphs = new Map([
	["read-only", /* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.PermissionIconReadOnlyRegular, {})],
	["workspace-write", /* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.PermissionIconWorkspaceWriteRegular, {})],
	[FULL_ACCESS_PRESET, /* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.PermissionIconFullAccessRegular, {})]
]);
/** Glyph for a permission option value; host-configured names outside the design set get none. */
function permissionGlyph(value) {
	return permissionGlyphs.get(value);
}
function permissionLabel(value, name, t) {
	if (value === AUTO_REVIEW_PRESET) return t("auto.label");
	return displayPermissionPreset(value, name, (key) => t(key));
}
function optionBadge(value, t) {
	return value === AUTO_REVIEW_PRESET ? t("auto.badge") : void 0;
}
/** Resolve locale-owned copy for the shipped Auto option; preserve host copy for other presets. */
function optionDescription(option, t) {
	return option.value === AUTO_REVIEW_PRESET ? t("auto.description") : option.description;
}
function PermissionControl({ locked, select, usePermissionCatalog, useProjection, reviewerRoute, sessionId, t }) {
	const selection = useProjection("permissions");
	const catalog = usePermissionCatalog((state) => state.value);
	const [pick, setPick] = (0, react.useState)(null);
	const [open, setOpen] = (0, react.useState)(false);
	const [confirmation, setConfirmation] = (0, react.useState)(null);
	const [acknowledged, setAcknowledged] = (0, react.useState)(false);
	const [reviewerPrompt, setReviewerPrompt] = (0, react.useState)(false);
	const [reviewerDraft, setReviewerDraft] = (0, react.useState)(null);
	const [reviewerWriting, setReviewerWriting] = (0, react.useState)(false);
	const [reviewerWriteFailure, setReviewerWriteFailure] = (0, react.useState)(null);
	const reviewerPrompts = (0, react.useRef)(new ReviewerRoutePrompts());
	const autoActive = selection?.currentValue === AUTO_REVIEW_PRESET;
	const reviewerRouteState = useReviewerRoute(reviewerRoute, sessionId, confirmation === AUTO_REVIEW_PRESET || autoActive);
	const pinnedRoute = reviewerRouteState.view?.route;
	(0, react.useEffect)(() => {
		if (!locked && selection !== void 0 && catalog !== null && (confirmation === null || catalog.options.some((option) => option.value === confirmation))) return;
		setOpen(false);
		setAcknowledged(false);
		setConfirmation(null);
	}, [
		catalog,
		confirmation,
		locked,
		selection
	]);
	(0, react.useEffect)(() => {
		if (confirmation !== AUTO_REVIEW_PRESET && !reviewerPrompt) return;
		if (reviewerRouteState.view === null) return;
		setReviewerDraft(reviewerRouteState.view.route);
	}, [
		confirmation,
		reviewerPrompt,
		reviewerRouteState.view
	]);
	(0, react.useEffect)(() => {
		if (!autoActive) return;
		if (!shouldPromptReviewerRoute({
			route: pinnedRoute,
			answered: reviewerPrompts.current.isAnswered(sessionId),
			dialogOpen: confirmation !== null || reviewerPrompt
		})) return;
		setReviewerDraft(null);
		setReviewerWriteFailure(null);
		setReviewerPrompt(true);
	}, [
		autoActive,
		confirmation,
		pinnedRoute,
		reviewerPrompt,
		sessionId
	]);
	if (selection === void 0 || catalog === null) return null;
	const currentValue = pick !== null && catalog.options.some((option) => option.value === pick) ? pick : selection.currentValue;
	const current = catalog.options.find((option) => option.value === currentValue);
	const currentLabel = current === void 0 ? permissionLabel(currentValue, currentValue, t) : permissionLabel(current.value, current.name, t);
	const busy = pick !== null || confirmation !== null || reviewerPrompt;
	const items = catalog.options.map((option) => {
		const icon = permissionGlyph(option.value);
		const label = permissionLabel(option.value, option.name, t);
		const badge = optionBadge(option.value, t);
		return {
			id: option.value,
			label: badge === void 0 ? label : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				className: PermissionSelect_module_css_default.optionLabel,
				"aria-label": `${label} ${badge}`,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: PermissionSelect_module_css_default.optionLabelText,
					children: label
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("sup", {
					className: PermissionSelect_module_css_default.badge,
					children: badge
				})]
			}),
			...icon === void 0 ? {} : { icon }
		};
	});
	const submit = (id) => {
		setPick(id);
		select(id).catch(() => false).then(() => {
			setPick(null);
		});
	};
	const choose = (id) => {
		setOpen(false);
		if (id === selection.currentValue) {
			if (id === AUTO_REVIEW_PRESET) openReviewerPrompt();
			return;
		}
		if (id === FULL_ACCESS_PRESET || id === AUTO_REVIEW_PRESET) {
			setAcknowledged(false);
			if (id === AUTO_REVIEW_PRESET) setReviewerDraft(pinnedRoute ?? null);
			setConfirmation(id);
			return;
		}
		submit(id);
	};
	const closeConfirmation = () => {
		setAcknowledged(false);
		setConfirmation(null);
	};
	/**
	* Persist one reviewer route (null resets to following the session model).
	* The failure is reported to the caller AND left on screen, so the automatic
	* prompt can keep its dialog open instead of closing as if it had written.
	* @param route - route to pin, or null to follow the session route.
	* @returns resolution after the write, or rejection after recording its message.
	*/
	const writeReviewerRoute = (route) => {
		setReviewerWriting(true);
		setReviewerWriteFailure(null);
		return reviewerRoute.set(sessionId, route).catch((error) => {
			setReviewerWriteFailure(error instanceof Error ? error.message : String(error));
			throw error;
		}).finally(() => {
			setReviewerWriting(false);
		});
	};
	/**
	* Adopt the host's answer after a successful write, so a reopened chooser and
	* the automatic prompt read the pin that now exists.
	*/
	const acceptReviewerWrite = () => {
		reviewerRouteState.reload();
	};
	const changeReviewerDraft = (route) => {
		setReviewerDraft(route);
		if (route !== null) reviewerRouteState.selectRoute(route);
	};
	/** Open the chooser on demand (Auto is already active and wants another model). */
	const openReviewerPrompt = () => {
		reviewerRouteState.reload();
		setReviewerDraft(pinnedRoute ?? null);
		setReviewerWriteFailure(null);
		setReviewerPrompt(true);
	};
	const closeReviewerPrompt = () => {
		reviewerPrompts.current.answer(sessionId);
		setReviewerWriteFailure(null);
		setReviewerPrompt(false);
	};
	const confirmReviewerPrompt = () => {
		reviewerPrompts.current.answer(sessionId);
		writeReviewerRoute(reviewerDraft).then(() => {
			acceptReviewerWrite();
			setReviewerPrompt(false);
		}, () => void 0);
	};
	const confirmSelection = (id) => {
		const draft = reviewerDraft;
		if (id === AUTO_REVIEW_PRESET) reviewerPrompts.current.answer(sessionId);
		closeConfirmation();
		if (id !== AUTO_REVIEW_PRESET) {
			submit(id);
			return;
		}
		writeReviewerRoute(draft).then(() => {
			acceptReviewerWrite();
			submit(id);
		}, () => {
			submit(id);
		});
	};
	const confirmationTitle = confirmation === AUTO_REVIEW_PRESET ? t("auto.confirm.title") : t("confirm.title");
	const confirmationDescription = confirmation === AUTO_REVIEW_PRESET ? t("auto.confirm.description") : t("confirm.description");
	const confirmationAcknowledge = confirmation === AUTO_REVIEW_PRESET ? t("auto.confirm.acknowledge") : t("confirm.acknowledge");
	const confirmationEnable = confirmation === AUTO_REVIEW_PRESET ? t("auto.confirm.enable") : t("confirm.enable");
	const currentBadge = optionBadge(currentValue, t);
	const currentAccessibleLabel = currentBadge === void 0 ? currentLabel : `${currentLabel} ${currentBadge}`;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
		/* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.Menu, {
			open,
			items,
			selectedId: currentValue,
			onSelect: choose,
			onClose: () => {
				setOpen(false);
			},
			side: "top",
			portal: true,
			anchor: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				className: PermissionSelect_module_css_default.trigger,
				"aria-label": t("mode", { name: currentAccessibleLabel }),
				title: current === void 0 ? void 0 : optionDescription(current, t),
				disabled: locked || busy,
				onClick: () => {
					setOpen(!open);
				},
				children: [
					permissionGlyph(currentValue) !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: PermissionSelect_module_css_default.triggerIcon,
						"aria-hidden": true,
						children: permissionGlyph(currentValue)
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: PermissionSelect_module_css_default.triggerLabel,
						children: currentLabel
					}),
					currentBadge !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("sup", {
						className: PermissionSelect_module_css_default.badge,
						children: currentBadge
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: classNames(PermissionSelect_module_css_default.chevron, open && PermissionSelect_module_css_default.chevronOpen),
						"aria-hidden": true,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutlineRegular, {})
					})
				]
			})
		}),
		confirmation === AUTO_REVIEW_PRESET ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ReviewerRouteDialog, {
			open: true,
			title: confirmationTitle,
			confirmLabel: confirmationEnable,
			risk: {
				description: confirmationDescription,
				acknowledgeLabel: confirmationAcknowledge,
				acknowledged,
				onAcknowledgedChange: setAcknowledged
			},
			loading: reviewerRouteState.view === null && reviewerRouteState.failure === null,
			disabled: locked || reviewerWriting,
			failure: reviewerRouteState.failure,
			value: reviewerDraft,
			sessionRoute: reviewerRouteState.view?.sessionRoute ?? null,
			providers: reviewerRouteState.providers,
			models: reviewerRouteState.models,
			reasoningEfforts: reviewerRouteState.reasoningEfforts,
			t,
			onProviderChange: reviewerRouteState.selectProvider,
			onChange: changeReviewerDraft,
			onCancel: closeConfirmation,
			onConfirm: () => {
				confirmSelection(AUTO_REVIEW_PRESET);
			}
		}) : confirmation !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.RiskConfirmation, {
			open: true,
			title: confirmationTitle,
			description: confirmationDescription,
			acknowledgeLabel: confirmationAcknowledge,
			cancelLabel: t("confirm.cancel"),
			closeLabel: t("close"),
			confirmLabel: confirmationEnable,
			acknowledged,
			disabled: locked,
			onAcknowledgedChange: setAcknowledged,
			onCancel: closeConfirmation,
			onConfirm: () => {
				confirmSelection(confirmation);
			}
		}),
		/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ReviewerRouteDialog, {
			open: reviewerPrompt,
			title: t("reviewerRoute.title"),
			confirmLabel: t("reviewerRoute.confirm"),
			risk: void 0,
			loading: reviewerRouteState.view === null && reviewerRouteState.failure === null,
			disabled: locked || reviewerWriting,
			failure: reviewerWriteFailure ?? reviewerRouteState.failure,
			value: reviewerDraft,
			sessionRoute: reviewerRouteState.view?.sessionRoute ?? null,
			providers: reviewerRouteState.providers,
			models: reviewerRouteState.models,
			reasoningEfforts: reviewerRouteState.reasoningEfforts,
			t,
			onProviderChange: reviewerRouteState.selectProvider,
			onChange: changeReviewerDraft,
			onCancel: closeReviewerPrompt,
			onConfirm: confirmReviewerPrompt
		})
	] });
}

//#endregion
//#region src/client/remote.ts
/**
* Cordis service key AND wire namespace of the host API. Mirrors
* `REVIEWER_ROUTE_SERVICE` in `src/reviewer-route-api.ts`.
*/
const REVIEWER_ROUTE_SERVICE = "autoReviewPlus";
/**
* Build the mount-required codec for one JSON field.
*
* `create()` is never called by the mount (it validates that a strict codec
* exists; the Host decodes the wire), so this is the smallest object that
* satisfies the contract. The named `typeSymbol` keeps the endpoints
* distinguishable in diagnostics.
* @param typeSymbol - canonical type name of the field.
* @returns a strict codec that passes values through unchanged.
*/
function jsonCodec(typeSymbol) {
	return {
		mode: "strict",
		typeSymbol,
		create: () => ({ parse: (value) => value })
	};
}
/**
* Build one direct invocation descriptor.
* @param method - exported method name, identical to the host method's name.
* @param parameters - business parameter names, in host signature order.
* @returns the descriptor the mount installs.
*/
function direct(method, parameters) {
	return {
		id: `dsh-auto-review-plus#${REVIEWER_ROUTE_SERVICE}/${method}`,
		service: REVIEWER_ROUTE_SERVICE,
		namespace: REVIEWER_ROUTE_SERVICE,
		method,
		invocation: { kind: "direct" },
		parameters: parameters.map((name) => ({
			name,
			wire: name,
			source: "json",
			codec: jsonCodec(`dsh-auto-review-plus/client/remote#${name}`)
		})),
		result: jsonCodec(`dsh-auto-review-plus/client/remote#${method}`)
	};
}
/** The contribution this plugin's browser half mounts in its own fiber. */
const AUTO_REVIEW_PLUS_REMOTE = {
	package: "dsh-auto-review-plus",
	descriptors: [
		direct("reviewerRouteView", ["sessionId"]),
		direct("providers", []),
		direct("models", ["provider"]),
		direct("modelInfo", ["provider", "model"]),
		direct("setReviewerRoute", ["sessionId", "route"])
	]
};

//#endregion
//#region src/client/index.tsx
/** Required services (cordis fiber inject). */
const inject = [
	"connection",
	"remote",
	"remote.permissionPresets",
	"sessions",
	"slots",
	"locale"
];
/**
* Unwrap one Remote result into a plain promise value.
* @param result - settled Remote call.
* @returns the business value.
* @throws the Remote failure.
*/
function unwrap(result) {
	if (!result.ok) throw result.error;
	return result.value;
}
/**
* Client plugin body: own the composer permission control.
*
* Async on purpose: this plugin's own Remote namespace has to be mounted before
* any chooser can read or write a reviewer route, and a mount that fails leaves
* the shipped control in place (nothing below has registered anything yet)
* instead of shadowing it with a half-wired one.
* @param ctx - client root context.
*/
async function apply(ctx) {
	await ctx.remote.$mount(AUTO_REVIEW_PLUS_REMOTE);
	ctx.effect(() => ctx.locale.register(PERMISSION_ACCESS_NS, {
		zh: accessZh,
		en: accessEn
	}), "auto-review-plus: permission control dictionaries");
	const sessions = ctx.sessions;
	const catalog = new PermissionCatalogDirectory(ctx);
	ctx.effect(() => () => {
		catalog.dispose();
	}, "auto-review-plus: process catalog directory");
	const submit = async (sessionId, preset) => {
		const live = sessions.binding(sessionId)?.session;
		if (live === void 0) throw new Error("this session is not materialized yet");
		const result = await live.command(`/permission ${preset}`);
		if (!result.ok) throw new Error(`permission switch failed: ${result.error.code}: ${result.error.message}`);
		if (!result.value.matched) throw new Error("the host offers no /permission command");
		return true;
	};
	const reviewerRoute = {
		view: async (sessionId) => unwrap(await ctx.remote.autoReviewPlus.reviewerRouteView(sessionId)),
		providers: async () => unwrap(await ctx.remote.autoReviewPlus.providers()),
		models: async (provider) => unwrap(await ctx.remote.autoReviewPlus.models(provider)),
		modelInfo: async (provider, model) => unwrap(await ctx.remote.autoReviewPlus.modelInfo(provider, model)),
		set: async (sessionId, route) => {
			unwrap(await ctx.remote.autoReviewPlus.setReviewerRoute(sessionId, route));
		}
	};
	ctx.slots.inject("conversation.input.permission", () => ctx.slots.register({
		name: "conversation.input.permission",
		priority: -1,
		locale: PERMISSION_ACCESS_NS,
		inject: (sessionId) => ({
			hooks: { permissionCatalog: catalog.store },
			select: (preset) => submit(sessionId, preset),
			reviewerRoute
		})
	}, PermissionControl));
}

//#endregion
exports.apply = apply
exports.inject = inject
		return module.exports;
	},
});
