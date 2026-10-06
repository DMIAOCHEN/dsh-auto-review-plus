/**
 * Ported verbatim from `@deepseek-ai/dsh-client-ui-permission-presets`
 * (`packages/client/ui-permission-presets/src/client/PermissionSelect.tsx`,
 * 0.2.0-rc.2) with three mechanical differences, itemized in
 * .sdd/dsh-auto-review-plus/task-6-report.md:
 *
 * 1. `PermissionSelect*` identifiers become `PermissionControl*` (this file's
 *    name; Task 7 extends the same three names).
 * 2. The `clsx` value import is replaced by the local `classNames` helper below:
 *    `clsx` is neither in the shell's frozen module table nor a dependency of
 *    this package, so it must inline rather than stay an import.
 * 3. Nothing else: every other line, including all four relative imports, is
 *    byte-identical to upstream.
 *
 * Task 7 adds the reviewer-model chooser on top: the Auto confirmation is
 * composed here from the same dialog primitives (upstream `RiskConfirmation`
 * takes no children) with the shipped Auto copy and acknowledgement unchanged,
 * and Auto asks for a reviewer model once per session when the session has
 * none. Everything upstream does is still done exactly as before; the
 * Full-access confirmation still renders upstream's `RiskConfirmation`.
 *
 * The permission glyphs follow currentColor so the trigger and menu rows tint
 * the shared product artwork with their own text color.
 */
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  IconChevronDownOutlineRegular, Menu, PermissionIconFullAccessRegular,
  PermissionIconReadOnlyRegular, PermissionIconWorkspaceWriteRegular, RiskConfirmation,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  HostObservable, InjectFace, PropsLocale, PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type { PresetOption } from '@deepseek-ai/dsh-permission-presets/client'
// Type-only: pulls the conversation-owned permission slot declaration and
// the standard session projection hook into this package's Client face.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PermissionCatalogState } from './catalog.ts'
import { PERMISSION_ACCESS_NS } from './locales.ts'
import {
  AUTO_REVIEW_PRESET as AUTO_REVIEW,
  displayPermissionPreset,
  FULL_ACCESS_PRESET as FULL_ACCESS,
} from './presentation.ts'
import type { ReviewerRouteApi, ReviewerRouteValue, ReviewerRouteView } from './remote.ts'
import {
  ReviewerRouteAttempt, planReviewerRouteAdoption, reviewerRouteChooserFailure,
  runReviewerRouteAdoption,
} from './reviewer-route-chooser.ts'
import { ReviewerRouteDialog } from './ReviewerRouteDialog.tsx'
import { ReviewerRouteAutoFragment } from './reviewer-route-prompt.ts'
import { useReviewerRoute } from './use-reviewer-route.ts'
import css from './PermissionSelect.module.css'

/** Minimal inlined replacement for `clsx` (two class names, no object/array forms). */
function classNames(...names: (string | false | undefined)[]): string {
  return names.filter(name => typeof name === 'string' && name !== '').join(' ')
}
const permissionGlyphs = new Map<string, ReactNode>([
  ['read-only', <PermissionIconReadOnlyRegular />],
  ['workspace-write', <PermissionIconWorkspaceWriteRegular />],
  [FULL_ACCESS, <PermissionIconFullAccessRegular />],
])

/** Glyph for a permission option value; host-configured names outside the design set get none. */
function permissionGlyph(value: string): ReactNode | undefined {
  return permissionGlyphs.get(value)
}

function permissionLabel(
  value: string,
  name: string,
  t: PermissionControlProps['t'],
): string {
  if (value === AUTO_REVIEW) return t('auto.label')
  return displayPermissionPreset(value, name, key => t(key))
}

function optionBadge(value: string, t: PermissionControlProps['t']): string | undefined {
  return value === AUTO_REVIEW ? t('auto.badge') : undefined
}

/** Resolve locale-owned copy for the shipped Auto option; preserve host copy for other presets. */
function optionDescription(
  option: PresetOption,
  t: PermissionControlProps['t'],
): string | undefined {
  return option.value === AUTO_REVIEW ? t('auto.description') : option.description
}

