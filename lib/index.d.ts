import z from "@deepseek-ai/schemastery";
import { Context } from "@deepseek-ai/cordis";

//#region src/index.d.ts
/** Cordis plugin name used by loader diagnostics. */

/** Cordis plugin name used by loader diagnostics. */
declare const name = "auto-review-plus";
/** Complete host services required before Auto may be advertised. */
declare const inject: string[];
/** Plugin configuration (set through this package's own profile row). */
interface Config {
  /**
   * Reasoning level the review request falls back to when the reviewed
   * session's request header pins none. The level is applied only after
   * `ctx.llm.resolveModelInfo` confirms the exact review route offers it;
   * leaving this unset keeps the ported behavior of sending no level at all.
   */
  fallbackReasoningEffort?: string;
}
declare const Config: z<Config>;
/**
 * Install the Auto preset and its prepended per-call review gate.
 *
 * `apply` is async on purpose: the listener below reads the reviewer route
 * SYNCHRONOUSLY (`reviewerRoute` → `KvTable.get`), so the `routes` table handle
 * must exist before the listener can serve a single call. Awaiting `open` here
 * is the whole gate — no queue, no "table not ready yet" branch, and a domain
 * that fails to open keeps the gate from being advertised at all.
 * @param ctx - host context; `storageDomain` is an injected prerequisite.
 * @param config - validated plugin config.
 */
declare function apply(ctx: Context, config: Config): Promise<void>; //#endregion
export { Config, apply, inject, name };