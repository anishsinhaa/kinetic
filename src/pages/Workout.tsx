import { useEffect, useMemo, useRef, useState, type FocusEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Button } from '../components/ui/Button'
import { Toggle } from '../components/ui/Toggle'
import { Plus, Timer, Dumbbell, Loader2 } from 'lucide-react'
import { cn } from '../lib/utils'
import { useWorkoutStore } from '../features/workout/store/useWorkoutStore'
import {
  addExerciseToWorkout,
  createWorkout,
  finishWorkout as finishWorkoutDb,
  getLatestCompletedWorkout,
  getLastPerformance,
  getExercisePersonalRecord,
  updateWorkoutLabel,
  upsertSet,
} from '../features/workout/services/workoutService'
import { getUserSettings } from '../features/settings/services/settingsService'
import { createSetPersistQueue } from '../features/workout/lib/setPersistQueue'
import { resolveWorkoutTypes } from '../features/workout/lib/workoutTypes'
import { useCurrentUser } from '../features/auth/useAuth'

function selectOnFocus(e: FocusEvent<HTMLInputElement>) {
  e.target.select()
}

function newClientId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

export default function Workout() {
  const { user } = useCurrentUser()
  const userId = user!.id

  const today = new Date().toISOString().slice(0, 10)

  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const isRepeatMode = searchParams.get('repeat') === '1'
  const autoStart = searchParams.get('start') === '1'

  const {
    currentWorkoutId,
    workoutStartedAt,
    workoutLabel,
    workoutTypes,
    exercises,
    startWorkout,
    setWorkoutLabel,
    setWorkoutTypes,
    addWorkoutType,
    addSet,
    updateSet,
    finishWorkout,
    addExercise,
  } = useWorkoutStore()

  const [isFinishing, setIsFinishing] = useState(false)
  const [showTypeSetup, setShowTypeSetup] = useState(false)
  const [selectedType, setSelectedType] = useState('')
  const [saveError, setSaveError] = useState('')
  const [typeError, setTypeError] = useState('')
  const [tick, setTick] = useState(Date.now())
  // False only while an optimistic create is still in flight
  const [dbReady, setDbReady] = useState(true)
  const [setStatusMap, setSetStatusMap] = useState<
    Record<string, 'idle' | 'saving' | 'saved' | 'error'>
  >({})

  const justAddedSetIdRef = useRef<string | null>(null)
  const startingRef = useRef(false)

  const persistQueueRef = useRef(
    createSetPersistQueue(async (payload) => {
      const statusKey = payload.setId
      setSetStatusMap((prev) => ({ ...prev, [statusKey]: 'saving' }))
      try {
        // Always re-read store so weight→reps edits never overwrite with stale values
        const fresh = useWorkoutStore
          .getState()
          .exercises.flatMap((e) => e.sets.map((s) => ({ exercise: e, set: s })))
          .find(({ set }) => set.id === payload.setId)

        const setItem = fresh?.set
        const workoutExerciseId =
          fresh?.exercise.dbWorkoutExerciseId ?? payload.workoutExerciseId
        if (!setItem || !workoutExerciseId) return

        await upsertSet(payload.setId, workoutExerciseId, {
          reps: setItem.reps === '' ? null : parseInt(setItem.reps, 10),
          weight: setItem.weight === '' ? null : parseFloat(setItem.weight),
          to_failure: setItem.toFailure,
          set_index: payload.setIndex,
        })
        updateSet(fresh.exercise.id, payload.setId, { dbSetId: payload.setId })
        setSaveError('')
        setSetStatusMap((prev) => ({ ...prev, [statusKey]: 'saved' }))
      } catch (err) {
        setSaveError((err as Error).message)
        setSetStatusMap((prev) => ({ ...prev, [statusKey]: 'error' }))
        throw err
      }
    }, 300),
  )

  const canEdit = Boolean(currentWorkoutId) && dbReady

  const latestWorkoutQuery = useQuery({
    queryKey: ['workout', 'latest-completed', userId],
    queryFn: () => getLatestCompletedWorkout(userId),
  })

  // Seed / refresh type chips from user_settings (defaults when empty)
  useEffect(() => {
    let cancelled = false
    void getUserSettings(userId)
      .then((settings) => {
        if (cancelled) return
        setWorkoutTypes(resolveWorkoutTypes(settings.workoutTypes))
      })
      .catch(() => {
        if (cancelled) return
        setWorkoutTypes(resolveWorkoutTypes(null))
      })
    return () => {
      cancelled = true
    }
  }, [userId, setWorkoutTypes])

  // Ensure persisted store always expands to full defaults on mount
  useEffect(() => {
    setWorkoutTypes(resolveWorkoutTypes(useWorkoutStore.getState().workoutTypes))
  }, [setWorkoutTypes])

  useEffect(() => {
    if (!currentWorkoutId && (autoStart || isRepeatMode)) {
      setShowTypeSetup(true)
    }
  }, [autoStart, isRepeatMode, currentWorkoutId])

  useEffect(() => {
    if (isRepeatMode && !currentWorkoutId && latestWorkoutQuery.data) {
      setSelectedType(latestWorkoutQuery.data.label)
    }
  }, [isRepeatMode, currentWorkoutId, latestWorkoutQuery.data])

  useEffect(() => {
    if (!currentWorkoutId || !workoutStartedAt) return
    const t = setInterval(() => setTick(Date.now()), 1000)
    return () => clearInterval(t)
  }, [currentWorkoutId, workoutStartedAt])

  const startedTimeLabel = useMemo(() => {
    if (!workoutStartedAt) return '--:--'
    return new Date(workoutStartedAt).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  }, [workoutStartedAt])

  const elapsedLabel = useMemo(() => {
    if (!workoutStartedAt) return '00:00:00'
    const diff = Math.max(0, tick - new Date(workoutStartedAt).getTime())
    const h = String(Math.floor(diff / 3600000)).padStart(2, '0')
    const m = String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0')
    const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0')
    return `${h}:${m}:${s}`
  }, [tick, workoutStartedAt])

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

  // ── Start / Finish ─────────────────────────────────────────────────────────

  const beginWorkoutWithType = (typeLabel: string) => {
    if (currentWorkoutId || startingRef.current) return

    const normalizedType = typeLabel.trim()
    if (!normalizedType) {
      setTypeError('Pick a workout type to begin.')
      return
    }

    startingRef.current = true
    setTypeError('')
    setSelectedType(normalizedType)
    addWorkoutType(normalizedType)
    setSaveError('')
    setDbReady(false)

    // Optimistic: enter the session immediately, create the row in the background
    const workoutId = newClientId()
    const startedAt = new Date().toISOString()
    startWorkout(workoutId, today, startedAt, normalizedType)
    setWorkoutLabel(normalizedType)
    setShowTypeSetup(false)

    if (autoStart || isRepeatMode) {
      setSearchParams({}, { replace: true })
    }

    void (async () => {
      try {
        await createWorkout(userId, today, normalizedType, workoutId)
        setDbReady(true)

        if (isRepeatMode && latestWorkoutQuery.data?.exercises?.length) {
          for (const ex of latestWorkoutQuery.data.exercises) {
            try {
              const dbWeId = await addExerciseToWorkout(workoutId, ex.exerciseId, ex.orderIndex)
              const lastSets = await getLastPerformance(userId, ex.exerciseId)
              const lastPerformance =
                lastSets.length > 0
                  ? `Last: ${lastSets
                      .map((s) => `${s.weight ?? '-'}kg x ${s.reps ?? '-'}`)
                      .join(' • ')}`
                  : 'No previous performance'
              const pr = await getExercisePersonalRecord(userId, ex.exerciseId)
              const personalRecord = pr
                ? `PR: ${pr.weight ?? '-'}kg x ${pr.reps ?? '-'}${pr.date ? ` (${pr.date})` : ''}`
                : 'No PR yet'
              addExercise({
                exerciseId: ex.exerciseId,
                name: ex.name,
                muscleGroup: ex.muscleGroup,
                dbWorkoutExerciseId: dbWeId,
                lastPerformance,
                personalRecord,
              })
            } catch {
              // Non-fatal
            }
          }
          navigate('/workout', { replace: true })
        }
      } catch (err) {
        setSaveError((err as Error).message)
        setDbReady(false)
      } finally {
        startingRef.current = false
      }
    })()
  }

  const handleStartWorkout = () => {
    if (currentWorkoutId) return
    setShowTypeSetup(true)
    setTypeError('')
  }

  const handleFinishWorkout = async () => {
    if (!currentWorkoutId) return
    try {
      setIsFinishing(true)
      await persistQueueRef.current.flushAll()
      await finishWorkoutDb(currentWorkoutId)
      finishWorkout()
      setShowTypeSetup(false)
      setSelectedType('')
      setSaveError('')
      setTypeError('')
      await latestWorkoutQuery.refetch()
    } finally {
      setIsFinishing(false)
    }
  }

  // ── Set management ─────────────────────────────────────────────────────────

  const handleAddSet = async (exerciseLocalId: string, dbWorkoutExerciseId?: string) => {
    // Flush prior set writes so copied prefill never races with the previous row
    await persistQueueRef.current.flushAll()

    const newSet = addSet(exerciseLocalId)
    if (!newSet || !dbWorkoutExerciseId) return

    justAddedSetIdRef.current = newSet.id
    // Do NOT upsert immediately — prefilled reps/weight are UI hints only.
    // First save happens on edit (debounced) or blur.
  }

  const title = useMemo(() => {
    if (!currentWorkoutId) return 'Workout'
    return workoutLabel.trim() || 'Current Workout'
  }, [currentWorkoutId, workoutLabel])

  const headerLabel = currentWorkoutId ? 'Session Active' : 'Ready to Train'
  const typeChips = resolveWorkoutTypes(workoutTypes)

  return (
    <div className="pb-28">
      <div className="px-4 md:px-8 pt-5 md:pt-8 pb-4 md:pb-6 border-b border-border">
        <p className="text-[10px] text-primary uppercase tracking-widest mb-1">{headerLabel}</p>
        <div className="flex items-end justify-between">
          <h1 className="text-3xl md:text-5xl font-black uppercase text-text-primary">{title}</h1>
        </div>

        {currentWorkoutId && (
          <p className="text-text-secondary text-sm mt-1 flex items-center gap-1">
            <Timer size={12} />
            Started {startedTimeLabel} • Duration: {elapsedLabel}
          </p>
        )}

        {currentWorkoutId && (
          <div className="mt-3">
            <p className="text-[10px] text-text-secondary uppercase tracking-widest mb-1.5">
              Workout Type
            </p>
            <div className="flex flex-wrap gap-2">
              {typeChips.map((type) => (
                <button
                  key={type}
                  type="button"
                  disabled={!canEdit}
                  onClick={() => {
                    setWorkoutLabel(type)
                    void updateWorkoutLabel(currentWorkoutId, type)
                  }}
                  className={cn(
                    'px-3 py-1.5 rounded-xl text-xs font-semibold uppercase tracking-wider border transition-colors min-h-11',
                    workoutLabel === type
                      ? 'bg-primary text-black border-primary'
                      : 'border-border text-text-secondary hover:border-text-secondary hover:text-text-primary',
                  )}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
        )}

        {!currentWorkoutId && showTypeSetup && (
          <div className="mt-4 space-y-3">
            <div className="w-full">
              <label className="block text-[10px] text-text-secondary uppercase tracking-widest mb-2">
                Workout Type {isRepeatMode && <span className="text-primary">(repeating last)</span>}
              </label>
              <div className="flex flex-wrap gap-2">
                {typeChips.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => beginWorkoutWithType(type)}
                    className={cn(
                      'px-3 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider border transition-colors min-h-11',
                      selectedType === type
                        ? 'bg-primary text-black border-primary'
                        : 'border-border text-text-secondary hover:border-primary hover:text-primary',
                    )}
                  >
                    {type}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-text-muted">Tap a type to start — no extra Begin step.</p>
            </div>
            <Button
              variant="ghost"
              size="md"
              onClick={() => {
                setShowTypeSetup(false)
                setSelectedType('')
                setTypeError('')
                if (autoStart || isRepeatMode) {
                  setSearchParams({}, { replace: true })
                }
              }}
            >
              Cancel
            </Button>
          </div>
        )}

        {typeError && <p className="mt-2 text-xs text-red-400">{typeError}</p>}
        {saveError && <p className="mt-2 text-xs text-red-400">{saveError}</p>}

        {!currentWorkoutId && latestWorkoutQuery.data && (
          <div className="mt-3 rounded-xl border border-border bg-surface-2/60 px-3 py-2">
            <p className="text-xs text-text-secondary">
              Last workout:{' '}
              <span className="text-text-primary">{latestWorkoutQuery.data.label}</span>{' '}
              • {latestWorkoutQuery.data.date} • {latestWorkoutQuery.data.durationText}
            </p>
            <p className="mt-1 text-xs text-text-secondary">
              {latestWorkoutQuery.data.exerciseCount} exercises •{' '}
              {latestWorkoutQuery.data.setCount} sets •{' '}
              {latestWorkoutQuery.data.totalVolumeKg} kg total volume
            </p>
          </div>
        )}
      </div>

      <div className="px-4 md:px-8 pt-5 md:pt-6 space-y-4 md:space-y-5">
        {exercises.map((ex) => (
          <div key={ex.id} className="bg-surface rounded-xl border border-border overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <h3 className="font-semibold text-text-primary">{ex.name}</h3>
                <p className="text-text-secondary text-xs mt-0.5">
                  {ex.lastPerformance ?? 'No previous performance'}
                </p>
                <p className="text-[11px] text-primary mt-1">
                  {ex.personalRecord ?? 'No PR yet'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-4 px-5 py-2 border-b border-border">
              {['Set', 'Weight (kg)', 'Reps', 'Fail'].map((h) => (
                <span
                  key={h}
                  className="text-[10px] text-text-secondary uppercase tracking-widest font-medium"
                >
                  {h}
                </span>
              ))}
            </div>

            {ex.sets.map((set, idx) => {
              const status = setStatusMap[set.id]
              return (
                <div
                  key={set.id}
                  className={cn(
                    'grid grid-cols-4 items-center px-5 py-3',
                    set.toFailure ? 'border-l-2 border-primary' : '',
                    idx < ex.sets.length - 1 ? 'border-b border-border' : '',
                  )}
                >
                  <div className="flex flex-col gap-0.5">
                    <span
                      className={cn(
                        'text-sm font-bold',
                        set.toFailure ? 'text-primary' : 'text-text-secondary',
                      )}
                    >
                      {idx + 1}
                    </span>
                    {status === 'saving' && (
                      <span className="text-[9px] text-text-muted flex items-center gap-0.5">
                        <Loader2 size={8} className="animate-spin" />
                      </span>
                    )}
                    {status === 'saved' && <span className="text-[9px] text-primary">✓</span>}
                    {status === 'error' && <span className="text-[9px] text-red-400">!</span>}
                  </div>

                  <input
                    ref={(el) => {
                      if (el && set.id === justAddedSetIdRef.current) {
                        el.focus()
                        el.select()
                        justAddedSetIdRef.current = null
                      }
                    }}
                    type="number"
                    inputMode="decimal"
                    value={set.weight}
                    disabled={!canEdit}
                    onFocus={selectOnFocus}
                    onChange={(e) => {
                      updateSet(ex.id, set.id, { weight: e.target.value })
                      queuePersist(ex.id, set.id, ex.dbWorkoutExerciseId, idx)
                    }}
                    onBlur={() => {
                      queuePersist(ex.id, set.id, ex.dbWorkoutExerciseId, idx)
                      void persistQueueRef.current.flush(set.id)
                    }}
                    className="w-full max-w-20 bg-surface-2 border border-border rounded-lg px-2 py-2 text-sm text-center text-text-primary focus:outline-hidden focus:border-primary transition-colors"
                  />

                  <input
                    type="number"
                    inputMode="numeric"
                    value={set.reps}
                    disabled={!canEdit}
                    onFocus={selectOnFocus}
                    onChange={(e) => {
                      updateSet(ex.id, set.id, { reps: e.target.value })
                      queuePersist(ex.id, set.id, ex.dbWorkoutExerciseId, idx)
                    }}
                    onBlur={() => {
                      queuePersist(ex.id, set.id, ex.dbWorkoutExerciseId, idx)
                      void persistQueueRef.current.flush(set.id)
                    }}
                    className="w-full max-w-20 bg-surface-2 border border-border rounded-lg px-2 py-2 text-sm text-center text-text-primary focus:outline-hidden focus:border-primary transition-colors"
                  />

                  <Toggle
                    checked={set.toFailure}
                    onChange={(v) => {
                      updateSet(ex.id, set.id, { toFailure: v })
                      queuePersist(ex.id, set.id, ex.dbWorkoutExerciseId, idx)
                      void persistQueueRef.current.flush(set.id)
                    }}
                  />
                </div>
              )
            })}

            <button
              disabled={!canEdit}
              onClick={() => void handleAddSet(ex.id, ex.dbWorkoutExerciseId)}
              className="w-full py-3 text-xs text-text-secondary hover:text-primary transition-colors flex items-center justify-center gap-1.5 border-t border-border hover:bg-surface-2 disabled:opacity-40"
            >
              <Plus size={12} />
              Add Set
            </button>
          </div>
        ))}

        <button
          disabled={!canEdit}
          onClick={() => navigate('/exercises?select=1')}
          className="w-full py-8 border border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-2 text-text-secondary hover:text-primary hover:border-primary transition-colors group disabled:opacity-40"
        >
          <div className="w-8 h-8 rounded-full border border-current flex items-center justify-center group-hover:bg-primary/10 transition-colors">
            <Plus size={16} />
          </div>
          <span className="text-xs uppercase tracking-widest font-medium">Add Exercise</span>
        </button>
      </div>

      <div className="fixed bottom-16 md:bottom-0 left-0 md:left-52 right-0 bg-background/95 backdrop-blur border-t border-border px-4 md:px-8 py-3 md:py-4 flex items-center justify-center">
        {currentWorkoutId ? (
          <Button
            variant="primary"
            size="lg"
            className="w-64"
            disabled={isFinishing}
            onClick={() => void handleFinishWorkout()}
          >
            {isFinishing ? (
              <Loader2 size={14} className="mr-2 animate-spin" />
            ) : (
              <Dumbbell size={14} className="mr-2" />
            )}
            Finish Workout
          </Button>
        ) : showTypeSetup ? (
          <p className="text-sm text-text-secondary uppercase tracking-widest">
            Pick a type above
          </p>
        ) : (
          <Button variant="secondary" size="lg" className="w-64" onClick={handleStartWorkout}>
            <Dumbbell size={14} className="mr-2" />
            Start Workout
          </Button>
        )}
      </div>
    </div>
  )
}
