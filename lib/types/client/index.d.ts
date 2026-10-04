import { Context } from "@deepseek-ai/cordis";

//#region src/client/locales.d.ts
/** English dictionary for the current-session popup gate. */

/** English dictionary for the current-session popup gate. */
declare const accessEn: {
  mode: string;
  close: string;
  'preset.readOnly': string;
  'preset.workspaceWrite': string;
  'preset.fullAccess': string;
  'confirm.title': string;
  'confirm.description': string;
  'confirm.acknowledge': string;
  'confirm.cancel': string;
  'confirm.enable': string;
  'auto.label': string;
  'auto.badge': string;
  'auto.description': string;
  'auto.confirm.title': string;
  'auto.confirm.description': string;
  'auto.confirm.acknowledge': string;
  'auto.confirm.enable': string;
}; //#endregion
//#region src/client/index.d.ts

/** Required services (cordis fiber inject). */
declare const inject: string[];
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Current-session permission picker and confirmation copy. */
    'autoReviewPlus.permission': keyof typeof accessEn;
  }
}
/**
 * Client plugin body: own the composer permission control.
 * @param ctx - client root context.
 */
declare function apply(ctx: Context): void; //#endregion
export { apply, inject };