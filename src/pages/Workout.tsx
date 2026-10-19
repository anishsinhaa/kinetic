import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'framer-motion'
import { Button } from '../components/ui/Button'
import { Plus, Timer, Dumbbell, Loader2 } from 'lucide-react'
import { cn } from '../lib/utils'
import { useWorkoutStore } from '../features/workout/store/useWorkoutStore'
import {
  addExerciseToWorkout,
  createWorkout,
  deleteSet,
  deleteWorkout,
  finishWorkout as finishWorkoutDb,
  getLatestCompletedWorkout,
  getExercisePersonalRecord,
  getExercisePrefillContext,
  updateWorkoutLabel,
  updateWorkoutMeta,
  updateWorkoutExercise,
  upsertSet,
  getRecentWorkoutTypes,
  deleteWorkoutExercise,
} from '../features/workout/services/workoutService'
import { useWorkoutStoreHydrated } from '../features/workout/hooks/useWorkoutStoreHydrated'
import { getUserSettings } from '../features/settings/services/settingsService'
import { createSetPersistQueue } from '../features/workout/lib/setPersistQueue'
import { resolveWorkoutTypes } from '../features/workout/lib/workoutTypes'
import { suggestNextType } from '../features/workout/lib/suggestNextType'
import { totalVolumeKg } from '../features/workout/lib/volume'
import { detectPrHits } from '../features/workout/lib/prDetection'
import { useCurrentUser } from '../features/auth/useAuth'
import {
  displayWeightString,
  formatVolume,
  formatWeight,
  kgToDisplay,
  roundDisplayWeight,
  toStoredKg,
} from '../features/settings/lib/units'
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
import type { WorkoutExerciseTarget } from '../lib/supabase/database.types'

function newClientId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
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
): string {
  if (weight == null || reps == null) return '—'
  if (!target || target === 'maintain') return `${weight}x${reps}`
  if (target === 'increase_weight') return `${+(weight + step).toFixed(2)}x${reps}`
  return `${weight}x${reps + 1}`
}

