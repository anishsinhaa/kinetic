import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'framer-motion'
import { Button } from '../components/ui/Button'
import { Plus, Timer, Dumbbell, Loader2, Flame } from 'lucide-react'
import { cn } from '../lib/utils'
import { useWorkoutStore } from '../features/workout/store/useWorkoutStore'
import {
  addExerciseToWorkout,
  createWorkout,
  deleteSet,
  finishWorkout as finishWorkoutDb,
  getLatestCompletedWorkout,
  getLastPerformance,
  getExercisePersonalRecord,
  updateWorkoutLabel,
  updateWorkoutMeta,
  updateWorkoutExercise,
  upsertSet,
  getRecentWorkoutTypes,
} from '../features/workout/services/workoutService'
import { getUserSettings } from '../features/settings/services/settingsService'
import { createSetPersistQueue } from '../features/workout/lib/setPersistQueue'
import { resolveWorkoutTypes } from '../features/workout/lib/workoutTypes'
import { suggestNextType } from '../features/workout/lib/suggestNextType'
import { totalVolumeKg } from '../features/workout/lib/volume'
import { detectPrHits } from '../features/workout/lib/prDetection'
import { useCurrentUser } from '../features/auth/useAuth'
import { ExercisePickerSheet } from '../features/workout/components/ExercisePickerSheet'
import { SetStepperRow } from '../features/workout/components/SetStepperRow'
import { RestTimerRing } from '../features/workout/components/RestTimerRing'
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
  const [searchParams, setSearchParams] = useSearchParams()
  const reduceMotion = useReducedMotion()

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
        if (!setItem || !weId) return

        await upsertSet(payload.setId, weId, {
          reps: setItem.reps === '' ? null : parseInt(setItem.reps, 10),
          weight: setItem.weight === '' ? null : parseFloat(setItem.weight),
          to_failure: setItem.toFailure,
          set_index: payload.setIndex,
          completed_at: setItem.completedAt ?? (setItem.completed ? new Date().toISOString() : null),
        })
        useWorkoutStore.getState().updateSet(fresh.exercise.id, payload.setId, { dbSetId: payload.setId })
        setSaveError('')
        setSetStatusMap((prev) => ({ ...prev, [payload.setId]: 'saved' }))
      } catch (err) {
        setSaveError((err as Error).message)
        setSetStatusMap((prev) => ({ ...prev, [payload.setId]: 'error' }))
        throw err
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
                          weight: s.weight != null ? String(s.weight) : '',
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

  // Dashboard chip / Start with suggested type — skip the second "Pick a type" tap
  useEffect(() => {
    if (currentWorkoutId || startingRef.current) return
    const type = preselectedType?.trim()
    if (!type) return
    if (!(autoStart || Boolean(preselectedType))) return
    beginWorkoutWithType(type)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- start once per deep link
  }, [autoStart, preselectedType, currentWorkoutId])

  // Repeat last — start with last type as soon as latest workout loads
  useEffect(() => {
    if (currentWorkoutId || startingRef.current) return
    if (!isRepeatMode) return
    const label = latestWorkoutQuery.data?.label?.trim()
    if (!label) return
    beginWorkoutWithType(label)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRepeatMode, latestWorkoutQuery.data?.label, currentWorkoutId])

  const addExerciseFromLibrary = async (
    exercise: Exercise,
    options?: { initialSets?: Array<{ weight: string; reps: string }> },
  ) => {
    const workoutId = useWorkoutStore.getState().currentWorkoutId
    if (!workoutId) return

    // Optimistic card — render immediately
    useWorkoutStore.getState().addExercise({
      exerciseId: exercise.id,
      name: exercise.name,
      muscleGroup: exercise.muscleGroup,
      lastPerformance: 'Loading…',
      personalRecord: '…',
      target: 'maintain',
      initialSets: options?.initialSets ?? [{ weight: '', reps: '' }],
    })

    const added = useWorkoutStore.getState().exercises.find((e) => e.exerciseId === exercise.id)
    if (!added) return

    try {
      const orderIndex = useWorkoutStore.getState().exercises.findIndex((e) => e.id === added.id)
      const dbWeId = await addExerciseToWorkout(workoutId, exercise.id, Math.max(0, orderIndex))
      useWorkoutStore.getState().updateExerciseMeta(added.id, { dbWorkoutExerciseId: dbWeId })

      const lastSets =
        options?.initialSets != null
          ? options.initialSets.map((s) => ({
              weight: s.weight === '' ? null : parseFloat(s.weight),
              reps: s.reps === '' ? null : parseInt(s.reps, 10),
            }))
          : await getLastPerformance(userId, exercise.id)

      const pr = await getExercisePersonalRecord(userId, exercise.id, workoutId)
      const lastPerformance =
        lastSets.length > 0
          ? `Last: ${lastSets.map((s) => `${s.weight ?? '-'}x${s.reps ?? '-'}`).join(' · ')}`
          : 'No previous performance'
      const personalRecord = pr
        ? `PR: ${pr.weight ?? '-'}x${pr.reps ?? '-'}${pr.date ? ` (${pr.date})` : ''}`
        : 'No PR yet'
      const last = lastSets[0]
      const targetLabel = last
        ? `Target: ${targetPreview(last.weight, last.reps, 'maintain', weightStep)}`
        : undefined

      // Prefill sets if we didn't already (optimistic empty row)
      if (options?.initialSets == null && lastSets.length > 0) {
        const newSets = lastSets.map((s) => {
          const id =
            typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
          return {
            id,
            dbSetId: id,
            weight: s.weight != null ? String(s.weight) : '',
            reps: s.reps != null ? String(s.reps) : '',
            toFailure: false,
            completed: false,
            completedAt: null as string | null,
          }
        })
        useWorkoutStore.getState().updateExerciseMeta(added.id, {
          dbWorkoutExerciseId: dbWeId,
          lastPerformance,
          personalRecord,
          targetLabel,
          sets: newSets,
        })
      } else {
        useWorkoutStore.getState().updateExerciseMeta(added.id, {
          lastPerformance,
          personalRecord,
          targetLabel,
        })
      }

      const fresh = useWorkoutStore.getState().exercises.find((e) => e.id === added.id)
      if (fresh?.dbWorkoutExerciseId) {
        for (let i = 0; i < fresh.sets.length; i++) {
          queuePersist(fresh.id, fresh.sets[i].id, fresh.dbWorkoutExerciseId, i)
        }
        await persistQueueRef.current.flushAll()
      }
    } catch (err) {
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

  const incompleteSetCount = useMemo(
    () => exercises.reduce((n, e) => n + e.sets.filter((s) => !s.completed).length, 0),
    [exercises],
  )

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

      const fresh = useWorkoutStore.getState()
      const completedSets = fresh.exercises.flatMap((e) =>
        e.sets
          .filter((s) => s.completed)
          .map((s) => ({
            exerciseId: e.exerciseId,
            exerciseName: e.name,
            weight: s.weight === '' ? null : parseFloat(s.weight),
            reps: s.reps === '' ? null : parseInt(s.reps, 10),
            completed: true as const,
          })),
      )
      const volume = Math.round(totalVolumeKg(completedSets))

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
        prLabels: hits.map((h) => `${h.exerciseName} ${h.weight}x${h.reps}`),
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
      await latestWorkoutQuery.refetch()
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
              ['Volume', `${summarySnapshot.volumeKg} kg`],
              ['Sets', String(summarySnapshot.setCount)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-border bg-surface p-4">
                <p className="text-[10px] text-text-muted uppercase tracking-widest">{label}</p>
                <p className="text-xl font-black text-text-primary mt-1">{value}</p>
              </div>
            ))}
          </div>

          {summarySnapshot.prLabels.length > 0 && (
            <motion.div
              className="rounded-xl border border-primary/40 bg-primary/10 p-4 mb-6"
              initial={reduceMotion ? false : { scale: 0.95 }}
              animate={{ scale: 1 }}
            >
              <p className="text-sm font-bold text-primary flex items-center gap-2 mb-2">
                <Flame size={16} /> PRs hit
              </p>
              <ul className="space-y-1">
                {summarySnapshot.prLabels.map((p) => (
                  <li key={p} className="text-sm text-text-primary">
                    {p}
                  </li>
                ))}
              </ul>
            </motion.div>
          )}

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
              if (currentWorkoutId) {
                void updateWorkoutMeta(currentWorkoutId, {
                  feel,
                  note: note.trim() || null,
                })
              }
              useWorkoutStore.getState().finishWorkout()
              navigate('/')
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

            <div className="grid grid-cols-[2rem_1fr_1fr_3rem] gap-2 px-3 py-2 text-[10px] text-text-muted uppercase tracking-widest border-b border-border">
              <span>Set</span>
              <span className="text-center">Weight</span>
              <span className="text-center">Reps</span>
              <span />
            </div>

            {ex.sets.map((set, idx) => (
              <SetStepperRow
                key={set.id}
                index={idx}
                set={set}
                weightStep={weightStep}
                disabled={!canEdit}
                status={setStatusMap[set.id]}
                onChange={(patch) => {
                  useWorkoutStore.getState().updateSet(ex.id, set.id, patch)
                  queuePersist(ex.id, set.id, ex.dbWorkoutExerciseId, idx)
                }}
                onComplete={() => void handleCompleteSet(ex.id, set.id, idx)}
                onUncomplete={() => void handleUncompleteSet(ex.id, set.id, idx)}
              />
            ))}

            <button
              type="button"
              disabled={!canEdit}
              onClick={() => {
                void persistQueueRef.current.flushAll().then(() => {
                  useWorkoutStore.getState().addSet(ex.id)
                })
              }}
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

        {/* Spacer so Add set / Finish stay clear of compact rest bar */}
        {restEndsAt && <div className="h-14" aria-hidden />}
      </div>

      <RestTimerRing
        endsAt={restEndsAt}
        totalSeconds={restTotalSeconds}
        onSkip={() => useWorkoutStore.getState().clearRest()}
        onAdjust={(d) => useWorkoutStore.getState().adjustRest(d)}
        onComplete={() => useWorkoutStore.getState().clearRest()}
      />

      <div className="fixed bottom-16 md:bottom-0 left-0 md:left-52 right-0 bg-background/95 backdrop-blur border-t border-border px-4 py-3 z-30">
        {confirmFinish ? (
          <div className="max-w-md mx-auto space-y-2">
            {incompleteSetCount > 0 && (
              <p className="text-xs text-text-muted text-center">
                Discard {incompleteSetCount} incomplete set
                {incompleteSetCount === 1 ? '' : 's'}?
              </p>
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
                {isFinishing ? <Loader2 size={14} className="animate-spin" /> : 'Confirm finish'}
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
