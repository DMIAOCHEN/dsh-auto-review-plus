/**
 * Two-level reviewer-model chooser for the Auto confirmation, with an explicit
 * "follow the current session model" default.
 *
 * The component is controlled in one direction only: it adopts `value` whenever
 * the parent changes it for a reason of its own (the first load, a reset), and
 * reports every choice through `onChange`. Its own provider/model state is what
 * the two selects show, because a provider whose model list is still in flight
 * is a real state of the chooser and not a route — see `chooseProvider`.
 * @module dsh-auto-review-plus/client/ReviewerRoutePicker
 */
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { PERMISSION_ACCESS_NS } from './locales.ts'
import type { ReviewerModelView, ReviewerProviderView, ReviewerRouteValue } from './remote.ts'
import css from './ReviewerRoutePicker.module.css'

/** Props of the reviewer-model chooser. */
export interface ReviewerRoutePickerProps {
  /** Currently pinned route, or null when the review follows the session route. */
  readonly value: ReviewerRouteValue | null
  /** The route the session would use, or null before its first request. */
  readonly sessionRoute: ReviewerRouteValue | null
  /** Provider routes the host serves. */
  readonly providers: readonly ReviewerProviderView[]
  /** Models of the chosen provider route. */
  readonly models: readonly ReviewerModelView[]
  /** Reasoning efforts of the chosen model, in adapter order. */
  readonly reasoningEfforts: readonly string[]
  /** Whether the choice cannot be edited right now (locked session, write in flight). */
  readonly disabled: boolean
  /** Locale lookup of this plugin's own namespace. */
  readonly t: TranslateNS<typeof PERMISSION_ACCESS_NS>
  /** Ask the parent to load one provider's models. */
  readonly onProviderChange: (provider: string) => void
  /** Report the choice; null means "follow the session model". */
  readonly onChange: (route: ReviewerRouteValue | null) => void
}

/** The chooser's own two-level selection. */
type Selection =
  | { readonly kind: 'follow' }
  | { readonly kind: 'custom'; readonly provider: string; readonly model: string }

/** Compare two routes (null is the follow state, not a missing value). */
function sameRoute(left: ReviewerRouteValue | null, right: ReviewerRouteValue | null): boolean {
  if (left === null || right === null) return left === right
  return left.provider === right.provider && left.model === right.model
}

/** Project one parent value into the chooser's selection. */
function selectionOf(value: ReviewerRouteValue | null): Selection {
  return value === null
    ? { kind: 'follow' }
    : { kind: 'custom', provider: value.provider, model: value.model }
}

/**
 * Render the reviewer-model chooser.
 * @param props - see {@link ReviewerRoutePickerProps}.
 * @returns the chooser's form rows.
 */
export function ReviewerRoutePicker({
  value, sessionRoute, providers, models, reasoningEfforts, disabled, t, onProviderChange, onChange,
}: ReviewerRoutePickerProps): ReactNode {
  const [selection, setSelection] = useState<Selection>(() => selectionOf(value))
  // The last value this component reported, so an echo of our own report is not
  // mistaken for a parent-owned change and does not reset the user's picks.
  const reported = useRef<ReviewerRouteValue | null>(value)

  useEffect(() => {
    if (sameRoute(value, reported.current)) return
    reported.current = value
    setSelection(selectionOf(value))
  }, [value])

  const report = (next: ReviewerRouteValue | null): void => {
    reported.current = next
    onChange(next)
  }

  // A provider whose models just arrived completes the selection with its first
  // model: a provider without a model is not a route, and "follow the session
  // model" is what the parent holds until a complete route exists.
  useEffect(() => {
    if (selection.kind !== 'custom' || selection.model !== '') return
    const [first] = models
    if (first === undefined) return
    const next = { provider: selection.provider, model: first.id }
    setSelection({ kind: 'custom', ...next })
    report(next)
  }, [models, selection])

  const chooseProvider = (next: string): void => {
    if (next === '') {
      setSelection({ kind: 'follow' })
      report(null)
      return
    }
    setSelection({ kind: 'custom', provider: next, model: '' })
    onProviderChange(next)
    report(null)
  }

  const chooseModel = (model: string): void => {
    if (selection.kind !== 'custom') return
    setSelection({ kind: 'custom', provider: selection.provider, model })
    report({ provider: selection.provider, model })
  }

  const providerValue = selection.kind === 'follow' ? '' : selection.provider
  const modelValue = selection.kind === 'custom' ? selection.model : ''
  const customModel = selection.kind === 'custom' && selection.model !== '' ? selection.model : ''
  // A pin this host no longer advertises still has to be visible and selectable
  // — silently dropping it would hide what the session is actually pinned to,
  // and a `value` without a matching option renders as an empty control.
  const missingProvider = providerValue !== '' && !providers.some(provider => provider.id === providerValue)
  const missingModel = customModel !== '' && !models.some(model => model.id === customModel)
  const sessionRouteLabel = sessionRoute === null
    ? t('reviewerRoute.followSession')
    : `${sessionRoute.provider} / ${sessionRoute.model}`

  return (
    <div className={css.picker}>
      <label className={css.field}>
        <span className={css.label}>{t('reviewerRoute.provider')}</span>
        <select
          className={css.select}
          disabled={disabled}
          value={providerValue}
          onChange={(event) => { chooseProvider(event.currentTarget.value) }}
        >
          <option value="">{t('reviewerRoute.followSession')}</option>
          {providers.map(provider => (
            <option key={provider.id} value={provider.id}>{provider.name}</option>
          ))}
          {missingProvider
            ? <option value={providerValue}>{t('reviewerRoute.unknownRoute')}</option>
            : null}
        </select>
      </label>
      <label className={css.field}>
        <span className={css.label}>{t('reviewerRoute.model')}</span>
        <select
          className={css.select}
          disabled={disabled || selection.kind === 'follow' || (models.length === 0 && !missingModel)}
          value={modelValue}
          onChange={(event) => { chooseModel(event.currentTarget.value) }}
        >
          {selection.kind === 'follow'
            ? <option value="">{sessionRouteLabel}</option>
            : null}
          {selection.kind === 'custom' && selection.model === ''
            ? <option value="">{t('reviewerRoute.loading')}</option>
            : null}
          {selection.kind === 'custom'
            ? models.map(model => <option key={model.id} value={model.id}>{model.name}</option>)
            : null}
          {selection.kind === 'custom' && missingModel
            ? <option value={customModel}>{t('reviewerRoute.unknownRoute')}</option>
            : null}
        </select>
      </label>
      {customModel === '' ? null : (
        <p className={css.capability}>
          {`${t('reviewerRoute.reasoning')}: `}
          {reasoningEfforts.length === 0 ? t('reviewerRoute.noReasoning') : reasoningEfforts.join(' / ')}
        </p>
      )}
    </div>
  )
}
