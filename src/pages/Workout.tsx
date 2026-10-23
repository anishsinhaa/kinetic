import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'framer-motion'
import { Button } from '../components/ui/Button'
import { BottomSheet } from '../components/ui/BottomSheet'
import { ChevronDown, EllipsisVertical, Plus, Timer, Dumbbell, Loader2, X } from 'lucide-react'
import { localDateString } from '../lib/localDate'
import { cn } from '../lib/utils'
import { useWorkoutStore } from '../features/workout/store/useWorkoutStore'
import {
  addExerciseToWorkout,
  createWorkout,
  deleteSet,
  deleteSets,
  deleteWorkout,
  deleteWorkoutExercise,
  deleteWorkoutExercises,
  finishWorkout as finishWorkoutDb,
  getLatestCompletedWorkout,
  getExercisePersonalRecord,
  getExercisePrefillContext,
  updateWorkoutLabel,
  updateWorkoutMeta,
  updateWorkoutExercise,
  upsertSet,
  getRecentWorkoutTypes,
} from '../features/workout/services/workoutService'
import { useWorkoutStoreHydrated } from '../features/workout/hooks/useWorkoutStoreHydrated'
import { useActiveSession } from '../features/workout/hooks/useActiveSession'
import { useToast } from '../components/ui/toastContext'
import { resolveSummaryTitle } from '../features/workout/lib/summaryTitle'
import { getUserSettings } from '../features/settings/services/settingsService'
import { createSetPersistQueue } from '../features/workout/lib/setPersistQueue'
import { resolveWorkoutTypes } from '../features/workout/lib/workoutTypes'
import { suggestNextType } from '../features/workout/lib/suggestNextType'
import { formatRelativeDate } from '../features/workout/lib/formatRelativeDate'
import { bestPersonalRecord, detectFirstLogs, detectPrHits } from '../features/workout/lib/prDetection'
import { useCurrentUser } from '../features/auth/useAuth'
import {
  displayWeightStringStepped,
  formatPrLine,
  formatSetLine,
  formatVolume,
  roundWeightForDisplay,
  snapToStep,
  toStoredKg,
  volumeKgMatchingDisplay,
} from '../features/settings/lib/units'
import { MAX_REPS, MAX_SET_WEIGHT_KG } from '../features/workout/constants'
import {
  buildPrefillDraftSets,
  isExerciseUntouched,
  shouldApplySetPrefill,
} from '../features/workout/lib/exercisePrefill'
import { ExercisePickerSheet } from '../features/workout/components/ExercisePickerSheet'
import { SetStepperRow } from '../features/workout/components/SetStepperRow'
import { RestTimerRing } from '../features/workout/components/RestTimerRing'
import { PrCelebration } from '../features/workout/components/PrCelebration'
import type { Exercise } from '../features/exercises/types'
import type { WeightUnits, WorkoutExerciseTarget } from '../lib/supabase/database.types'

function newClientId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

/** Nudge the page only when the next set sits under the floating rest bar. */
function revealRowAboveRest(completedSetId: string) {
  const current = document.querySelector(`[data-set-id="${completedSetId}"]`)
  if (!(current instanceof HTMLElement)) return
  const next = current.nextElementSibling
  const target = next instanceof HTMLElement ? next : current
  const bar = document.querySelector('[role="timer"]')
  const limit =
    bar instanceof HTMLElement ? bar.getBoundingClientRect().top : window.innerHeight
  const rect = target.getBoundingClientRect()
  if (rect.bottom <= limit - 8) return
  const scroller = current.closest('main')
  if (!(scroller instanceof HTMLElement)) return
  scroller.scrollBy({ top: rect.bottom - limit + 12, behavior: 'smooth' })
}

function formatElapsed(ms: number) {
  const h = String(Math.floor(ms / 3600000)).padStart(2, '0')
  const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0')
  const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')
  return `${h}:${m}:${s}`
}

function targetPreview(
  weight: number | null,
  reps: number | null,
  target: WorkoutExerciseTarget | null | undefined,
  step: number,
  units: WeightUnits,
): string {
  if (weight == null || reps == null) return '—'
  let nextWeight = weight
  let nextReps = reps
  if (target === 'increase_weight') nextWeight = +(weight + step).toFixed(2)
  else if (target === 'increase_reps') nextReps = reps + 1
  return formatSetLine(toStoredKg(nextWeight, units), nextReps, units, step)
}

