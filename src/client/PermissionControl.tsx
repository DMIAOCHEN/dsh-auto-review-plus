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
import type { ReviewerRouteApi, ReviewerRouteValue } from './remote.ts'
import { ReviewerRouteDialog } from './ReviewerRouteDialog.tsx'
import { ReviewerRoutePrompts, shouldPromptReviewerRoute } from './reviewer-route-prompt.ts'
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
  const reviewerPrompts = useRef(new ReviewerRoutePrompts())
  const autoActive = selection?.currentValue === AUTO_REVIEW
  // Loaded while a chooser is on screen: the Auto risk gate opens before the
  // host has answered, the automatic prompt only opens after it has.
  const reviewerRouteState = useReviewerRoute(
    reviewerRoute, sessionId, confirmation === AUTO_REVIEW || autoActive,
  )
  const pinnedRoute = reviewerRouteState.view?.route

  useEffect(() => {
    if (!locked && selection !== undefined && catalog !== null
      && (confirmation === null || catalog.options.some(option => option.value === confirmation))) return
    setOpen(false)
    setAcknowledged(false)
    setConfirmation(null)
  }, [catalog, confirmation, locked, selection])

  // Adopt the host's pin whenever its answer lands while a chooser is open.
  useEffect(() => {
    if (confirmation !== AUTO_REVIEW && !reviewerPrompt) return
    if (reviewerRouteState.view === null) return
    setReviewerDraft(reviewerRouteState.view.route)
  }, [confirmation, reviewerPrompt, reviewerRouteState.view])

  // Ask once per session, the first time Auto is active without a pin.
  useEffect(() => {
    if (!autoActive) return
    if (!shouldPromptReviewerRoute({
      route: pinnedRoute,
      answered: reviewerPrompts.current.isAnswered(sessionId),
      dialogOpen: confirmation !== null || reviewerPrompt,
    })) return
    setReviewerDraft(null)
    setReviewerWriteFailure(null)
    setReviewerPrompt(true)
  }, [autoActive, confirmation, pinnedRoute, reviewerPrompt, sessionId])

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

  const submit = (id: string): void => {
    setPick(id)
    void select(id)
      .catch(() => false)
      .then(() => { setPick(null) })
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
      if (id === AUTO_REVIEW) setReviewerDraft(pinnedRoute ?? null)
      setConfirmation(id)
      return
    }
    submit(id)
  }

  const closeConfirmation = (): void => {
    setAcknowledged(false)
    setConfirmation(null)
  }

  /**
   * Persist one reviewer route (null resets to following the session model).
   * The failure is reported to the caller AND left on screen, so the automatic
   * prompt can keep its dialog open instead of closing as if it had written.
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

  const changeReviewerDraft = (route: ReviewerRouteValue | null): void => {
    setReviewerDraft(route)
    if (route !== null) reviewerRouteState.selectRoute(route)
  }

  /** Open the chooser on demand (Auto is already active and wants another model). */
  const openReviewerPrompt = (): void => {
    reviewerRouteState.reload()
    setReviewerDraft(pinnedRoute ?? null)
    setReviewerWriteFailure(null)
    setReviewerPrompt(true)
  }

  const closeReviewerPrompt = (): void => {
    // Closing writes nothing, and either way the session is not asked again by
    // itself: this memory is per control instance, not per pin.
    reviewerPrompts.current.answer(sessionId)
    setReviewerWriteFailure(null)
    setReviewerPrompt(false)
  }

  const confirmReviewerPrompt = (): void => {
    // The session is marked answered BEFORE the write settles: the automatic
    // prompt is a one-time question, and the host's projection needs a moment
    // to carry the new pin back. A failed write keeps this dialog open with the
    // failure on screen instead of closing as if it had stored something.
    reviewerPrompts.current.answer(sessionId)
    void writeReviewerRoute(reviewerDraft).then(
      () => { acceptReviewerWrite(); setReviewerPrompt(false) },
      () => undefined,
    )
  }

  const confirmSelection = (id: string): void => {
    const draft = reviewerDraft
    if (id === AUTO_REVIEW) reviewerPrompts.current.answer(sessionId)
    closeConfirmation()
    if (id !== AUTO_REVIEW) {
      submit(id)
      return
    }
    // Pin first, then switch the preset, so the automatic prompt finds a
    // durable answer. A failed preference write must NOT block the permission
    // switch — Auto review works without a pin by using the session's own
    // route, and the person just answered explicitly either way.
    void writeReviewerRoute(draft).then(
      () => { acceptReviewerWrite(); submit(id) },
      () => { submit(id) },
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
          failure={reviewerRouteState.failure}
          value={reviewerDraft}
          sessionRoute={reviewerRouteState.view?.sessionRoute ?? null}
          providers={reviewerRouteState.providers}
          models={reviewerRouteState.models}
          reasoningEfforts={reviewerRouteState.reasoningEfforts}
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
        failure={reviewerWriteFailure ?? reviewerRouteState.failure}
        value={reviewerDraft}
        sessionRoute={reviewerRouteState.view?.sessionRoute ?? null}
        providers={reviewerRouteState.providers}
        models={reviewerRouteState.models}
        reasoningEfforts={reviewerRouteState.reasoningEfforts}
        t={t}
        onProviderChange={reviewerRouteState.selectProvider}
        onChange={changeReviewerDraft}
        onCancel={closeReviewerPrompt}
        onConfirm={confirmReviewerPrompt}
      />
    </>
  )
}