/** Business face injected by the permission package's slot registration. */
export interface PermissionControlInjected {
  hooks: {
    /** One process catalog shared with the slash popup. */
    permissionCatalog: HostObservable<PermissionCatalogState>
  }
  /** Submit one current-session preset through the existing command writer. */
  select: (preset: string) => Promise<boolean>
  /** Reviewer-route API of this plugin's host half. */
  reviewerRoute: ReviewerRouteApi
}

/** Complete props derived from the conversation slot, injected hooks, and locale. */
export type PermissionControlProps =
  PropsRuntime<'conversation.input.permission'>
  & InjectFace<PermissionControlInjected>
  & PropsLocale<typeof PERMISSION_ACCESS_NS>

export function PermissionControl({
  locked, select, usePermissionCatalog, useProjection, reviewerRoute, sessionId, t,
}: PermissionControlProps) {
  const selection = useProjection('permissions')
  const catalog = usePermissionCatalog(state => state.value)
  const [pick, setPick] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [confirmation, setConfirmation] = useState<string | null>(null)
  const [acknowledged, setAcknowledged] = useState(false)
  const [reviewerPrompt, setReviewerPrompt] = useState(false)
  const [reviewerDraft, setReviewerDraft] = useState<ReviewerRouteValue | null>(null)
  const [reviewerWriting, setReviewerWriting] = useState(false)
  const [reviewerWriteFailure, setReviewerWriteFailure] = useState<string | null>(null)
  /**
   * The Auto-entry policy: it holds this control's watch of the host's Auto
   * state and reads the PAGE-lifetime prompt memory (`reviewer-route-prompt.ts`),
   * which is what survives a session switch. A control instance is exactly what
   * a session switch destroys, so the memory must not live here.
   */
  const reviewerFragment = useRef(new ReviewerRouteAutoFragment())
  /** The host answer already adopted, so one answer loads its dependencies once. */
  const adoptedView = useRef<ReviewerRouteView | null>(null)
  /** Whether the person already edited the chooser in this opening. */
  const reviewerEdited = useRef(false)
  /** In-flight confirmations a closed dialog must be able to invalidate. */
  const reviewerAttempt = useRef(new ReviewerRouteAttempt())
  const autoActive = selection?.currentValue === AUTO_REVIEW
  // Loaded while a chooser is on screen: the Auto risk gate opens before the
  // host has answered, the automatic prompt only opens after it has.
  const reviewerRouteState = useReviewerRoute(
    reviewerRoute, sessionId, confirmation === AUTO_REVIEW || autoActive,
  )
  const pinnedRoute = reviewerRouteState.view?.route

  // Upstream's own reset: no session, no catalog, a locked session, or a
  // confirmation whose preset left the catalog closes the dialog. It is the
  // FOURTH close path and must invalidate an in-flight confirmation like the
  // other three (Cancel, the prompt's Cancel, and the auto-prompt's own close):
  // a settlement arriving after this must not switch the preset.
  useEffect(() => {
    if (!locked && selection !== undefined && catalog !== null
      && (confirmation === null || catalog.options.some(option => option.value === confirmation))) return
    reviewerAttempt.current.cancel()
    setOpen(false)
    setAcknowledged(false)
    setConfirmation(null)
  }, [catalog, confirmation, locked, selection])

  // Adopt the host's pin whenever its answer lands while a chooser is open. The
  // adoption goes through the SAME loads a pick does — a pinned provider's model
  // list and its model's capability — because a chooser that only assigned the
  // draft would show a valid pin as an unavailable route.
  useEffect(() => {
    if (confirmation !== AUTO_REVIEW && !reviewerPrompt) return
    const view = reviewerRouteState.view
    const plan = planReviewerRouteAdoption({
      view,
      edited: reviewerEdited.current,
      adopted: adoptedView.current,
    })
    if (plan.kind === 'wait') return
    if (view !== null) adoptedView.current = view
    runReviewerRouteAdoption(plan, {
      setDraft: setReviewerDraft,
      loadModels: reviewerRouteState.selectProvider,
      loadEfforts: reviewerRouteState.selectRoute,
    })
    // The dependency list names the answer's identity alone on purpose: the
    // loader functions are stable (they are `useCallback`s over the session id),
    // while the object holding them is rebuilt every render, so listing it would
    // re-run this effect on every render.
  }, [confirmation, reviewerPrompt, reviewerRouteState.view])

  // Fold every observation of the host's Auto state into the fragment policy.
  // A control that mounts into an ALREADY Auto session (session switch, reload,
  // restart) sees its first value as a restore and starts nothing, which is the
  // whole difference between "Auto is on" and "Auto was just entered". This runs
  // before the prompt effect below on purpose: it decides what that effect reads.
  useEffect(() => {
    if (selection === undefined) return
    reviewerFragment.current.observe(sessionId, autoActive)
  }, [autoActive, selection, sessionId])

  // Ask once per ENTRY: only the moment Auto was entered asks, and only while the
  // session has no pin. Auto merely being restored must stay silent.
  useEffect(() => {
    if (!autoActive) return
    if (!reviewerFragment.current.shouldAsk(sessionId, {
      route: pinnedRoute,
      dialogOpen: confirmation !== null || reviewerPrompt,
    })) return
    reviewerEdited.current = false
    setReviewerDraft(null)
    setReviewerWriteFailure(null)
    setReviewerPrompt(true)
  }, [autoActive, confirmation, pinnedRoute, reviewerPrompt, sessionId])

  // Unmounting (the composer for this session is going away) takes an in-flight
  // confirmation with it, so a settlement can never act after the control — and
  // therefore its dialog — is gone.
  useEffect(() => () => { reviewerAttempt.current.cancel() }, [])

  if (selection === undefined || catalog === null) return null

  const currentValue = pick !== null && catalog.options.some(option => option.value === pick)
    ? pick : selection.currentValue
  const current = catalog.options.find(option => option.value === currentValue)
  const currentLabel = current === undefined
    ? permissionLabel(currentValue, currentValue, t)
    : permissionLabel(current.value, current.name, t)
  const busy = pick !== null || confirmation !== null || reviewerPrompt

  const items: MenuEntry[] = catalog.options.map((option) => {
    const icon = permissionGlyph(option.value)
    const label = permissionLabel(option.value, option.name, t)
    const badge = optionBadge(option.value, t)
    return {
      id: option.value,
      label: badge === undefined
        ? label
        : (
          <span className={css.optionLabel} aria-label={`${label} ${badge}`}>
            <span className={css.optionLabelText}>{label}</span>
            <sup className={css.badge}>{badge}</sup>
          </span>
        ),
      ...icon === undefined ? {} : { icon },
    }
  })

  /**
   * Submit one preset. Resolves whether the host accepted it: the automatic
   * prompt's entry signal has to know, because a rejected write never switched
   * the preset.
   * @param id - preset value to switch to.
   * @returns true once the `/permission` command matched.
   */
  const submit = (id: string): Promise<boolean> => {
    setPick(id)
    return select(id)
      .catch(() => false)
      .then((accepted) => {
        setPick(null)
        return accepted === true
      })
  }

  const choose = (id: string): void => {
    setOpen(false)
    // Auto is already the current preset: the same pick is how the reviewer
    // model is changed later (the risk gate only guards ENABLING the preset).
    if (id === selection.currentValue) {
      if (id === AUTO_REVIEW) openReviewerPrompt()
      return
    }
    if (id === FULL_ACCESS || id === AUTO_REVIEW) {
      setAcknowledged(false)
      if (id === AUTO_REVIEW) openReviewerGate()
      setConfirmation(id)
      return
    }
    // Switching to a plain preset cannot enter Auto, so only the submission's own
    // outcome matters here.
    void submit(id)
  }

  const closeConfirmation = (): void => {
    // Closing invalidates any confirmation still in flight: a settlement that
    // arrives after this must change nothing (never switch the preset the
    // person just declined).
    reviewerAttempt.current.cancel()
    setAcknowledged(false)
    setConfirmation(null)
  }

  /**
   * Persist one reviewer route (null resets to following the session model).
   * The failure is reported to the caller AND left on screen, so the dialog
   * that triggered the write keeps the message instead of closing as if it had
   * stored something.
   * @param route - route to pin, or null to follow the session route.
   * @returns resolution after the write, or rejection after recording its message.
   */
  const writeReviewerRoute = (route: ReviewerRouteValue | null): Promise<void> => {
    setReviewerWriting(true)
    setReviewerWriteFailure(null)
    return reviewerRoute.set(sessionId, route)
      .catch((error: unknown) => {
        setReviewerWriteFailure(error instanceof Error ? error.message : String(error))
        throw error
      })
      .finally(() => { setReviewerWriting(false) })
  }

  /**
   * Adopt the host's answer after a successful write, so a reopened chooser and
   * the automatic prompt read the pin that now exists.
   */
  const acceptReviewerWrite = (): void => { reviewerRouteState.reload() }

  /** Start a chooser opening: no edit yet and no stale write failure. */
  const beginReviewerChooser = (): void => {
    reviewerEdited.current = false
    setReviewerWriteFailure(null)
  }

  /**
   * Open the Auto risk gate. The hook loads on the enable transition this
   * causes, so no extra read is issued here.
   */
  const openReviewerGate = (): void => {
    beginReviewerChooser()
    setReviewerDraft(pinnedRoute ?? null)
  }

  /**
   * Open the chooser on demand (Auto is already active and wants another model).
   * The reload is what makes the adoption run again with fresh data: adoption is
   * driven by the identity of the host's answer.
   */
  const openReviewerPrompt = (): void => {
    beginReviewerChooser()
    reviewerRouteState.reload()
    setReviewerDraft(pinnedRoute ?? null)
    setReviewerPrompt(true)
  }

  const changeReviewerDraft = (route: ReviewerRouteValue | null): void => {
    reviewerEdited.current = true
    setReviewerDraft(route)
    if (route !== null) reviewerRouteState.selectRoute(route)
  }

  const closeReviewerPrompt = (): void => {
    // Closing writes nothing, invalidates a prompt whose write is still in
    // flight, and either way this fragment is done asking: the page memory keeps
    // the answer, so a remount inside the same Auto fragment stays quiet.
    reviewerAttempt.current.cancel()
    reviewerFragment.current.answered(sessionId)
    setReviewerWriteFailure(null)
    setReviewerPrompt(false)
  }

  const confirmReviewerPrompt = (): void => {
    // The session is marked answered BEFORE the write settles: the automatic
    // prompt is a one-time question, and the host's projection needs a moment
    // to carry the new pin back. A failed write keeps this dialog open with the
    // failure on screen instead of closing as if it had stored something, and a
    // dialog closed meanwhile takes the settlement with it.
    reviewerFragment.current.answered(sessionId)
    const accepted = reviewerAttempt.current.begin()
    void writeReviewerRoute(reviewerDraft).then(
      () => {
        if (!accepted()) return
        acceptReviewerWrite()
        closeReviewerPrompt()
      },
      () => undefined,
    )
  }

  const confirmSelection = (id: string): void => {
    if (id !== AUTO_REVIEW) {
      closeConfirmation()
      // Leaving Auto for a plain preset is observed as a real change, so the
      // fragment policy closes the fragment on its own.
      void submit(id)
      return
    }
    const draft = reviewerDraft
    const accepted = reviewerAttempt.current.begin()
    // Pin first, then switch the preset, so the automatic prompt finds a durable
    // answer. The dialog stays up until the write settles: the person chose a
    // reviewer model IN this dialog, so a failed write must be visible (and
    // retryable) instead of enabling Auto as if the choice had been stored.
    // Cancel stays available while the write runs, and cancelling it discards
    // this settlement — the preset is never switched after the dialog closed.
    void writeReviewerRoute(draft).then(
      () => {
        if (!accepted()) return
        acceptReviewerWrite()
        closeConfirmation()
        // This control is the one switching Auto on, and the gate just asked for
        // the reviewer model, so the entry is announced as already answered. It
        // is announced BEFORE the preset write, because the projection update and
        // the command response can arrive in either order; a rejected write is
        // taken back right below.
        reviewerFragment.current.enterFromControl(sessionId)
        void submit(id).then((switched) => {
          if (!switched) reviewerFragment.current.abandonEntry(sessionId)
        })
      },
      () => undefined,
    )
  }

  const confirmationTitle = confirmation === AUTO_REVIEW
    ? t('auto.confirm.title')
    : t('confirm.title')
  const confirmationDescription = confirmation === AUTO_REVIEW
    ? t('auto.confirm.description')
    : t('confirm.description')
  const confirmationAcknowledge = confirmation === AUTO_REVIEW
    ? t('auto.confirm.acknowledge')
    : t('confirm.acknowledge')
  const confirmationEnable = confirmation === AUTO_REVIEW
    ? t('auto.confirm.enable')
    : t('confirm.enable')
  const currentBadge = optionBadge(currentValue, t)
  const currentAccessibleLabel = currentBadge === undefined ? currentLabel : `${currentLabel} ${currentBadge}`

  return (
    <>
      <Menu
        open={open}
        items={items}
        selectedId={currentValue}
        onSelect={choose}
        onClose={() => { setOpen(false) }}
        side="top"
        portal
        anchor={
          <button
            type="button"
            className={css.trigger}
            aria-label={t('mode', { name: currentAccessibleLabel })}
            title={current === undefined ? undefined : optionDescription(current, t)}
            disabled={locked || busy}
            onClick={() => { setOpen(!open) }}
          >
            {permissionGlyph(currentValue) !== undefined && (
              <span className={css.triggerIcon} aria-hidden>{permissionGlyph(currentValue)}</span>
            )}
            <span className={css.triggerLabel}>{currentLabel}</span>
            {currentBadge !== undefined && (
              <sup className={css.badge}>{currentBadge}</sup>
            )}
            <span className={classNames(css.chevron, open && css.chevronOpen)} aria-hidden>
              <IconChevronDownOutlineRegular />
            </span>
          </button>
        }
      />
      {confirmation === AUTO_REVIEW ? (
        <ReviewerRouteDialog
          open
          title={confirmationTitle}
          confirmLabel={confirmationEnable}
          risk={{
            description: confirmationDescription,
            acknowledgeLabel: confirmationAcknowledge,
            acknowledged,
            onAcknowledgedChange: setAcknowledged,
          }}
          loading={reviewerRouteState.view === null && reviewerRouteState.failure === null}
          disabled={locked || reviewerWriting}
          // The write failure belongs to THIS dialog too: the person chose the
          // route here, so a rejected write must not vanish with the gate.
          failure={reviewerRouteChooserFailure({
            write: reviewerWriteFailure,
            read: reviewerRouteState.failure,
          })}
          value={reviewerDraft}
          sessionRoute={reviewerRouteState.view?.sessionRoute ?? null}
          providers={reviewerRouteState.providers}
          providersLoaded={reviewerRouteState.providersLoaded}
          models={reviewerRouteState.models}
          modelsProvider={reviewerRouteState.modelsProvider}
          efforts={reviewerRouteState.efforts}
          t={t}
          onProviderChange={reviewerRouteState.selectProvider}
          onChange={changeReviewerDraft}
          onCancel={closeConfirmation}
          onConfirm={() => { confirmSelection(AUTO_REVIEW) }}
        />
      ) : confirmation !== null && (
        <RiskConfirmation
          open
          title={confirmationTitle}
          description={confirmationDescription}
          acknowledgeLabel={confirmationAcknowledge}
          cancelLabel={t('confirm.cancel')}
          closeLabel={t('close')}
          confirmLabel={confirmationEnable}
          acknowledged={acknowledged}
          disabled={locked}
          onAcknowledgedChange={setAcknowledged}
          onCancel={closeConfirmation}
          onConfirm={() => { confirmSelection(confirmation) }}
        />
      )}
      <ReviewerRouteDialog
        open={reviewerPrompt}
        title={t('reviewerRoute.title')}
        confirmLabel={t('reviewerRoute.confirm')}
        risk={undefined}
        loading={reviewerRouteState.view === null && reviewerRouteState.failure === null}
        disabled={locked || reviewerWriting}
        failure={reviewerRouteChooserFailure({
          write: reviewerWriteFailure,
          read: reviewerRouteState.failure,
        })}
        value={reviewerDraft}
        sessionRoute={reviewerRouteState.view?.sessionRoute ?? null}
        providers={reviewerRouteState.providers}
        providersLoaded={reviewerRouteState.providersLoaded}
        models={reviewerRouteState.models}
        modelsProvider={reviewerRouteState.modelsProvider}
        efforts={reviewerRouteState.efforts}
        t={t}
        onProviderChange={reviewerRouteState.selectProvider}
        onChange={changeReviewerDraft}
        onCancel={closeReviewerPrompt}
        onConfirm={confirmReviewerPrompt}
      />
    </>
  )
}