export default function Workout() {
  const { user } = useCurrentUser()
  const userId = user!.id
  const today = localDateString()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const reduceMotion = useReducedMotion()
  const storeHydrated = useWorkoutStoreHydrated()
  const toast = useToast()
  // Resets a stale persisted session (ended / missing row, stuck summary) on load
  useActiveSession()

  const isRepeatMode = searchParams.get('repeat') === '1'
  const autoStart = searchParams.get('start') === '1'
  const preselectedType = searchParams.get('type')

  // Selectors only — never subscribe to the whole store (avoids update-depth loops)
  const phase = useWorkoutStore((s) => s.phase)
  const currentWorkoutId = useWorkoutStore((s) => s.currentWorkoutId)
  const workoutStartedAt = useWorkoutStore((s) => s.workoutStartedAt)
  const workoutLabel = useWorkoutStore((s) => s.workoutLabel)
  const workoutTypes = useWorkoutStore((s) => s.workoutTypes)
  const exercises = useWorkoutStore((s) => s.exercises)
  const warmupStartedAt = useWorkoutStore((s) => s.warmupStartedAt)
  const warmupEndedAt = useWorkoutStore((s) => s.warmupEndedAt)
  const warmupNote = useWorkoutStore((s) => s.warmupNote)
  const warmupDismissed = useWorkoutStore((s) => s.warmupDismissed)
  const restEndsAt = useWorkoutStore((s) => s.restEndsAt)
  const restTotalSeconds = useWorkoutStore((s) => s.restTotalSeconds)
  const weightStep = useWorkoutStore((s) => s.weightStep)
  const units = useWorkoutStore((s) => s.units)
  const exerciseMetaStale = useWorkoutStore((s) => s.exerciseMetaStale)
  const feel = useWorkoutStore((s) => s.feel)
  const note = useWorkoutStore((s) => s.note)
  const summarySnapshot = useWorkoutStore((s) => s.summarySnapshot)

  const [dbReady, setDbReady] = useState(true)
  const [saveError, setSaveError] = useState('')
  const [tick, setTick] = useState(0)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [typeSheetOpen, setTypeSheetOpen] = useState(false)
  const [pickedType, setPickedType] = useState<string | null>(null)
  const [confirmFinish, setConfirmFinish] = useState(false)
  const [exerciseMenuId, setExerciseMenuId] = useState<string | null>(null)
  const [removeConfirm, setRemoveConfirm] = useState(false)
  const swapIndexRef = useRef<number | null>(null)
  const [isFinishing, setIsFinishing] = useState(false)
  const [setStatusMap, setSetStatusMap] = useState<Record<string, 'idle' | 'saving' | 'saved' | 'error'>>({})
  /** Exercise names shown while Repeat last is still copying the previous session. */
  const [repeatPlaceholders, setRepeatPlaceholders] = useState<string[]>([])
  const startingRef = useRef(false)
  /** Resolves when the in-flight createWorkout finishes (already resolved when idle). */
  const workoutReadyRef = useRef<Promise<void>>(Promise.resolve())

  const persistQueueRef = useRef(
    createSetPersistQueue(async (payload) => {
      setSetStatusMap((prev) => ({ ...prev, [payload.setId]: 'saving' }))
      try {
        const fresh = useWorkoutStore
          .getState()
          .exercises.flatMap((e) => e.sets.map((s) => ({ exercise: e, set: s })))
          .find(({ set }) => set.id === payload.setId)
        const setItem = fresh?.set
        const weId = fresh?.exercise.dbWorkoutExerciseId ?? payload.workoutExerciseId
        if (!setItem || !weId) {
          setSetStatusMap((prev) => ({ ...prev, [payload.setId]: 'idle' }))
          return
        }

        // Skip empty unchecked rows — don't create junk DB rows
        if (!setItem.completed && setItem.weight === '' && setItem.reps === '') {
          try {
            await deleteSet(payload.setId)
          } catch {
            // may not exist yet
          }
          setSetStatusMap((prev) => ({ ...prev, [payload.setId]: 'idle' }))
          return
        }

        const units = useWorkoutStore.getState().units
        const rawReps =
          payload.reps != null && Number.isFinite(payload.reps)
            ? payload.reps
            : setItem.reps === ''
              ? null
              : Number.parseInt(setItem.reps, 10)
        const reps =
          rawReps != null && Number.isFinite(rawReps)
            ? Math.min(MAX_REPS, Math.max(0, Math.round(rawReps)))
            : null
        // The queued payload is the latest edit. Prefer it over the store row so a
        // summary built after this flush can't keep the pre-edit weight.
        const displayWeight =
          payload.weight != null && Number.isFinite(payload.weight)
            ? payload.weight
            : setItem.weight === ''
              ? null
              : Number.parseFloat(setItem.weight)
        // Store kg canonically — UI fields are in the user's display unit.
        // Clamp before insert: NUMERIC(6,2) rejects anything above 9999.99 kg.
        const weightKg =
          displayWeight != null && Number.isFinite(displayWeight)
            ? Math.min(MAX_SET_WEIGHT_KG, Math.max(0, toStoredKg(displayWeight, units)))
            : null
        const setPayload = {
          reps,
          weight: weightKg,
          to_failure: setItem.toFailure,
          set_index: payload.setIndex,
          completed_at: setItem.completed
            ? (setItem.completedAt ?? new Date().toISOString())
            : null,
        }

        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          const { enqueueOfflineOp } = await import('../lib/offline/syncQueue')
          enqueueOfflineOp({
            kind: 'upsert_set',
            payload: {
              setId: payload.setId,
              workoutExerciseId: weId,
              ...setPayload,
            },
          })
          useWorkoutStore.getState().updateSet(fresh.exercise.id, payload.setId, {
            dbSetId: payload.setId,
          })
          setSaveError('Offline — will sync when back online')
          setSetStatusMap((prev) => ({ ...prev, [payload.setId]: 'saved' }))
          return
        }

        await upsertSet(payload.setId, weId, setPayload)
        useWorkoutStore.getState().updateSet(fresh.exercise.id, payload.setId, {
          dbSetId: payload.setId,
        })
        setSaveError('')
        setSetStatusMap((prev) => ({ ...prev, [payload.setId]: 'saved' }))
      } catch (err) {
        console.error('[setPersist]', err)
        setSaveError((err as Error).message)
        setSetStatusMap((prev) => ({ ...prev, [payload.setId]: 'error' }))
        // Don't rethrow — keeps queue alive and clears "Saving…" via error status
      }
    }, 800),
  )

  const latestWorkoutQuery = useQuery({
    queryKey: ['workout', 'latest-completed', userId],
    queryFn: () => getLatestCompletedWorkout(userId),
  })

  const recentTypesQuery = useQuery({
    queryKey: ['workout', 'recent-types', userId],
    queryFn: () => getRecentWorkoutTypes(userId),
  })

  // Shared with the Settings page: edits there show up here without a refetch,
  // and the rest-timer default always comes from the same cached value.
  const settingsQuery = useQuery({
    queryKey: ['user-settings', userId],
    queryFn: () => getUserSettings(userId),
    staleTime: 5 * 60 * 1000,
  })
  const settings = settingsQuery.data

  useEffect(() => {
    if (!settings) return
    const api = useWorkoutStore.getState()
    api.setWorkoutTypes(resolveWorkoutTypes(settings.workoutTypes))
    api.setPrefs({
      weightStep: settings.weightStep,
      restDefaultSeconds: settings.restTimerSeconds,
      units: settings.units,
    })
  }, [settings])

  // Last / PR / target strings are preformatted. Settings can flip units while this
  // page is unmounted, so a persisted flag — not a units ref — decides the rebuild.
  useEffect(() => {
    if (!exerciseMetaStale) return
    if (!currentWorkoutId) {
      useWorkoutStore.getState().clearExerciseMetaStale()
      return
    }
    const workoutId = currentWorkoutId
    const sessionExercises = useWorkoutStore.getState().exercises
    if (sessionExercises.length === 0) {
      useWorkoutStore.getState().clearExerciseMetaStale()
      return
    }
    let cancelled = false
    void (async () => {
      await Promise.all(
        sessionExercises.map(async (ex) => {
          try {
            const ctx = await queryClient.fetchQuery({
              queryKey: ['exercise-prefill', userId, ex.exerciseId],
              queryFn: () => getExercisePrefillContext(userId, ex.exerciseId, workoutId),
              staleTime: 1000 * 60 * 5,
            })
            if (cancelled) return
            const liveState = useWorkoutStore.getState()
            if (liveState.currentWorkoutId !== workoutId) return
            const step = liveState.weightStep
            const liveUnits = liveState.units
            const live = liveState.exercises.find((e) => e.id === ex.id)
            if (!live) return
            const lastPerformance =
              ctx.lastSets.length > 0
                ? `Last: ${ctx.lastSets
                    .map((s) => formatSetLine(s.weight, s.reps, liveUnits, step))
                    .join(' · ')}`
                : 'No previous performance'
            const personalRecord = ctx.pr ? formatPrLine(ctx.pr, liveUnits, step) : 'No PR yet'
            const first = live.sets[0]
            const w = first && first.weight !== '' ? Number.parseFloat(first.weight) : null
            const r = first && first.reps !== '' ? Number.parseInt(first.reps, 10) : null
            const targetLabel =
              w != null && Number.isFinite(w) && r != null && Number.isFinite(r)
                ? `Target: ${targetPreview(w, r, live.target, step, liveUnits)}`
                : live.targetLabel
            liveState.updateExerciseMeta(ex.id, {
              lastPerformance,
              personalRecord,
              targetLabel,
            })
          } catch {
            // Sets were already converted. Leave the previous labels if prefill is unavailable.
          }
        }),
      )
      if (!cancelled) useWorkoutStore.getState().clearExerciseMetaStale()
    })()
    return () => {
      cancelled = true
    }
  }, [exerciseMetaStale, currentWorkoutId, queryClient, userId])

  useEffect(() => {
    if (settingsQuery.isError) {
      useWorkoutStore.getState().setWorkoutTypes(resolveWorkoutTypes(null))
    }
  }, [settingsQuery.isError])

  useEffect(() => {
    if (!currentWorkoutId || !workoutStartedAt) return
    const t = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [currentWorkoutId, workoutStartedAt])

  const elapsedMs = workoutStartedAt
    ? Math.max(0, Date.now() - new Date(workoutStartedAt).getTime())
    : 0

  const warmupElapsedMs = useMemo(() => {
    if (!warmupStartedAt) return 0
    const end = warmupEndedAt ? new Date(warmupEndedAt).getTime() : Date.now()
    return Math.max(0, end - new Date(warmupStartedAt).getTime())
    // tick forces refresh while timer runs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warmupStartedAt, warmupEndedAt, tick])

  const typeChips = useMemo(() => resolveWorkoutTypes(workoutTypes), [workoutTypes])

  // Derive suggestion — never write it into the store during render/effects
  const suggestedType = useMemo(
    () => suggestNextType(recentTypesQuery.data ?? [], typeChips) ?? typeChips[0] ?? '',
    [recentTypesQuery.data, typeChips],
  )
  const idleType = pickedType ?? suggestedType
  const suggestionsReady =
    (settingsQuery.isSuccess || settingsQuery.isError) &&
    (recentTypesQuery.isSuccess || recentTypesQuery.isError)
  const typePending = !suggestionsReady && pickedType == null

  // Don't wait on the workout-create round trip. The id exists as soon as Start
  // runs; DB inserts queue on `workoutReadyRef` until the row is actually there.
  const canEdit = Boolean(currentWorkoutId) && phase === 'training'

  const queuePersist = (
    exerciseLocalId: string,
    setLocalId: string,
    dbWorkoutExerciseId: string | undefined,
    index: number,
  ) => {
    if (!dbWorkoutExerciseId) return
    const exercise = useWorkoutStore.getState().exercises.find((e) => e.id === exerciseLocalId)
    const setItem = exercise?.sets.find((s) => s.id === setLocalId)
    if (!setItem) return
    persistQueueRef.current.schedule({
      setId: setLocalId,
      workoutExerciseId: dbWorkoutExerciseId,
      reps: setItem.reps === '' ? null : parseInt(setItem.reps, 10),
      weight: setItem.weight === '' ? null : parseFloat(setItem.weight),
      toFailure: setItem.toFailure,
      setIndex: index + 1,
    })
  }

  const beginWorkoutWithType = (typeLabel: string, typeExplicit = false, repeat = false) => {
    if (currentWorkoutId || startingRef.current) return
    const normalizedType = typeLabel.trim()
    if (!normalizedType) return

    startingRef.current = true
    const api = useWorkoutStore.getState()
    api.addWorkoutType(normalizedType)
    setDbReady(false)
    setSaveError('')

    const workoutId = newClientId()
    const startedAt = new Date().toISOString()
    if (repeat && latestWorkoutQuery.data?.exercises?.length) {
      setRepeatPlaceholders(
        [...latestWorkoutQuery.data.exercises]
          .sort((a, b) => a.orderIndex - b.orderIndex)
          .map((ex) => ex.name),
      )
    } else {
      setRepeatPlaceholders([])
    }
    api.startWorkout(workoutId, today, startedAt, normalizedType, typeExplicit)
    setSearchParams({}, { replace: true })

    let markReady = () => {}
    workoutReadyRef.current = new Promise<void>((resolve) => {
      markReady = resolve
    })

    void (async () => {
      try {
        await createWorkout(userId, today, normalizedType, workoutId)
        setDbReady(true)
        // Release waiters before copying exercises. Each add awaits this promise;
        // resolving it only after the loop deadlocks on the first exercise.
        markReady()

        if (repeat && latestWorkoutQuery.data?.exercises?.length) {
          const displayUnits = useWorkoutStore.getState().units
          const ordered = [...latestWorkoutQuery.data.exercises].sort(
            (a, b) => a.orderIndex - b.orderIndex,
          )
          // Prefill every exercise together, then add the cards in one pass.
          const prepared = await Promise.all(
            ordered.map(async (ex) => {
              const sets = [...ex.sets].sort((a, b) => a.setIndex - b.setIndex)
              let prefill: Awaited<ReturnType<typeof getExercisePrefillContext>> | null = null
              try {
                prefill = await queryClient.fetchQuery({
                  queryKey: ['exercise-prefill', userId, ex.exerciseId],
                  queryFn: () => getExercisePrefillContext(userId, ex.exerciseId, workoutId),
                  staleTime: 1000 * 60 * 5,
                })
              } catch {
                prefill = null
              }
              return { ex, sets, prefill }
            }),
          )
          if (useWorkoutStore.getState().currentWorkoutId === workoutId) {
            await Promise.all(
              prepared.map(async ({ ex, sets, prefill }) => {
                try {
                  await addExerciseFromLibrary(
                    {
                      id: ex.exerciseId,
                      name: ex.name,
                      muscleGroup: ex.muscleGroup,
                    } as Exercise,
                    {
                      initialSets:
                        sets.length > 0
                          ? sets.map((s) => ({
                              weight: displayWeightStringStepped(
                                s.weight,
                                displayUnits,
                                useWorkoutStore.getState().weightStep,
                              ),
                              reps: s.reps != null ? String(s.reps) : '',
                            }))
                          : undefined,
                      ...(prefill ? { prefill } : {}),
                    },
                  )
                } catch {
                  // skip this exercise and keep copying the rest
                }
              }),
            )
          }
        }
      } catch (err) {
        setSaveError((err as Error).message)
      } finally {
        startingRef.current = false
        setRepeatPlaceholders([])
        markReady()
      }
    })()
  }

  // Deep links: ?type=X starts X; a bare ?start=1 (Home's Start button) starts the
  // suggested type. Empty abandoned sessions must not steal an explicitly chosen type.
  useEffect(() => {
    if (!storeHydrated || startingRef.current) return
    const chosen = preselectedType?.trim()
    if (!chosen && !autoStart) return
    if (!chosen && !suggestionsReady) return

    const state = useWorkoutStore.getState()
    if (state.currentWorkoutId) {
      const hasCompleted = state.exercises.some((e) => e.sets.some((s) => s.completed))
      if (hasCompleted || !chosen) {
        // Real in-progress session — resume; drop deep-link params
        setSearchParams({}, { replace: true })
        return
      }
      // Discard empty in-progress so the chosen type wins
      const abandonId = state.currentWorkoutId
      void deleteWorkout(abandonId).catch(() => {})
      useWorkoutStore.getState().finishWorkout()
    }

    if (chosen) beginWorkoutWithType(chosen, true)
    else beginWorkoutWithType(suggestedType, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- start once per deep link
  }, [storeHydrated, autoStart, preselectedType, suggestionsReady])

  // Repeat last — start with last type as soon as latest workout loads
  useEffect(() => {
    if (!storeHydrated || startingRef.current) return
    if (useWorkoutStore.getState().currentWorkoutId) return
    if (!isRepeatMode) return
    const label = latestWorkoutQuery.data?.label?.trim()
    if (!label) return
    beginWorkoutWithType(label, false, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeHydrated, isRepeatMode, latestWorkoutQuery.data?.label])

  const addExerciseFromLibrary = async (
    exercise: Exercise,
    options?: {
      initialSets?: Array<{ weight: string; reps: string }>
      /** Already loaded. The card is created with Last/PR instead of waiting on a fetch. */
      prefill?: Awaited<ReturnType<typeof getExercisePrefillContext>>
    },
  ) => {
    const workoutId = useWorkoutStore.getState().currentWorkoutId
    if (!workoutId) return

    const known = options?.prefill
    const needsAsyncPrefill = options?.initialSets == null && !known
    const displayUnitsNow = useWorkoutStore.getState().units
    const stepNow = useWorkoutStore.getState().weightStep
    const lastPerformance = known
      ? known.lastSets.length > 0
        ? `Last: ${known.lastSets
            .map((s) => formatSetLine(s.weight, s.reps, displayUnitsNow, stepNow))
            .join(' · ')}`
        : 'No previous performance'
      : needsAsyncPrefill
        ? 'Loading…'
        : undefined
    const personalRecord = known
      ? known.pr
        ? formatPrLine(known.pr, displayUnitsNow, stepNow)
        : 'No PR yet'
      : needsAsyncPrefill
        ? '…'
        : undefined

    // Optimistic card — set edits blocked until prefill settles (pending)
    useWorkoutStore.getState().addExercise({
      exerciseId: exercise.id,
      name: exercise.name,
      muscleGroup: exercise.muscleGroup,
      lastPerformance,
      personalRecord,
      target: 'maintain',
      prefillStatus: needsAsyncPrefill ? 'pending' : 'ready',
      initialSets: options?.initialSets ?? [{ weight: '', reps: '' }],
    })

    const added = useWorkoutStore.getState().exercises.find((e) => e.exerciseId === exercise.id)
    if (!added) return

    try {
      // The card is already on screen. Wait for the workout row before the FK insert.
      await workoutReadyRef.current
      const liveWorkoutId = useWorkoutStore.getState().currentWorkoutId
      if (!liveWorkoutId) return
      const orderIndex = useWorkoutStore.getState().exercises.findIndex((e) => e.id === added.id)
      const dbWeId = await addExerciseToWorkout(liveWorkoutId, exercise.id, Math.max(0, orderIndex))
      if (!useWorkoutStore.getState().exercises.some((e) => e.id === added.id)) {
        await deleteWorkoutExercise(dbWeId).catch(() => {})
        return
      }
      useWorkoutStore.getState().updateExerciseMeta(added.id, { dbWorkoutExerciseId: dbWeId })

      const displayUnits = useWorkoutStore.getState().units
      const step = useWorkoutStore.getState().weightStep

      type PrefillRow = {
        weight: number | null
        reps: number | null
        displayWeight: number | null
      }
      // Same Last/PR lookup a normal add uses, including when sets were copied.
      const ctx =
        known ??
        (await queryClient.fetchQuery({
          queryKey: ['exercise-prefill', userId, exercise.id],
          queryFn: () => getExercisePrefillContext(userId, exercise.id, workoutId),
          staleTime: 1000 * 60 * 5,
        }))
      if (!ctx) return
      const pr = ctx.pr
      const prefillRows: PrefillRow[] =
        options?.initialSets != null
          ? options.initialSets.map((s) => ({
              weight:
                s.weight === '' ? null : toStoredKg(parseFloat(s.weight), displayUnits),
              reps: s.reps === '' ? null : parseInt(s.reps, 10),
              displayWeight: s.weight === '' ? null : parseFloat(s.weight),
            }))
          : ctx.lastSets.map((s) => ({
              weight: s.weight,
              reps: s.reps,
              displayWeight:
                s.weight != null ? roundWeightForDisplay(s.weight, displayUnits, step) : null,
            }))

      const lastPerformance =
        ctx.lastSets.length > 0
          ? `Last: ${ctx.lastSets
              .map((s) => formatSetLine(s.weight, s.reps, displayUnits, step))
              .join(' · ')}`
          : 'No previous performance'
      const personalRecord = pr ? formatPrLine(pr, displayUnits, step) : 'No PR yet'
      const last = prefillRows[0]
      const targetLabel = last
        ? `Target: ${targetPreview(last.displayWeight, last.reps, 'maintain', weightStep, displayUnits)}`
        : undefined

      // Re-read card: only replace sets if still untouched (never overwrite typed values)
      const current = useWorkoutStore.getState().exercises.find((e) => e.id === added.id)
      const untouched = current ? isExerciseUntouched(current.sets) : false
      const applySets = shouldApplySetPrefill({
        untouched,
        hasPrefillRows: needsAsyncPrefill && prefillRows.length > 0,
        alreadyApplied: current?.prefillStatus === 'ready',
      })

      if (applySets) {
        const oldIds = current?.sets.map((s) => s.id) ?? []
        const newSets = buildPrefillDraftSets(prefillRows, newClientId)
        useWorkoutStore.getState().updateExerciseMeta(added.id, {
          dbWorkoutExerciseId: dbWeId,
          lastPerformance,
          personalRecord,
          targetLabel,
          prefillStatus: 'ready',
          sets: newSets,
        })
        // Drop any optimistic empty rows that may have been persisted mid-flight
        for (const id of oldIds) {
          try {
            await deleteSet(id)
          } catch {
            /* may not exist */
          }
        }
      } else {
        useWorkoutStore.getState().updateExerciseMeta(added.id, {
          lastPerformance,
          personalRecord,
          targetLabel,
          prefillStatus: 'ready',
        })
      }
    } catch (err) {
      useWorkoutStore.getState().updateExerciseMeta(added.id, { prefillStatus: 'ready' })
      setSaveError((err as Error).message)
    }
  }

  const persistOrder = () => {
    let toasted = false
    useWorkoutStore.getState().exercises.forEach((ex, index) => {
      if (!ex.dbWorkoutExerciseId) return
      void updateWorkoutExercise(ex.dbWorkoutExerciseId, { order_index: index }).catch(() => {
        if (toasted) return
        toasted = true
        toast.show("Couldn't save the new order", { kind: 'error' })
      })
    })
  }

  const handleRemoveExercise = (exLocalId: string) => {
    const ex = useWorkoutStore.getState().exercises.find((e) => e.id === exLocalId)
    if (!ex) return
    useWorkoutStore.getState().removeExercise(ex.id)
    setSetStatusMap((prev) => {
      const next = { ...prev }
      for (const s of ex.sets) delete next[s.id]
      return next
    })
    if (ex.dbWorkoutExerciseId) {
      void deleteWorkoutExercise(ex.dbWorkoutExerciseId).catch(() => {
        toast.show("Couldn't remove the exercise", { kind: 'error' })
      })
    }
    persistOrder()
    setExerciseMenuId(null)
    setRemoveConfirm(false)
  }

  const handleMoveExercise = (exLocalId: string, dir: -1 | 1) => {
    const index = useWorkoutStore.getState().exercises.findIndex((e) => e.id === exLocalId)
    if (index < 0) return
    useWorkoutStore.getState().moveExercise(exLocalId, index + dir)
    persistOrder()
  }

  const handlePickExercise = (exercise: Exercise) => {
    setPickerOpen(false)
    const swapAt = swapIndexRef.current
    void (async () => {
      await addExerciseFromLibrary(exercise)
      if (swapAt == null) return
      swapIndexRef.current = null
      const created = useWorkoutStore
        .getState()
        .exercises.find((e) => e.exerciseId === exercise.id)
      if (!created) return
      useWorkoutStore.getState().moveExercise(created.id, swapAt)
      persistOrder()
    })()
  }

  const handleCompleteSet = async (exerciseLocalId: string, setLocalId: string, index: number) => {
    const ex = useWorkoutStore.getState().exercises.find((e) => e.id === exerciseLocalId)
    const setItem = ex?.sets.find((s) => s.id === setLocalId)
    // Complete swallows mousedown, so the weight field never blurs and snap-on-blur never runs.
    if (setItem && setItem.weight !== '') {
      const n = parseFloat(setItem.weight)
      if (Number.isFinite(n)) {
        useWorkoutStore.getState().updateSet(exerciseLocalId, setLocalId, {
          weight: String(snapToStep(n, useWorkoutStore.getState().weightStep)),
        })
      }
    }
    useWorkoutStore.getState().completeSet(exerciseLocalId, setLocalId, settings?.restTimerSeconds)
    queuePersist(exerciseLocalId, setLocalId, ex?.dbWorkoutExerciseId, index)
    await persistQueueRef.current.flush(setLocalId)
    // The rest bar covers the lower rows. Scroll only when the next row is actually
    // hidden behind it — don't jump the page on every completed set.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => revealRowAboveRest(setLocalId))
    })
  }

  const handleUncompleteSet = async (
    exerciseLocalId: string,
    setLocalId: string,
    index: number,
  ) => {
    const ex = useWorkoutStore.getState().exercises.find((e) => e.id === exerciseLocalId)
    useWorkoutStore.getState().uncompleteSet(exerciseLocalId, setLocalId)
    queuePersist(exerciseLocalId, setLocalId, ex?.dbWorkoutExerciseId, index)
    await persistQueueRef.current.flush(setLocalId)
  }

  const isEmptySetRow = (s: { weight: string; reps: string }) =>
    s.weight === '' && s.reps === ''

  const isFilledDraft = (s: { completed: boolean; weight: string; reps: string }) =>
    !s.completed && s.weight !== '' && s.reps !== ''

  const handleDoneWithExercise = async (exLocalId: string) => {
    const ex = useWorkoutStore.getState().exercises.find((e) => e.id === exLocalId)
    if (!ex) return
    const lastIndex = ex.sets.length - 1
    const last = lastIndex >= 0 ? ex.sets[lastIndex] : undefined
    if (last && isFilledDraft(last)) {
      await handleCompleteSet(exLocalId, last.id, lastIndex)
    }
    const fresh = useWorkoutStore.getState().exercises.find((e) => e.id === exLocalId)
    if (!fresh) return
    for (let i = fresh.sets.length - 1; i >= 0; i--) {
      const s = fresh.sets[i]
      if (!s || s.completed || s.weight !== '' || s.reps !== '') break
      useWorkoutStore.getState().removeSet(exLocalId, s.id)
    }
    useWorkoutStore.getState().setExerciseDone(exLocalId, true)
  }

  const incompleteSetCount = useMemo(
    () =>
      exercises.reduce(
        (n, e) => n + e.sets.filter((s) => !s.completed && !isEmptySetRow(s)).length,
        0,
      ),
    [exercises],
  )

  const completedSetCount = useMemo(
    () => exercises.reduce((n, e) => n + e.sets.filter((s) => s.completed).length, 0),
    [exercises],
  )

  const filledDraftCount = useMemo(
    () => exercises.reduce((n, e) => n + e.sets.filter(isFilledDraft).length, 0),
    [exercises],
  )

  const menuExercise = exercises.find((e) => e.id === exerciseMenuId) ?? null
  const menuIndex = menuExercise ? exercises.findIndex((e) => e.id === menuExercise.id) : -1

  /** Targeted, fire-and-forget cache refresh — never blocks navigation. */
  const invalidateAfterWorkout = () => {
    // Refetch even while Home is unmounted so week stats are current on arrival.
    void queryClient.invalidateQueries({
      queryKey: ['dashboard', 'stats', userId],
      refetchType: 'all',
    })
    void queryClient.invalidateQueries({
      queryKey: ['workout', 'latest-completed', userId],
      refetchType: 'all',
    })
    void queryClient.invalidateQueries({ queryKey: ['workout', 'recent-types', userId] })
    void queryClient.invalidateQueries({ queryKey: ['exercises', 'recent-ids', userId] })
    void queryClient.invalidateQueries({ queryKey: ['history'], refetchType: 'all' })
    void queryClient.invalidateQueries({ queryKey: ['progress'], refetchType: 'all' })
    // Last-session / PR cache is per exercise. Drop it so the next add shows this workout.
    const exerciseIds = useWorkoutStore.getState().exercises.map((ex) => ex.exerciseId)
    for (const exerciseId of exerciseIds) {
      void queryClient.invalidateQueries({
        queryKey: ['exercise-prefill', userId, exerciseId],
        refetchType: 'all',
      })
    }
  }

  const handleDeleteSet = (exerciseLocalId: string, setLocalId: string) => {
    const ex = useWorkoutStore.getState().exercises.find((e) => e.id === exerciseLocalId)
    const index = ex?.sets.findIndex((s) => s.id === setLocalId) ?? -1
    const removed = index >= 0 ? ex?.sets[index] : undefined
    if (!ex || !removed) return

    useWorkoutStore.getState().removeSet(exerciseLocalId, setLocalId)
    void deleteSet(setLocalId).catch(() => {
      // row may never have been persisted
    })
    setSetStatusMap((prev) => {
      const next = { ...prev }
      delete next[setLocalId]
      return next
    })

    // Undo puts the set back and re-saves it
    toast.show('Set deleted', {
      durationMs: 5000,
      action: {
        label: 'Undo',
        onAction: () => {
          useWorkoutStore.getState().restoreSet(exerciseLocalId, removed, index)
          if (removed.completed) {
            queuePersist(exerciseLocalId, setLocalId, ex.dbWorkoutExerciseId, index)
          }
        },
      },
    })
  }

  const handleAddSet = async (exerciseLocalId: string) => {
    const exercise = useWorkoutStore.getState().exercises.find((e) => e.id === exerciseLocalId)
    const lastIndex = (exercise?.sets.length ?? 0) - 1
    const last = lastIndex >= 0 ? exercise?.sets[lastIndex] : undefined
    if (last && isFilledDraft(last)) {
      await handleCompleteSet(exerciseLocalId, last.id, lastIndex)
    }
    useWorkoutStore.getState().addSet(exerciseLocalId)
  }

  const completeFilledDrafts = () => {
    const { exercises: list } = useWorkoutStore.getState()
    for (const ex of list) {
      ex.sets.forEach((s, index) => {
        if (!isFilledDraft(s)) return
        if (s.weight !== '') {
          const n = parseFloat(s.weight)
          if (Number.isFinite(n)) {
            useWorkoutStore.getState().updateSet(ex.id, s.id, {
              weight: String(snapToStep(n, useWorkoutStore.getState().weightStep)),
            })
          }
        }
        useWorkoutStore.getState().completeSet(ex.id, s.id, settings?.restTimerSeconds)
        queuePersist(ex.id, s.id, ex.dbWorkoutExerciseId, index)
      })
    }
    useWorkoutStore.getState().clearRest()
  }

  const handleSelectType = (type: string) => {
    setTypeSheetOpen(false)
    if (currentWorkoutId) {
      useWorkoutStore.getState().setWorkoutLabel(type)
      void updateWorkoutLabel(currentWorkoutId, type)
    } else {
      setPickedType(type)
    }
  }

  const handleFinishConfirm = async () => {
    if (!currentWorkoutId || isFinishing) return
    setIsFinishing(true)
    try {
      // Commit a focused weight/reps field (blur snaps and writes the store) before
      // the summary reads it. Otherwise a fast edit is saved but the snapshot
      // still has the previous value.
      const active = document.activeElement
      if (active instanceof HTMLElement) active.blur()

      const discarding = !useWorkoutStore
        .getState()
        .exercises.some((ex) => ex.sets.some((s) => s.completed))
      if (discarding) {
        persistQueueRef.current.cancel()
        const workoutId = currentWorkoutId
        let timer = 0
        try {
          await new Promise<void>((resolve, reject) => {
            timer = window.setTimeout(() => reject(new Error('Discard timed out')), 8000)
            void (async () => {
              try {
                await workoutReadyRef.current
                await deleteWorkout(workoutId)
                resolve()
              } catch (err) {
                reject(err instanceof Error ? err : new Error('Could not discard workout'))
              }
            })()
          })
          useWorkoutStore.getState().finishWorkout()
          setConfirmFinish(false)
          invalidateAfterWorkout()
          navigate('/')
        } catch (err) {
          toast.show(`Couldn't discard workout: ${(err as Error).message}`, { kind: 'error' })
        } finally {
          window.clearTimeout(timer)
        }
        return
      }

      const state = useWorkoutStore.getState()
      const workoutId = currentWorkoutId

      // Rows to drop: unchecked sets, and exercises with no completed set
      const incompleteSetIds = state.exercises.flatMap((ex) =>
        ex.sets.filter((s) => !s.completed).map((s) => s.id),
      )
      const emptyWeIds = state.exercises
        .filter((ex) => !ex.sets.some((s) => s.completed))
        .map((ex) => ex.dbWorkoutExerciseId)
        .filter((id): id is string => Boolean(id))

      // Local store first (synchronous) so the summary only sees completed work
      useWorkoutStore.setState((s) => ({
        exercises: s.exercises
          .filter((ex) => ex.sets.some((set) => set.completed))
          .map((ex) => ({ ...ex, sets: ex.sets.filter((set) => set.completed) })),
      }))

      const fresh = useWorkoutStore.getState()
      const publishSummary = (
        session: typeof fresh,
        labels?: { prLabels: string[]; firstLogLabels: string[] },
      ) => {
        const unitsNow = session.units
        const stepNow = session.weightStep
        const rows = session.exercises.flatMap((e) =>
          e.sets
            .filter((s) => s.completed)
            .map((s) => ({
              exerciseId: e.exerciseId,
              exerciseName: e.name,
              weight: s.weight === '' ? null : toStoredKg(parseFloat(s.weight), unitsNow),
              reps: s.reps === '' ? null : parseInt(s.reps, 10),
              completed: true as const,
            })),
        )
        const warmupSec = session.warmupStartedAt
          ? Math.round(
              ((session.warmupEndedAt
                ? new Date(session.warmupEndedAt).getTime()
                : Date.now()) -
                new Date(session.warmupStartedAt).getTime()) /
                1000,
            )
          : 0
        useWorkoutStore.getState().setSummarySnapshot({
          durationSec: Math.round(elapsedMs / 1000),
          warmupSec: Math.max(0, warmupSec),
          volumeKg: volumeKgMatchingDisplay(rows, unitsNow, stepNow),
          setCount: rows.length,
          title: resolveSummaryTitle({ label: session.workoutLabel }),
          prLabels: labels?.prLabels ?? session.summarySnapshot?.prLabels ?? [],
          firstLogLabels:
            labels?.firstLogLabels ?? session.summarySnapshot?.firstLogLabels ?? [],
          exercises: session.exercises.map((ex) => ({
            name: ex.name,
            sets: ex.sets.map((s) => ({
              weightKg: s.weight === '' ? null : toStoredKg(parseFloat(s.weight), unitsNow),
              reps: s.reps === '' ? null : parseInt(s.reps, 10),
            })),
          })),
        })
      }

      // Empty workout — discard entirely (don't count in history/stats)
      if (!fresh.exercises.some((ex) => ex.sets.some((s) => s.completed))) {
        await deleteWorkout(workoutId)
        useWorkoutStore.getState().finishWorkout()
        setConfirmFinish(false)
        invalidateAfterWorkout()
        navigate('/')
        return
      }

      // Summary first. Saves and PR lookups continue behind it.
      publishSummary(fresh, { prLabels: [], firstLogLabels: [] })
      useWorkoutStore.getState().setPhase('summary')
      setConfirmFinish(false)
      setIsFinishing(false)

      await workoutReadyRef.current
      await persistQueueRef.current.flushAll()
      const flushed = useWorkoutStore.getState()
      publishSummary(flushed)

      const [prResults] = await Promise.all([
        Promise.all(
          flushed.exercises.map((ex) =>
            getExercisePersonalRecord(userId, ex.exerciseId, workoutId),
          ),
        ),
        deleteSets(incompleteSetIds).catch(() => {
          /* rows may never have been persisted */
        }),
        deleteWorkoutExercises(emptyWeIds).catch(() => {
          /* may already be gone */
        }),
        finishWorkoutDb(workoutId, {
          feel: flushed.feel,
          note: flushed.note.trim() || null,
          warmup_started_at: flushed.warmupStartedAt,
          warmup_ended_at: flushed.warmupEndedAt,
          warmup_note: flushed.warmupNote.trim() || null,
        }),
      ])

      const prevPrs: Record<string, { weight: number; reps: number } | null> = {}
      const saved = useWorkoutStore.getState()
      const savedUnits = saved.units
      const step = saved.weightStep
      const savedSets = saved.exercises.flatMap((e) =>
        e.sets
          .filter((s) => s.completed)
          .map((s) => ({
            exerciseId: e.exerciseId,
            exerciseName: e.name,
            weight: s.weight === '' ? null : toStoredKg(parseFloat(s.weight), savedUnits),
            reps: s.reps === '' ? null : parseInt(s.reps, 10),
            completed: true as const,
          })),
      )
      flushed.exercises.forEach((ex, i) => {
        const pr = prResults[i]
        prevPrs[ex.exerciseId] =
          pr?.weight != null && pr.reps != null ? { weight: pr.weight, reps: pr.reps } : null
      })
      const hits = detectPrHits(savedSets, prevPrs)
      const firstLogs = detectFirstLogs(savedSets, prevPrs)
      publishSummary(saved, {
        prLabels: hits.map(
          (h) => `${h.exerciseName} ${formatSetLine(h.weight, h.reps, savedUnits, step)}`,
        ),
        firstLogLabels: firstLogs.map(
          (h) => `${h.exerciseName} ${formatSetLine(h.weight, h.reps, savedUnits, step)}`,
        ),
      })
      invalidateAfterWorkout()
    } catch (err) {
      const message = (err as Error).message
      setSaveError(message)
      toast.show(`Couldn't finish workout: ${message}`, { kind: 'error' })
    } finally {
      setIsFinishing(false)
    }
  }

  const typeSheet = (
    <BottomSheet
      open={typeSheetOpen}
      onClose={() => setTypeSheetOpen(false)}
      title="Workout type"
    >
      <div className="p-4 flex flex-wrap gap-2">
        {typeChips.map((type) => {
          const active = (currentWorkoutId ? workoutLabel : idleType) === type
          return (
            <button
              key={type}
              type="button"
              onClick={() => handleSelectType(type)}
              className={cn(
                'px-4 rounded-xl text-sm font-semibold uppercase tracking-wider border min-h-11',
                active
                  ? 'bg-primary text-black border-primary'
                  : 'border-border text-text-secondary hover:border-primary',
              )}
            >
              {type}
            </button>
          )
        })}
      </div>
    </BottomSheet>
  )

  // ── Idle ───────────────────────────────────────────────────────────────────
  if (!currentWorkoutId) {
    const starting = (autoStart || Boolean(preselectedType) || isRepeatMode) && !saveError
    const latest = latestWorkoutQuery.data
    return (
      <div className="p-4 md:p-8 pb-28 max-w-lg mx-auto">
        <p className="text-[11px] text-primary uppercase tracking-widest mb-1">Workout</p>
        <h1 className="text-3xl md:text-5xl font-black uppercase text-text-primary mb-6">Ready</h1>
        {saveError && <p className="text-xs text-red-400 mb-3">{saveError}</p>}

        {starting ? (
          <p className="flex items-center gap-2 text-sm text-text-secondary">
            <Loader2 size={16} className="animate-spin text-primary" /> Starting workout…
          </p>
        ) : (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setTypeSheetOpen(true)}
              aria-label={
                typePending
                  ? 'Workout type loading'
                  : `Workout type: ${idleType || 'none'}. Change`
              }
              className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 min-h-11 text-sm font-semibold uppercase tracking-wider text-text-primary hover:border-primary"
            >
              {typePending ? '…' : idleType || 'Pick type'}
              <ChevronDown size={14} className="text-text-secondary" />
            </button>

            <Button
              variant="primary"
              size="lg"
              className="w-full min-h-14 text-base"
              disabled={typePending || !idleType}
              onClick={() => beginWorkoutWithType(idleType, pickedType != null)}
            >
              <Dumbbell size={16} className="mr-2" />
              Start workout
            </Button>

            {latest && (
              <button
                type="button"
                disabled={typePending}
                onClick={() => beginWorkoutWithType(latest.label || idleType, false, true)}
                className="block mx-auto min-h-11 px-3 text-sm text-primary underline underline-offset-4 disabled:opacity-40"
              >
                Repeat last workout
              </button>
            )}

            {latest && (
              <div className="rounded-xl border border-border bg-surface p-4">
                <p className="text-[11px] text-text-secondary uppercase tracking-widest mb-1">
                  Last workout
                </p>
                <p className="text-sm font-semibold text-text-primary">
                  {latest.label || 'Workout'} · {formatRelativeDate(latest.date)}
                </p>
                <p className="text-xs text-text-secondary mt-1">
                  {latest.exerciseCount} exercise{latest.exerciseCount === 1 ? '' : 's'} ·{' '}
                  {latest.setCount} set{latest.setCount === 1 ? '' : 's'} ·{' '}
                  {formatVolume(latest.totalVolumeKg, units)}
                </p>
              </div>
            )}
          </div>
        )}
        {typeSheet}
      </div>
    )
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  if (phase === 'summary' && summarySnapshot) {
    return (
      <div className="p-4 md:p-8 pb-28 max-w-lg mx-auto">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <p className="text-[11px] text-primary uppercase tracking-widest mb-1">Session complete</p>
          <h1 className="text-3xl font-black text-text-primary mb-6">
            {summarySnapshot.title || 'Workout'}
          </h1>

          <div className="grid grid-cols-2 gap-3 mb-6">
            {[
              ['Duration', formatElapsed(summarySnapshot.durationSec * 1000)],
              ['Warmup', formatElapsed(summarySnapshot.warmupSec * 1000)],
              ['Volume', formatVolume(summarySnapshot.volumeKg, units)],
              ['Sets', String(summarySnapshot.setCount)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-border bg-surface p-4">
                <p className="text-[11px] text-text-muted uppercase tracking-widest">{label}</p>
                <p className="text-xl font-black text-text-primary mt-1">{value}</p>
              </div>
            ))}
          </div>

          <PrCelebration labels={summarySnapshot.prLabels} />

          {(summarySnapshot.firstLogLabels?.length ?? 0) > 0 && (
            <div className="rounded-xl border border-border bg-surface p-4 mb-6">
              <p className="text-[11px] text-text-secondary uppercase tracking-widest mb-2">
                First log
              </p>
              <ul className="space-y-1">
                {summarySnapshot.firstLogLabels?.map((label) => (
                  <li key={label} className="text-sm text-text-primary">
                    {label}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(summarySnapshot.exercises?.length ?? 0) > 0 && (
            <div className="space-y-3 mb-6">
              {summarySnapshot.exercises?.map((ex, i) => {
                const best = bestPersonalRecord(
                  ex.sets.map((s) => ({ weight: s.weightKg, reps: s.reps })),
                )
                return (
                  <div key={`${ex.name}-${i}`} className="rounded-xl border border-border bg-surface p-4">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-sm font-semibold text-text-primary">{ex.name}</p>
                      {best && (
                        <p className="text-[11px] text-primary shrink-0">
                          Best {formatSetLine(best.weight, best.reps, units, weightStep)}
                        </p>
                      )}
                    </div>
                    <ul className="mt-2 space-y-0.5">
                      {ex.sets.map((s, si) => (
                        <li key={si} className="text-xs text-text-secondary tabular-nums">
                          {si + 1}. {formatSetLine(s.weightKg, s.reps, units, weightStep)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          )}

          <p className="text-[11px] text-text-secondary uppercase tracking-widest mb-2">
            How did it feel? (optional)
          </p>
          <div className="flex gap-2 mb-4">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => useWorkoutStore.getState().setFeel(n)}
                className={cn(
                  'flex-1 min-h-11 rounded-xl border text-sm font-bold',
                  feel === n
                    ? 'bg-primary text-black border-primary'
                    : 'border-border text-text-secondary',
                )}
              >
                {n}
              </button>
            ))}
          </div>
          <textarea
            value={note}
            onChange={(e) => useWorkoutStore.getState().setNote(e.target.value)}
            placeholder="Session note…"
            rows={3}
            className="w-full mb-6 bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-hidden focus:border-primary"
          />

          <Button
            variant="primary"
            size="lg"
            className="w-full"
            onClick={() => {
              // Optimistic: leave immediately, save feel/note in the background
              const workoutId = currentWorkoutId
              const noteValue = note.trim() || null
              const feelValue = feel
              useWorkoutStore.getState().finishWorkout()
              navigate('/')
              if (workoutId && (feelValue != null || noteValue)) {
                void updateWorkoutMeta(workoutId, { feel: feelValue, note: noteValue })
                  .catch((err: Error) =>
                    toast.show(`Couldn't save feel/note: ${err.message}`, { kind: 'error' }),
                  )
                  .finally(invalidateAfterWorkout)
              } else {
                invalidateAfterWorkout()
              }
            }}
          >
            Done
          </Button>
        </motion.div>
      </div>
    )
  }

  // ── Training ───────────────────────────────────────────────────────────────
  const showWarmup = !warmupDismissed && completedSetCount === 0
  return (
    <div
      className={cn(
        restEndsAt && !confirmFinish
          ? 'pb-[calc(4rem+env(safe-area-inset-bottom,0px))]'
          : 'pb-32',
      )}
    >
      {/* Compact header: type pill · timer · Finish (sticks under the section tabs) */}
      <div className="px-3 md:px-8 py-2 border-b border-border sticky top-12.25 bg-background/95 backdrop-blur z-20">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => setTypeSheetOpen(true)}
            aria-label={`Workout type: ${workoutLabel || 'Workout'}. Change`}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 min-h-11 text-sm font-semibold uppercase tracking-wider text-text-primary hover:border-primary disabled:opacity-60 max-w-[45%]"
          >
            <span className="truncate">{workoutLabel || 'Workout'}</span>
            <ChevronDown size={14} className="text-text-secondary shrink-0" />
          </button>
          <p className="text-text-secondary text-sm flex items-center gap-1 tabular-nums">
            <Timer size={14} />
            {formatElapsed(elapsedMs)}
            {!dbReady && <Loader2 size={12} className="animate-spin text-text-muted ml-1" />}
          </p>
          <Button
            variant="primary"
            size="md"
            className="min-h-11"
            disabled={!canEdit}
            onClick={() => setConfirmFinish(true)}
          >
            Finish
          </Button>
        </div>
        {saveError && <p className="text-xs text-red-400 mt-1">{saveError}</p>}
      </div>

      <div className="px-3 md:px-8 pt-4 space-y-4">
        {showWarmup && (
          <div className="rounded-xl border border-border bg-surface p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-text-primary">
                Warmup <span className="text-text-secondary font-normal">(optional)</span>
              </p>
              <button
                type="button"
                aria-label="Dismiss warmup"
                className="min-h-11 min-w-11 flex items-center justify-center text-text-muted hover:text-text-primary"
                onClick={() => {
                  useWorkoutStore.getState().skipWarmup()
                  if (currentWorkoutId) {
                    void updateWorkoutMeta(currentWorkoutId, {
                      warmup_started_at: null,
                      warmup_ended_at: null,
                      warmup_note: warmupNote.trim() || null,
                    })
                  }
                }}
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex items-center gap-3 mt-1">
              <p className="text-2xl font-black tabular-nums text-text-primary">
                {formatElapsed(warmupElapsedMs)}
              </p>
              {!warmupStartedAt ? (
                <Button
                  variant="secondary"
                  size="md"
                  className="min-h-11"
                  onClick={() => useWorkoutStore.getState().startWarmup()}
                >
                  Start warmup
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="md"
                  className="min-h-11"
                  onClick={() => {
                    useWorkoutStore.getState().endWarmup()
                    if (currentWorkoutId) {
                      void updateWorkoutMeta(currentWorkoutId, {
                        warmup_started_at: useWorkoutStore.getState().warmupStartedAt,
                        warmup_ended_at: useWorkoutStore.getState().warmupEndedAt,
                        warmup_note: warmupNote.trim() || null,
                      })
                    }
                  }}
                >
                  End warmup
                </Button>
              )}
            </div>
            {warmupStartedAt && (
              <textarea
                value={warmupNote}
                onChange={(e) => useWorkoutStore.getState().setWarmupNote(e.target.value)}
                placeholder="Warmup note (optional)"
                rows={2}
                className="w-full mt-2 bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-hidden focus:border-primary"
              />
            )}
          </div>
        )}

        {exercises.length === 0 &&
          repeatPlaceholders.map((name, i) => (
            <div
              key={`${name}-${i}`}
              className="rounded-xl border border-border bg-surface px-4 py-3"
            >
              <h3 className="font-semibold text-text-primary">{name}</h3>
              <p className="mt-1 flex items-center gap-2 text-xs text-text-secondary">
                <Loader2 size={14} className="animate-spin text-primary" />
                Loading last workout…
              </p>
            </div>
          ))}

        {exercises.map((ex) => (
          <div key={ex.id} className="rounded-xl border border-border bg-surface overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-text-primary min-w-0 flex items-center gap-2">
                  <span className="truncate">{ex.name}</span>
                  {ex.done && (
                    <span className="shrink-0 text-[11px] font-medium text-primary">✓ Done</span>
                  )}
                </h3>
                <div className="flex items-center shrink-0 -mr-2">
                  {ex.done && (
                    <button
                      type="button"
                      onClick={() => useWorkoutStore.getState().setExerciseDone(ex.id, false)}
                      className="text-sm text-primary px-2 min-h-11"
                    >
                      Edit
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={`Exercise options for ${ex.name}`}
                    onClick={() => {
                      setRemoveConfirm(false)
                      setExerciseMenuId(ex.id)
                    }}
                    className="min-h-11 min-w-11 flex items-center justify-center text-text-secondary"
                  >
                    <EllipsisVertical size={18} />
                  </button>
                </div>
              </div>
              <p className="text-xs text-text-secondary mt-0.5">
                {ex.lastPerformance ?? 'No previous'}
                {ex.targetLabel ? ` · ${ex.targetLabel}` : ''}
              </p>
              <p className="text-[11px] text-primary mt-0.5">{ex.personalRecord ?? 'No PR yet'}</p>
              {!ex.done && (
              <div className="flex flex-wrap gap-2 mt-2">
                {(
                  [
                    ['maintain', 'Maintain'],
                    ['increase_weight', '+ Weight'],
                    ['increase_reps', '+ Reps'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    disabled={!canEdit}
                    onClick={() => {
                      useWorkoutStore.getState().updateExerciseMeta(ex.id, { target: value })
                      if (ex.dbWorkoutExerciseId) {
                        void updateWorkoutExercise(ex.dbWorkoutExerciseId, { target: value })
                      }
                      const last = ex.sets[0]
                      const w = last?.weight ? parseFloat(last.weight) : null
                      const r = last?.reps ? parseInt(last.reps, 10) : null
                      useWorkoutStore.getState().updateExerciseMeta(ex.id, {
                        targetLabel: `Target: ${targetPreview(w, r, value, weightStep, units)}`,
                      })
                    }}
                    className={cn(
                      'px-3 min-h-9 rounded-lg text-[11px] uppercase tracking-wider border',
                      ex.target === value
                        ? 'border-primary text-primary'
                        : 'border-border text-text-muted',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              )}
            </div>

            {ex.prefillStatus === 'pending' && (
              <p className="px-3 py-2 text-[11px] text-text-muted border-b border-border">
                Loading last session…
              </p>
            )}

            {ex.sets.map((set, idx) => (
              <SetStepperRow
                key={set.id}
                index={idx}
                set={set}
                weightStep={weightStep}
                units={units}
                disabled={!canEdit || ex.prefillStatus === 'pending' || Boolean(ex.done)}
                status={setStatusMap[set.id]}
                onChange={(patch) => {
                  if (ex.prefillStatus === 'pending') return
                  // Completed sets stay completed — edited in place, rest timer untouched
                  useWorkoutStore.getState().updateSet(ex.id, set.id, patch)
                  if (set.completed) queuePersist(ex.id, set.id, ex.dbWorkoutExerciseId, idx)
                }}
                onComplete={() => void handleCompleteSet(ex.id, set.id, idx)}
                onUncomplete={() => void handleUncompleteSet(ex.id, set.id, idx)}
                onDelete={() => handleDeleteSet(ex.id, set.id)}
                onRetry={() => queuePersist(ex.id, set.id, ex.dbWorkoutExerciseId, idx)}
              />
            ))}

            {!ex.done && (
              <>
                <button
                  type="button"
                  disabled={!canEdit || ex.prefillStatus === 'pending'}
                  onClick={() => void handleAddSet(ex.id)}
                  className="w-full min-h-12 text-sm text-text-secondary hover:text-primary flex items-center justify-center gap-1 border-t border-border disabled:opacity-40"
                >
                  <Plus size={14} /> Add set
                </button>
                <button
                  type="button"
                  disabled={!canEdit || ex.prefillStatus === 'pending'}
                  onClick={() => void handleDoneWithExercise(ex.id)}
                  className="w-full min-h-12 text-sm text-primary border-t border-border disabled:opacity-40"
                >
                  Done with {ex.name}
                </button>
              </>
            )}
          </div>
        ))}

        <button
          type="button"
          disabled={!canEdit}
          onClick={() => {
            swapIndexRef.current = null
            setPickerOpen(true)
          }}
          className="w-full py-8 border border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-2 text-text-secondary hover:text-primary hover:border-primary disabled:opacity-40"
        >
          <Plus size={16} />
          <span className="text-xs uppercase tracking-widest font-medium">Add Exercise</span>
        </button>
        {restEndsAt && !confirmFinish && <div aria-hidden className="h-44" />}
      </div>

      {/* Hidden while the finish confirmation is open so it can't cover the actions */}
      {restEndsAt && !confirmFinish && (
        <RestTimerRing
          endsAt={restEndsAt}
          totalSeconds={restTotalSeconds}
          onSkip={() => useWorkoutStore.getState().clearRest()}
          onAdjust={(d) => useWorkoutStore.getState().adjustRest(d)}
          onComplete={() => useWorkoutStore.getState().clearRest()}
        />
      )}

      <BottomSheet
        open={confirmFinish}
        onClose={() => {
          if (!isFinishing) setConfirmFinish(false)
        }}
        title={
          filledDraftCount > 0
            ? 'Finish workout?'
            : completedSetCount === 0
              ? 'Discard workout?'
              : 'Finish workout?'
        }
      >
        <div className="p-4 space-y-4">
          {filledDraftCount > 0 ? (
            <>
              <p className="text-sm text-text-secondary">
                {filledDraftCount} set{filledDraftCount === 1 ? '' : 's'} have weight and reps but
                aren&apos;t logged yet.
              </p>
              <button
                type="button"
                disabled={isFinishing}
                onClick={() => setConfirmFinish(false)}
                className="text-sm text-text-secondary hover:text-text-primary disabled:opacity-40"
              >
                Cancel
              </button>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="lg"
                  className="flex-1 min-h-12"
                  disabled={isFinishing}
                  onClick={() => void handleFinishConfirm()}
                >
                  {completedSetCount > 0 ? 'Finish without them' : 'Discard workout'}
                </Button>
                <Button
                  variant="primary"
                  size="lg"
                  className="flex-1 min-h-12"
                  disabled={isFinishing}
                  onClick={() => {
                    completeFilledDrafts()
                    void handleFinishConfirm()
                  }}
                >
                  {isFinishing ? (
                    <>
                      <Loader2 size={16} className="animate-spin mr-2" /> Saving…
                    </>
                  ) : (
                    `Log ${filledDraftCount} set${filledDraftCount === 1 ? '' : 's'} & finish`
                  )}
                </Button>
              </div>
            </>
          ) : (
            <>
              {completedSetCount === 0 ? (
                <p className="text-sm text-text-secondary">
                  No sets were completed, so this workout will be discarded.
                </p>
              ) : (
                <p className="text-sm text-text-secondary">
                  {completedSetCount} completed set{completedSetCount === 1 ? '' : 's'} will be saved.
                  {incompleteSetCount > 0 &&
                    ` ${incompleteSetCount} incomplete set${incompleteSetCount === 1 ? '' : 's'} will be discarded.`}
                </p>
              )}
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="lg"
                  className="flex-1 min-h-12"
                  disabled={isFinishing}
                  onClick={() => setConfirmFinish(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="lg"
                  className="flex-1 min-h-12"
                  disabled={isFinishing}
                  onClick={() => void handleFinishConfirm()}
                >
                  {isFinishing ? (
                    <>
                      <Loader2 size={16} className="animate-spin mr-2" /> Saving…
                    </>
                  ) : completedSetCount === 0 ? (
                    'Discard'
                  ) : (
                    'Finish workout'
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      </BottomSheet>

      {typeSheet}

      <BottomSheet
        open={menuExercise != null}
        onClose={() => {
          setExerciseMenuId(null)
          setRemoveConfirm(false)
        }}
        title={menuExercise?.name ?? 'Exercise'}
      >
        {menuExercise && removeConfirm ? (
          <div className="p-4 space-y-4">
            <p className="text-sm text-text-secondary">
              Remove {menuExercise.name}?{' '}
              {menuExercise.sets.filter((s) => s.completed).length} logged set
              {menuExercise.sets.filter((s) => s.completed).length === 1 ? '' : 's'} will be
              deleted.
            </p>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="lg"
                className="flex-1 min-h-12"
                onClick={() => setRemoveConfirm(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="lg"
                className="flex-1 min-h-12"
                onClick={() => handleRemoveExercise(menuExercise.id)}
              >
                Remove
              </Button>
            </div>
          </div>
        ) : (
          menuExercise && (
            <div className="p-4 flex flex-col gap-2">
              <button
                type="button"
                disabled={menuIndex <= 0}
                onClick={() => handleMoveExercise(menuExercise.id, -1)}
                className="w-full min-h-12 rounded-xl border border-border px-4 text-sm font-semibold text-text-primary disabled:opacity-40"
              >
                Move up
              </button>
              <button
                type="button"
                disabled={menuIndex < 0 || menuIndex >= exercises.length - 1}
                onClick={() => handleMoveExercise(menuExercise.id, 1)}
                className="w-full min-h-12 rounded-xl border border-border px-4 text-sm font-semibold text-text-primary disabled:opacity-40"
              >
                Move down
              </button>
              {!menuExercise.sets.some((s) => s.completed) && (
                <button
                  type="button"
                  onClick={() => {
                    swapIndexRef.current = menuIndex
                    handleRemoveExercise(menuExercise.id)
                    setPickerOpen(true)
                  }}
                  className="w-full min-h-12 rounded-xl border border-border px-4 text-sm font-semibold text-text-primary"
                >
                  Swap exercise
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (menuExercise.sets.some((s) => s.completed)) {
                    setRemoveConfirm(true)
                    return
                  }
                  handleRemoveExercise(menuExercise.id)
                }}
                className="w-full min-h-12 rounded-xl border border-border px-4 text-sm font-semibold text-red-400"
              >
                Remove exercise
              </button>
            </div>
          )
        )}
      </BottomSheet>

      <ExercisePickerSheet
        open={pickerOpen}
        onClose={() => {
          swapIndexRef.current = null
          setPickerOpen(false)
        }}
        userId={userId}
        workoutType={workoutLabel}
        excludeExerciseIds={exercises.map((e) => e.exerciseId)}
        onPick={handlePickExercise}
      />
    </div>
  )
}
