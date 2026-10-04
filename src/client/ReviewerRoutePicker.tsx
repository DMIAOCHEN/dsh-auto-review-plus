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
import { reviewerRouteEffortsLoaded, reviewerRouteOptionState } from './reviewer-route-chooser.ts'
import type { ReviewerModelView, ReviewerProviderView, ReviewerRouteValue } from './remote.ts'
import css from './ReviewerRoutePicker.module.css'

/** Props of the reviewer-model chooser. */
export interface ReviewerRoutePickerProps {
  /** Currently pinned route, or null when the review follows the session route. */
  readonly value: ReviewerRouteValue | null
  /** The route the session would use, or null before its first request. */
  readonly sessionRoute: ReviewerRouteValue | null
  /** Provider routes the host serves, empty until an answer arrives. */
  readonly providers: readonly ReviewerProviderView[]
  /**
   * Whether {@link providers} is a complete answer. Without it a list that is
   * merely not loaded yet would read as "this provider is unavailable".
   */
  readonly providersLoaded: boolean
  /** Models of {@link modelsProvider}, empty until that list arrives. */
  readonly models: readonly ReviewerModelView[]
  /**
   * Provider whose model list {@link models} belongs to, or null while none has
   * arrived. Without it a list that is merely not loaded yet would read as "this
   * model is unavailable".
   */
  readonly modelsProvider: string | null
  /** Reasoning efforts of the chosen model, in adapter order. */
  readonly reasoningEfforts: readonly string[]
  /**
   * Route whose efforts {@link reasoningEfforts} belongs to, or null while none
   * has arrived. Without it an unread effort list would read as "this model
   * exposes no reasoning levels".
   */
  readonly effortsRoute: ReviewerRouteValue | null
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
  value, sessionRoute, providers, providersLoaded, models, modelsProvider, reasoningEfforts, effortsRoute,
  disabled, t, onProviderChange, onChange,
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

  // A provider whose model list just arrived completes the selection with its
  // first model: a provider without a model is not a route, and "follow the
  // session model" is what the parent holds until a complete route exists.
  useEffect(() => {
    if (selection.kind !== 'custom' || selection.model !== '') return
    if (modelsProvider !== selection.provider) return
    const [first] = models
    if (first === undefined) return
    const next = { provider: selection.provider, model: first.id }
    setSelection({ kind: 'custom', ...next })
    report(next)
  }, [models, modelsProvider, selection])

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
  /**
   * Whether the model list on screen belongs to the provider being shown. Until
   * it does, the chooser is waiting for that list rather than being told the
   * model is gone — the two are different sentences, and a valid pin adopted
   * from the host must not momentarily read as unavailable.
   */
  const modelsForSelection = selection.kind === 'custom' && modelsProvider === selection.provider
  const listing = modelsForSelection ? models : []
  // A pin this host no longer advertises still has to be visible and selectable
  // — silently dropping it would hide what the session is actually pinned to,
  // and a `value` without a matching option renders as an empty control. The
  // state decides which of the two honest sentences the placeholder carries:
  // "this route is unavailable" is a claim only an arrived answer can make.
  const providerState = reviewerRouteOptionState({
    ids: providers.map(provider => provider.id),
    loaded: providersLoaded,
    value: providerValue,
  })
  const modelState = reviewerRouteOptionState({
    ids: listing.map(model => model.id),
    loaded: modelsForSelection,
    value: customModel,
  })
  const chosenRoute = selection.kind === 'custom' && selection.model !== ''
    ? { provider: selection.provider, model: selection.model }
    : null
  const effortsLoaded = reviewerRouteEffortsLoaded({ loadedFor: effortsRoute, route: chosenRoute })
  const modelSelectDisabled = disabled || selection.kind === 'follow' || !modelsForSelection || listing.length === 0
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
          {providerState === 'listed'
            ? null
            : (
              <option value={providerValue}>
                {providerState === 'absent' ? t('reviewerRoute.unknownRoute') : t('reviewerRoute.loading')}
              </option>
            )}
        </select>
      </label>
      <label className={css.field}>
        <span className={css.label}>{t('reviewerRoute.model')}</span>
        <select
          className={css.select}
          disabled={modelSelectDisabled}
          value={modelValue}
          onChange={(event) => { chooseModel(event.currentTarget.value) }}
        >
          {selection.kind === 'follow'
            ? <option value="">{sessionRouteLabel}</option>
            : null}
          {selection.kind === 'custom' && (selection.model === '' || modelState === 'pending')
            ? (
              <option value={selection.model}>
                {modelState === 'pending' ? t('reviewerRoute.loading') : t('reviewerRoute.unknownRoute')}
              </option>
            )
            : null}
          {selection.kind === 'custom' && modelsForSelection
            ? listing.map(model => <option key={model.id} value={model.id}>{model.name}</option>)
            : null}
          {modelState === 'absent'
            ? <option value={customModel}>{t('reviewerRoute.unknownRoute')}</option>
            : null}
        </select>
      </label>
      {customModel === '' ? null : (
        <p className={css.capability}>
          {`${t('reviewerRoute.reasoning')}: `}
          {!effortsLoaded
            ? t('reviewerRoute.loading')
            : reasoningEfforts.length === 0 ? t('reviewerRoute.noReasoning') : reasoningEfforts.join(' / ')}
        </p>
      )}
    </div>
  )
}