export default function Workout() {
  const { user } = useCurrentUser()
  const userId = user!.id
  const today = new Date().toISOString().slice(0, 10)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const reduceMotion = useReducedMotion()
  const addSetLockRef = useRef(0)
  const storeHydrated = useWorkoutStoreHydrated()

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
  const restEndsAt = useWorkoutStore((s) => s.restEndsAt)
  const restTotalSeconds = useWorkoutStore((s) => s.restTotalSeconds)
  const weightStep = useWorkoutStore((s) => s.weightStep)
  const units = useWorkoutStore((s) => s.units)
  const feel = useWorkoutStore((s) => s.feel)
  const note = useWorkoutStore((s) => s.note)
  const summarySnapshot = useWorkoutStore((s) => s.summarySnapshot)

  const [dbReady, setDbReady] = useState(true)
  const [saveError, setSaveError] = useState('')
  const [tick, setTick] = useState(0)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [confirmFinish, setConfirmFinish] = useState(false)
  const [isFinishing, setIsFinishing] = useState(false)
  const [setStatusMap, setSetStatusMap] = useState<Record<string, 'idle' | 'saving' | 'saved' | 'error'>>({})
  const startingRef = useRef(false)

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
        const reps =
          setItem.reps === '' ? null : Number.parseInt(setItem.reps, 10)
        const displayWeight =
          setItem.weight === '' ? null : Number.parseFloat(setItem.weight)
        // Store kg canonically — UI fields are in the user's display unit
        const weightKg =
          displayWeight != null && Number.isFinite(displayWeight)
            ? toStoredKg(displayWeight, units)
            : null
        const setPayload = {
          reps: reps != null && Number.isFinite(reps) ? reps : null,
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
    }, 300),
  )

  const latestWorkoutQuery = useQuery({
    queryKey: ['workout', 'latest-completed', userId],
    queryFn: () => getLatestCompletedWorkout(userId),
  })

  const recentTypesQuery = useQuery({
    queryKey: ['workout', 'recent-types', userId],
    queryFn: () => getRecentWorkoutTypes(userId),
  })

  useEffect(() => {
    void getUserSettings(userId)
      .then((s) => {
        const api = useWorkoutStore.getState()
        api.setWorkoutTypes(resolveWorkoutTypes(s.workoutTypes))
        api.setPrefs({
          weightStep: s.weightStep,
          restDefaultSeconds: s.restTimerSeconds,
          units: s.units,
        })
      })
      .catch(() => {
        useWorkoutStore.getState().setWorkoutTypes(resolveWorkoutTypes(null))
      })
  }, [userId])

  // Open type picker only when Start has no type (chips / suggested type auto-start below)
  useEffect(() => {
    if (currentWorkoutId) return
    if (preselectedType || isRepeatMode) return
    if (!autoStart) return
    if (useWorkoutStore.getState().phase === 'idle') {
      useWorkoutStore.getState().setPhase('type')
    }
  }, [autoStart, isRepeatMode, preselectedType, currentWorkoutId])

  // Resume persisted session
  useEffect(() => {
    if (!currentWorkoutId || phase !== 'idle') return
    useWorkoutStore
      .getState()
      .setPhase(warmupEndedAt || !warmupStartedAt ? 'training' : 'warmup')
  }, [currentWorkoutId, phase, warmupEndedAt, warmupStartedAt])

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
  const suggestedHighlight = useMemo(() => {
    if (preselectedType) return preselectedType
    if (isRepeatMode && latestWorkoutQuery.data?.label) return latestWorkoutQuery.data.label
    return suggestNextType(recentTypesQuery.data ?? [], typeChips)
  }, [
    preselectedType,
    isRepeatMode,
    latestWorkoutQuery.data?.label,
    recentTypesQuery.data,
    typeChips,
  ])

  const canEdit = Boolean(currentWorkoutId) && dbReady && phase === 'training'

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

  const beginWorkoutWithType = (typeLabel: string) => {
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
    api.startWorkout(workoutId, today, startedAt, normalizedType)
    setSearchParams({}, { replace: true })

    void (async () => {
      try {
        await createWorkout(userId, today, normalizedType, workoutId)
        setDbReady(true)

        if (isRepeatMode && latestWorkoutQuery.data?.exercises?.length) {
          const displayUnits = useWorkoutStore.getState().units
          for (const ex of latestWorkoutQuery.data.exercises) {
            try {
              await addExerciseFromLibrary(
                {
                  id: ex.exerciseId,
                  name: ex.name,
                  muscleGroup: ex.muscleGroup,
                } as Exercise,
                {
                  initialSets:
                    ex.sets.length > 0
                      ? ex.sets.map((s) => ({
                          weight: displayWeightString(s.weight, displayUnits),
                          reps: s.reps != null ? String(s.reps) : '',
                        }))
                      : undefined,
                },
              )
            } catch {
              // skip
            }
          }
        }
      } catch (err) {
        setSaveError((err as Error).message)
      } finally {
        startingRef.current = false
      }
    })()
  }

  // Dashboard chip / Start with type — honor URL type after persist rehydrates.
  // Empty abandoned sessions must not steal the chosen chip (e.g. Push → Pull).
  useEffect(() => {
    if (!storeHydrated || startingRef.current) return
    const type = preselectedType?.trim()
    if (!type) return
    if (!(autoStart || Boolean(preselectedType))) return

    const state = useWorkoutStore.getState()
    if (state.currentWorkoutId) {
      const hasCompleted = state.exercises.some((e) => e.sets.some((s) => s.completed))
      if (hasCompleted) {
        // Real in-progress session — resume; drop deep-link params
        setSearchParams({}, { replace: true })
        return
      }
      // Discard empty in-progress so the chip type wins
      const abandonId = state.currentWorkoutId
      void deleteWorkout(abandonId).catch(() => {})
      useWorkoutStore.getState().finishWorkout()
    }

    beginWorkoutWithType(type)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- start once per deep link
  }, [storeHydrated, autoStart, preselectedType])

  // Repeat last — start with last type as soon as latest workout loads
  useEffect(() => {
    if (!storeHydrated || startingRef.current) return
    if (useWorkoutStore.getState().currentWorkoutId) return
    if (!isRepeatMode) return
    const label = latestWorkoutQuery.data?.label?.trim()
    if (!label) return
    beginWorkoutWithType(label)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeHydrated, isRepeatMode, latestWorkoutQuery.data?.label])

  const addExerciseFromLibrary = async (
    exercise: Exercise,
    options?: { initialSets?: Array<{ weight: string; reps: string }> },
  ) => {
    const workoutId = useWorkoutStore.getState().currentWorkoutId
    if (!workoutId) return

    const needsAsyncPrefill = options?.initialSets == null

    // Optimistic card — set edits blocked until prefill settles (pending)
    useWorkoutStore.getState().addExercise({
      exerciseId: exercise.id,
      name: exercise.name,
      muscleGroup: exercise.muscleGroup,
      lastPerformance: needsAsyncPrefill ? 'Loading…' : undefined,
      personalRecord: needsAsyncPrefill ? '…' : undefined,
      target: 'maintain',
      prefillStatus: needsAsyncPrefill ? 'pending' : 'ready',
      initialSets: options?.initialSets ?? [{ weight: '', reps: '' }],
    })

    const added = useWorkoutStore.getState().exercises.find((e) => e.exerciseId === exercise.id)
    if (!added) return

    try {
      const orderIndex = useWorkoutStore.getState().exercises.findIndex((e) => e.id === added.id)
      const dbWeId = await addExerciseToWorkout(workoutId, exercise.id, Math.max(0, orderIndex))
      useWorkoutStore.getState().updateExerciseMeta(added.id, { dbWorkoutExerciseId: dbWeId })

      const displayUnits = useWorkoutStore.getState().units

      type PrefillRow = {
        weight: number | null
        reps: number | null
        displayWeight: number | null
      }
      let prefillRows: PrefillRow[] = []
      let pr: Awaited<ReturnType<typeof getExercisePersonalRecord>> = null

      if (options?.initialSets != null) {
        // Repeat-last: strings are already in display units
        prefillRows = options.initialSets.map((s) => ({
          weight:
            s.weight === '' ? null : toStoredKg(parseFloat(s.weight), displayUnits),
          reps: s.reps === '' ? null : parseInt(s.reps, 10),
          displayWeight: s.weight === '' ? null : parseFloat(s.weight),
        }))
      } else {
        const ctx = await queryClient.fetchQuery({
          queryKey: ['exercise-prefill', userId, exercise.id],
          queryFn: () => getExercisePrefillContext(userId, exercise.id, workoutId),
          staleTime: 1000 * 60 * 5,
        })
        pr = ctx.pr
        prefillRows = ctx.lastSets.map((s) => ({
          weight: s.weight,
          reps: s.reps,
          displayWeight:
            s.weight != null
              ? roundDisplayWeight(kgToDisplay(s.weight, displayUnits), displayUnits)
              : null,
        }))
      }

      const lastPerformance =
        prefillRows.length > 0
          ? `Last: ${prefillRows
              .map((s) => `${s.displayWeight ?? '-'}x${s.reps ?? '-'}`)
              .join(' · ')} ${displayUnits}`
          : 'No previous performance'
      const personalRecord = pr
        ? `PR: ${
            pr.weight != null
              ? roundDisplayWeight(kgToDisplay(pr.weight, displayUnits), displayUnits)
              : '-'
          }x${pr.reps ?? '-'}${pr.date ? ` (${pr.date})` : ''} ${displayUnits}`
        : 'No PR yet'
      const last = prefillRows[0]
      const targetLabel = last
        ? `Target: ${targetPreview(last.displayWeight, last.reps, 'maintain', weightStep)}`
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

      // Persist only non-empty drafts after prefill — empty exercises stay local until a set is logged
      const fresh = useWorkoutStore.getState().exercises.find((e) => e.id === added.id)
      if (fresh?.dbWorkoutExerciseId) {
        for (let i = 0; i < fresh.sets.length; i++) {
          const set = fresh.sets[i]
          if (!set.completed && set.weight === '' && set.reps === '') continue
          queuePersist(fresh.id, set.id, fresh.dbWorkoutExerciseId, i)
        }
        await persistQueueRef.current.flushAll()
      }
    } catch (err) {
      useWorkoutStore.getState().updateExerciseMeta(added.id, { prefillStatus: 'ready' })
      setSaveError((err as Error).message)
    }
  }

  const handlePickExercise = (exercise: Exercise) => {
    setPickerOpen(false)
    void addExerciseFromLibrary(exercise)
  }

  const handleCompleteSet = async (exerciseLocalId: string, setLocalId: string, index: number) => {
    const ex = useWorkoutStore.getState().exercises.find((e) => e.id === exerciseLocalId)
    useWorkoutStore.getState().completeSet(exerciseLocalId, setLocalId)
    queuePersist(exerciseLocalId, setLocalId, ex?.dbWorkoutExerciseId, index)
    await persistQueueRef.current.flush(setLocalId)
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

  const invalidateAfterWorkout = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'stats', userId] }),
      queryClient.invalidateQueries({ queryKey: ['workout'] }),
      queryClient.invalidateQueries({ queryKey: ['history'] }),
      queryClient.refetchQueries({ queryKey: ['dashboard', 'stats', userId] }),
      latestWorkoutQuery.refetch(),
    ])
  }

  const handleDeleteSet = async (exerciseLocalId: string, setLocalId: string) => {
    useWorkoutStore.getState().removeSet(exerciseLocalId, setLocalId)
    try {
      await deleteSet(setLocalId)
    } catch {
      // row may never have been persisted
    }
    setSetStatusMap((prev) => {
      const next = { ...prev }
      delete next[setLocalId]
      return next
    })
  }

  const handleAddSet = (exerciseLocalId: string) => {
    const now = Date.now()
    if (now - addSetLockRef.current < 400) return
    addSetLockRef.current = now
    void persistQueueRef.current.flushAll().then(() => {
      useWorkoutStore.getState().addSet(exerciseLocalId)
    })
  }

  const handleFinishConfirm = async () => {
    if (!currentWorkoutId) return
    setIsFinishing(true)
    try {
      await persistQueueRef.current.flushAll()

      const state = useWorkoutStore.getState()

      // Drop unchecked / empty rows from DB and store before totals
      for (const ex of state.exercises) {
        for (const s of ex.sets) {
          if (s.completed) continue
          try {
            await deleteSet(s.id)
          } catch {
            // ignore — row may never have been persisted
          }
          useWorkoutStore.getState().removeSet(ex.id, s.id)
        }
      }

      // Drop exercises with zero completed sets (don't persist empty WEs)
      const afterSets = useWorkoutStore.getState()
      for (const ex of afterSets.exercises) {
        const hasCompleted = ex.sets.some((s) => s.completed)
        if (hasCompleted) continue
        if (ex.dbWorkoutExerciseId) {
          try {
            await deleteWorkoutExercise(ex.dbWorkoutExerciseId)
          } catch {
            /* may already be gone */
          }
        }
        useWorkoutStore.setState((s) => ({
          exercises: s.exercises.filter((e) => e.id !== ex.id),
        }))
      }

      const fresh = useWorkoutStore.getState()
      const displayUnits = fresh.units
      // Volume / PR math uses canonical kg — only exercises that still have completed sets
      const completedSets = fresh.exercises.flatMap((e) =>
        e.sets
          .filter((s) => s.completed)
          .map((s) => ({
            exerciseId: e.exerciseId,
            exerciseName: e.name,
            weight:
              s.weight === '' ? null : toStoredKg(parseFloat(s.weight), displayUnits),
            reps: s.reps === '' ? null : parseInt(s.reps, 10),
            completed: true as const,
          })),
      )

      // Empty workout — discard entirely (don't count in history/stats)
      if (completedSets.length === 0) {
        await deleteWorkout(currentWorkoutId)
        useWorkoutStore.getState().finishWorkout()
        setConfirmFinish(false)
        await invalidateAfterWorkout()
        navigate('/')
        return
      }

      const volume = Math.round(totalVolumeKg(completedSets) * 10) / 10

      // Exclude current workout so already-upserted sets don't mask new PRs
      const prevPrs: Record<string, { weight: number; reps: number } | null> = {}
      for (const ex of fresh.exercises) {
        const pr = await getExercisePersonalRecord(userId, ex.exerciseId, currentWorkoutId)
        prevPrs[ex.exerciseId] =
          pr?.weight != null && pr.reps != null ? { weight: pr.weight, reps: pr.reps } : null
      }
      const hits = detectPrHits(completedSets, prevPrs)

      const warmupSec = fresh.warmupStartedAt
        ? Math.round(
            ((fresh.warmupEndedAt
              ? new Date(fresh.warmupEndedAt).getTime()
              : Date.now()) -
              new Date(fresh.warmupStartedAt).getTime()) /
              1000,
          )
        : 0

      useWorkoutStore.getState().setSummarySnapshot({
        durationSec: Math.round(elapsedMs / 1000),
        warmupSec: Math.max(0, warmupSec),
        volumeKg: volume,
        setCount: completedSets.length,
        prLabels: hits.map(
          (h) =>
            `${h.exerciseName} ${formatWeight(h.weight, displayUnits)} × ${h.reps}`,
        ),
      })

      await finishWorkoutDb(currentWorkoutId, {
        feel: fresh.feel,
        note: fresh.note.trim() || null,
      })
      await updateWorkoutMeta(currentWorkoutId, {
        warmup_started_at: fresh.warmupStartedAt,
        warmup_ended_at: fresh.warmupEndedAt,
        warmup_note: fresh.warmupNote.trim() || null,
        feel: fresh.feel,
        note: fresh.note.trim() || null,
      })

      useWorkoutStore.getState().setPhase('summary')
      setConfirmFinish(false)
      await invalidateAfterWorkout()
    } catch (err) {
      setSaveError((err as Error).message)
    } finally {
      setIsFinishing(false)
    }
  }

  // ── Idle / type picker ─────────────────────────────────────────────────────
  if (!currentWorkoutId || phase === 'type' || phase === 'idle') {
    const showType = phase === 'type' || autoStart || isRepeatMode || Boolean(preselectedType)
    return (
      <div className="p-4 md:p-8 pb-28">
        <p className="text-[10px] text-primary uppercase tracking-widest mb-1">Workout</p>
        <h1 className="text-3xl md:text-5xl font-black uppercase text-text-primary mb-4">
          {showType ? 'Pick a type' : 'Ready'}
        </h1>
        {saveError && <p className="text-xs text-red-400 mb-3">{saveError}</p>}

        {showType ? (
          <div className="flex flex-wrap gap-2">
            {typeChips.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => beginWorkoutWithType(type)}
                className={cn(
                  'px-3 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider border min-h-11',
                  suggestedHighlight === type
                    ? 'bg-primary text-black border-primary'
                    : 'border-border text-text-secondary hover:border-primary',
                )}
              >
                {type}
              </button>
            ))}
          </div>
        ) : (
          <Button
            variant="primary"
            size="lg"
            onClick={() => useWorkoutStore.getState().setPhase('type')}
          >
            <Dumbbell size={14} className="mr-2" />
            Start Workout
          </Button>
        )}
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
          <p className="text-[10px] text-primary uppercase tracking-widest mb-1">Session complete</p>
          <h1 className="text-3xl font-black text-text-primary mb-6">{workoutLabel || 'Workout'}</h1>

          <div className="grid grid-cols-2 gap-3 mb-6">
            {[
              ['Duration', formatElapsed(summarySnapshot.durationSec * 1000)],
              ['Warmup', formatElapsed(summarySnapshot.warmupSec * 1000)],
              ['Volume', formatVolume(summarySnapshot.volumeKg, units)],
              ['Sets', String(summarySnapshot.setCount)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-border bg-surface p-4">
                <p className="text-[10px] text-text-muted uppercase tracking-widest">{label}</p>
                <p className="text-xl font-black text-text-primary mt-1">{value}</p>
              </div>
            ))}
          </div>

          <PrCelebration labels={summarySnapshot.prLabels} />

          <p className="text-[10px] text-text-secondary uppercase tracking-widest mb-2">
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
              void (async () => {
                if (currentWorkoutId) {
                  try {
                    await updateWorkoutMeta(currentWorkoutId, {
                      feel,
                      note: note.trim() || null,
                    })
                  } catch {
                    /* still leave summary */
                  }
                }
                // Ensure dashboard "Workouts this week" refetches before home mounts
                await invalidateAfterWorkout()
                useWorkoutStore.getState().finishWorkout()
                navigate('/')
              })()
            }}
          >
            Done
          </Button>
        </motion.div>
      </div>
    )
  }

  // ── Warmup ─────────────────────────────────────────────────────────────────
  if (phase === 'warmup') {
    return (
      <div className="p-4 md:p-8 pb-28 max-w-lg mx-auto">
        <p className="text-[10px] text-primary uppercase tracking-widest mb-1">{workoutLabel}</p>
        <h1 className="text-3xl font-black text-text-primary mb-2">Warmup</h1>
        <p className="text-text-secondary text-sm mb-6">Optional — skip anytime.</p>

        <div className="rounded-2xl border border-border bg-surface p-8 text-center mb-4">
          <p className="text-[10px] text-text-muted uppercase tracking-widest mb-2 flex items-center justify-center gap-1">
            <Timer size={12} /> Warmup clock
          </p>
          <p className="text-5xl font-black tabular-nums text-text-primary">
            {formatElapsed(warmupElapsedMs)}
          </p>
        </div>

        <textarea
          value={warmupNote}
          onChange={(e) => useWorkoutStore.getState().setWarmupNote(e.target.value)}
          placeholder="Warmup note (optional)"
          rows={2}
          className="w-full mb-4 bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-hidden focus:border-primary"
        />

        <div className="flex flex-col gap-2">
          {!warmupStartedAt ? (
            <Button variant="primary" size="lg" onClick={() => useWorkoutStore.getState().startWarmup()}>
              Start Warmup
            </Button>
          ) : (
            <Button
              variant="primary"
              size="lg"
              onClick={() => {
                useWorkoutStore.getState().endWarmup()
                if (currentWorkoutId) {
                  void updateWorkoutMeta(currentWorkoutId, {
                    warmup_started_at: useWorkoutStore.getState().warmupStartedAt,
                    warmup_ended_at: new Date().toISOString(),
                    warmup_note: warmupNote.trim() || null,
                  })
                }
              }}
            >
              End Warmup
            </Button>
          )}
          <Button
            variant="ghost"
            size="md"
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
            Skip
          </Button>
        </div>
        {saveError && <p className="text-xs text-red-400 mt-3">{saveError}</p>}
      </div>
    )
  }

  // ── Training ───────────────────────────────────────────────────────────────
  return (
    <div className="pb-36">
      <div className="px-4 md:px-8 pt-5 md:pt-8 pb-4 border-b border-border sticky top-0 bg-background/95 backdrop-blur z-20">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] text-primary uppercase tracking-widest mb-1">Session</p>
            <h1 className="text-2xl md:text-4xl font-black uppercase text-text-primary">
              {workoutLabel || 'Workout'}
            </h1>
            <p className="text-text-secondary text-sm mt-1 flex items-center gap-1 tabular-nums">
              <Timer size={12} />
              {formatElapsed(elapsedMs)}
              {!dbReady && (
                <span className="ml-2 text-text-muted flex items-center gap-1">
                  <Loader2 size={10} className="animate-spin" /> syncing
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-3">
          {typeChips.map((type) => (
            <button
              key={type}
              type="button"
              disabled={!canEdit}
              onClick={() => {
                useWorkoutStore.getState().setWorkoutLabel(type)
                if (currentWorkoutId) void updateWorkoutLabel(currentWorkoutId, type)
              }}
              className={cn(
                'px-2.5 py-1.5 rounded-xl text-[10px] font-semibold uppercase tracking-wider border min-h-11',
                workoutLabel === type
                  ? 'bg-primary text-black border-primary'
                  : 'border-border text-text-secondary',
              )}
            >
              {type}
            </button>
          ))}
        </div>
        {saveError && <p className="text-xs text-red-400 mt-2">{saveError}</p>}
      </div>

      <div className="px-4 md:px-8 pt-4 space-y-4">
        {exercises.map((ex) => (
          <div key={ex.id} className="rounded-xl border border-border bg-surface overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="font-semibold text-text-primary">{ex.name}</h3>
              <p className="text-xs text-text-secondary mt-0.5">
                {ex.lastPerformance ?? 'No previous'}
                {ex.targetLabel ? ` · ${ex.targetLabel}` : ''}
              </p>
              <p className="text-[11px] text-primary mt-0.5">{ex.personalRecord ?? 'No PR yet'}</p>
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
                        targetLabel: `Target: ${targetPreview(w, r, value, weightStep)}`,
                      })
                    }}
                    className={cn(
                      'px-2 py-1 rounded-lg text-[10px] uppercase tracking-wider border',
                      ex.target === value
                        ? 'border-primary text-primary'
                        : 'border-border text-text-muted',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-[2rem_1fr_1fr_2.5rem_2.5rem] gap-1.5 px-2 sm:px-3 py-2 text-[10px] text-text-muted uppercase tracking-widest border-b border-border">
              <span>Set</span>
              <span className="text-center">Weight ({units})</span>
              <span className="text-center">Reps</span>
              <span />
              <span />
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
                disabled={!canEdit || ex.prefillStatus === 'pending'}
                status={setStatusMap[set.id]}
                onChange={(patch) => {
                  if (ex.prefillStatus === 'pending') return
                  useWorkoutStore.getState().updateSet(ex.id, set.id, patch)
                  queuePersist(ex.id, set.id, ex.dbWorkoutExerciseId, idx)
                }}
                onComplete={() => void handleCompleteSet(ex.id, set.id, idx)}
                onUncomplete={() => void handleUncompleteSet(ex.id, set.id, idx)}
                onDelete={() => void handleDeleteSet(ex.id, set.id)}
                onRetry={() => queuePersist(ex.id, set.id, ex.dbWorkoutExerciseId, idx)}
              />
            ))}

            <button
              type="button"
              disabled={!canEdit || ex.prefillStatus === 'pending'}
              onClick={() => handleAddSet(ex.id)}
              className="w-full py-3 text-xs text-text-secondary hover:text-primary flex items-center justify-center gap-1 border-t border-border disabled:opacity-40"
            >
              <Plus size={12} /> Add set
            </button>
          </div>
        ))}

        <button
          type="button"
          disabled={!canEdit}
          onClick={() => setPickerOpen(true)}
          className="w-full py-8 border border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-2 text-text-secondary hover:text-primary hover:border-primary disabled:opacity-40"
        >
          <Plus size={16} />
          <span className="text-xs uppercase tracking-widest font-medium">Add Exercise</span>
        </button>

        {/* Footer stack height reserve */}
        <div className={cn('h-24', restEndsAt && 'h-36')} aria-hidden />
      </div>

      <div
        className={cn(
          'fixed bottom-16 md:bottom-0 left-0 md:left-52 right-0 bg-background/95 backdrop-blur border-t border-border px-4 py-3',
          confirmFinish ? 'z-50' : 'z-30',
        )}
      >
        <RestTimerRing
          inline
          endsAt={restEndsAt}
          totalSeconds={restTotalSeconds}
          onSkip={() => useWorkoutStore.getState().clearRest()}
          onAdjust={(d) => useWorkoutStore.getState().adjustRest(d)}
          onComplete={() => useWorkoutStore.getState().clearRest()}
        />

        {confirmFinish ? (
          <div className="max-w-md mx-auto space-y-2">
            {completedSetCount === 0 ? (
              <p className="text-xs text-text-muted text-center">Discard empty workout?</p>
            ) : (
              incompleteSetCount > 0 && (
                <p className="text-xs text-text-muted text-center">
                  Discard {incompleteSetCount} incomplete set
                  {incompleteSetCount === 1 ? '' : 's'}?
                </p>
              )
            )}
            <div className="flex gap-2">
              <Button variant="ghost" size="md" className="flex-1" onClick={() => setConfirmFinish(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="md"
                className="flex-1"
                disabled={isFinishing}
                onClick={() => void handleFinishConfirm()}
              >
                {isFinishing ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : completedSetCount === 0 ? (
                  'Discard'
                ) : (
                  'Confirm finish'
                )}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="primary"
            size="lg"
            className="w-full max-w-md mx-auto"
            disabled={!canEdit}
            onClick={() => setConfirmFinish(true)}
          >
            Finish Workout
          </Button>
        )}
      </div>

      <ExercisePickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        userId={userId}
        workoutType={workoutLabel}
        excludeExerciseIds={exercises.map((e) => e.exerciseId)}
        onPick={handlePickExercise}
      />
    </div>
  )
}
