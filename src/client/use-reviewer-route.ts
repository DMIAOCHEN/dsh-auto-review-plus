/**
 * Host-side data for the reviewer-route chooser, loaded in the three steps the
 * design calls for (providers, then one provider's models, then one model's
 * reasoning efforts) so opening the dialog never enumerates every model of
 * every provider.
 *
 * Every load is fenced by its own kind (`ReviewerRouteLoadFences`): a newer
 * start of the same kind discards the older answer, while the two loads an
 * adopted route needs — its provider's model list and its model's capability —
 * cannot invalidate each other.
 * @module dsh-auto-review-plus/client/use-reviewer-route
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { ReviewerRouteLoadFences, commitReviewerRouteProviders } from './reviewer-route-chooser.ts'
import type {
  ReviewerModelView,
  ReviewerProviderView,
  ReviewerRouteApi,
  ReviewerRouteValue,
  ReviewerRouteView,
} from './remote.ts'

/** What the chooser renders and the loads it triggers. */
export interface ReviewerRouteState {
  /** Host answer about the pinned and session routes, or null before one. */
  readonly view: ReviewerRouteView | null
  /** Provider routes this host serves; empty until an answer arrives. */
  readonly providers: readonly ReviewerProviderView[]
  /**
   * Whether {@link providers} is a complete answer from the host. Set only once
   * one arrives, so a pending (or superseded) read is never mistaken for a list
   * that simply omits the pinned provider.
   */
  readonly providersLoaded: boolean
  /** Advertised models of {@link modelsProvider}; empty before one arrives. */
  readonly models: readonly ReviewerModelView[]
  /**
   * Provider whose model list {@link models} belongs to, or null. Set only once
   * a list has actually arrived, so the chooser can tell "this provider's list
   * has not arrived" apart from "this model is not in the list" — two sentences
   * that must not be confused for a valid pin.
   */
  readonly modelsProvider: string | null
  /** Reasoning efforts of the model currently chosen in the picker. */
  readonly reasoningEfforts: readonly string[]
  /**
   * Route whose efforts {@link reasoningEfforts} belongs to, or null. Set only
   * once an answer arrives, for the same reason as {@link modelsProvider}.
   */
  readonly effortsRoute: ReviewerRouteValue | null
  /** Human-readable failure of the last read, or null. */
  readonly failure: string | null
  /** Load the provider list and the session's route. */
  reload(): void
  /** Load the models of one provider route. */
  selectProvider(provider: string): void
  /** Load the reasoning efforts of one exact route. */
  selectRoute(route: ReviewerRouteValue): void
}

/** Render an unknown rejection as one line of copy. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Subscribe one session's reviewer-route data while a surface needs it.
 * @param api - injected reviewer-route face of this plugin's host half.
 * @param sessionId - session whose route is being chosen.
 * @param enabled - whether a surface showing the chooser is open.
 * @returns the loaded values and their loaders.
 */
export function useReviewerRoute(
  api: ReviewerRouteApi,
  sessionId: string,
  enabled: boolean,
): ReviewerRouteState {
  const [view, setView] = useState<ReviewerRouteView | null>(null)
  const [providers, setProviders] = useState<readonly ReviewerProviderView[]>([])
  const [providersLoaded, setProvidersLoaded] = useState(false)
  const [models, setModels] = useState<readonly ReviewerModelView[]>([])
  const [modelsProvider, setModelsProvider] = useState<string | null>(null)
  const [reasoningEfforts, setReasoningEfforts] = useState<readonly string[]>([])
  const [effortsRoute, setEffortsRoute] = useState<ReviewerRouteValue | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  // The injected face is rebuilt by the slot host on every render, so the
  // loaders must not depend on its identity; the ref carries the live one.
  const apiRef = useRef(api)
  apiRef.current = api
  const fences = useRef(new ReviewerRouteLoadFences())

  const reload = useCallback((): void => {
    // A fresh answer replaces every load started for the previous one.
    fences.current.invalidateAll()
    const current = fences.current.start('answer')
    setFailure(null)
    setProvidersLoaded(false)
    setModels([])
    setModelsProvider(null)
    setReasoningEfforts([])
    setEffortsRoute(null)
    void apiRef.current.view(sessionId).then(
      (next) => { if (current()) setView(next) },
      (error: unknown) => {
        if (!current()) return
        setView(null)
        setFailure(messageOf(error))
      },
    )
    void apiRef.current.providers().then(
      (next) => commitReviewerRouteProviders(current(), next, (list) => {
        setProviders(list)
        setProvidersLoaded(true)
      }),
      (error: unknown) => {
        if (!current()) return
        setProvidersLoaded(false)
        setFailure(messageOf(error))
      },
    )
  }, [sessionId])

  // One load per open, and a fence for everything still in flight when the
  // surface closes or the session changes.
  useEffect(() => {
    if (!enabled) return
    reload()
    return () => { fences.current.invalidateAll() }
  }, [enabled, reload])

  const selectProvider = useCallback((provider: string): void => {
    const current = fences.current.start('models')
    setModels([])
    // No provider owns a list until one arrives: claiming `provider` here would
    // let an empty (still loading) list read as "this model is unavailable".
    setModelsProvider(null)
    setReasoningEfforts([])
    setEffortsRoute(null)
    void apiRef.current.models(provider).then(
      (next) => {
        if (!current()) return
        setModels(next)
        setModelsProvider(provider)
      },
      (error: unknown) => {
        if (!current()) return
        setModels([])
        setModelsProvider(null)
        setFailure(messageOf(error))
      },
    )
  }, [])

  const selectRoute = useCallback((route: ReviewerRouteValue): void => {
    const current = fences.current.start('efforts')
    setReasoningEfforts([])
    setEffortsRoute(null)
    void apiRef.current.modelInfo(route.provider, route.model).then(
      // A capability read that fails is not a reason to refuse the route: the
      // host validates it on write, and the chooser then reports no efforts for
      // a route it could not interrogate.
      (info) => {
        if (!current()) return
        setReasoningEfforts(info.reasoningEfforts)
        setEffortsRoute(route)
      },
      () => {
        if (!current()) return
        setReasoningEfforts([])
        setEffortsRoute(route)
      },
    )
  }, [])

  return {
    view, providers, providersLoaded, models, modelsProvider, reasoningEfforts, effortsRoute, failure,
    reload, selectProvider, selectRoute,
  }
}
