/**
 * The one dialog that carries the reviewer-model chooser: the Auto risk
 * confirmation before the preset is enabled, and the automatic "which model
 * reviews this session" prompt once Auto is active.
 *
 * The Auto confirmation is built from the same `ui-primitives` dialog the
 * shipped `RiskConfirmation` uses (`Modal` plus `Button`), with the shipped
 * copy unchanged and the acknowledgement still gating the primary action. It
 * exists because `RiskConfirmation` takes no children, so a chooser can only be
 * added by composing the dialog here; the Full-access confirmation keeps using
 * `RiskConfirmation` untouched.
 * @module dsh-auto-review-plus/client/ReviewerRouteDialog
 */
import type { ReactNode } from 'react'
import { Button, IconWarningOutlineRegular, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { PERMISSION_ACCESS_NS } from './locales.ts'
import type { ReviewerModelView, ReviewerProviderView, ReviewerRouteValue } from './remote.ts'
import { ReviewerRoutePicker } from './ReviewerRoutePicker.tsx'
import css from './ReviewerRouteDialog.module.css'

/** The Auto risk gate the dialog carries when it also enables the preset. */
export interface ReviewerRouteRiskGate {
  /** Shipped Auto risk copy, unchanged. */
  readonly description: string
  /** Shipped acknowledgement label, unchanged. */
  readonly acknowledgeLabel: string
  /** Caller-owned acknowledgement state. */
  readonly acknowledged: boolean
  readonly onAcknowledgedChange: (acknowledged: boolean) => void
}

/** Props of the reviewer-route dialog. */
export interface ReviewerRouteDialogProps {
  readonly open: boolean
  readonly title: string
  readonly confirmLabel: string
  /** Present only when this dialog also gates the Auto preset switch. */
  readonly risk: ReviewerRouteRiskGate | undefined
  /** Whether the host's answer about this session has not arrived yet. */
  readonly loading: boolean
  /** Whether an edit or write is in flight. */
  readonly disabled: boolean
  /** Read or write failure to show, or null. */
  readonly failure: string | null
  readonly value: ReviewerRouteValue | null
  readonly sessionRoute: ReviewerRouteValue | null
  readonly providers: readonly ReviewerProviderView[]
  readonly models: readonly ReviewerModelView[]
  readonly reasoningEfforts: readonly string[]
  readonly t: TranslateNS<typeof PERMISSION_ACCESS_NS>
  readonly onProviderChange: (provider: string) => void
  readonly onChange: (route: ReviewerRouteValue | null) => void
  readonly onCancel: () => void
  readonly onConfirm: () => void
}

/**
 * Render the reviewer-route dialog.
 * @param props - see {@link ReviewerRouteDialogProps}.
 * @returns the dialog tree, or null while closed.
 */
export function ReviewerRouteDialog({
  open, title, confirmLabel, risk, loading, disabled, failure,
  value, sessionRoute, providers, models, reasoningEfforts, t,
  onProviderChange, onChange, onCancel, onConfirm,
}: ReviewerRouteDialogProps): ReactNode {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      closeLabel={t('close')}
      className={css.dialog}
      contentClassName={css.content}
      footer={(
        <>
          <Button variant="outline" className={css.action} onClick={onCancel}>
            {t('confirm.cancel')}
          </Button>
          <Button
            variant="primary"
            className={css.confirmAction}
            disabled={disabled || (risk !== undefined && !risk.acknowledged)}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      )}
    >
      {risk === undefined ? null : (
        <div className={css.warning}>
          <IconWarningOutlineRegular size={18} className={css.warningIcon} />
          <p>{risk.description}</p>
        </div>
      )}
      {risk === undefined ? null : <p className={css.hint}>{t('auto.confirm.reviewerHint')}</p>}
      {failure === null ? null : <p className={css.failure} role="alert">{failure}</p>}
      {loading ? <p className={css.capability}>{t('reviewerRoute.loading')}</p> : (
        <ReviewerRoutePicker
          value={value}
          sessionRoute={sessionRoute}
          providers={providers}
          models={models}
          reasoningEfforts={reasoningEfforts}
          disabled={disabled}
          t={t}
          onProviderChange={onProviderChange}
          onChange={onChange}
        />
      )}
      {risk === undefined ? null : (
        <label className={css.acknowledgement}>
          <input
            type="checkbox"
            checked={risk.acknowledged}
            disabled={disabled}
            data-modal-autofocus
            onChange={(event) => { risk.onAcknowledgedChange(event.currentTarget.checked) }}
          />
          <span>{risk.acknowledgeLabel}</span>
        </label>
      )}
    </Modal>
  )
}
