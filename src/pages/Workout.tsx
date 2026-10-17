import { useEffect, useMemo, useRef, useState, type FocusEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Button } from '../components/ui/Button'
import { Toggle } from '../components/ui/Toggle'
import { Plus, Timer, Dumbbell, Loader2 } from 'lucide-react'
import { cn } from '../lib/utils'
import { useWorkoutStore } from '../features/workout/store/useWorkoutStore'
import {
  addSet as addSetDb,
  addExerciseToWorkout,
  createWorkout,
  finishWorkout as finishWorkoutDb,
  getLatestCompletedWorkout,
  getLastPerformance,
  getExercisePersonalRecord,
  updateWorkoutLabel,
  updateSet as updateSetDb,
} from '../features/workout/services/workoutService'
import { useCurrentUser } from '../features/auth/useAuth'

/** Select existing value so typing replaces prefilled weight/reps instead of appending. */
function selectOnFocus(e: FocusEvent<HTMLInputElement>) {
  e.target.select()
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
    addWorkoutType,
    addSet,
    updateSet,
    finishWorkout,
    addExercise,
  } = useWorkoutStore()

  const [isStarting, setIsStarting] = useState(false)
  const [isFinishing, setIsFinishing] = useState(false)
  const [showTypeSetup, setShowTypeSetup] = useState(false)
  const [selectedType, setSelectedType] = useState('')
  const [saveError, setSaveError] = useState('')
  const [typeError, setTypeError] = useState('')
  const [tick, setTick] = useState(Date.now())
  const [setStatusMap, setSetStatusMap] = useState<
    Record<string, 'idle' | 'saving' | 'saved' | 'error'>
  >({})

  // Serialized per-set persist chain — last write always wins; never drop reps after weight.
  const persistChains = useRef(new Map<string, Promise<void>>())
  const justAddedSetIdRef = useRef<string | null>(null)

  const canEdit = Boolean(currentWorkoutId)

  const latestWorkoutQuery = useQuery({
    queryKey: ['workout', 'latest-completed', userId],
    queryFn: () => getLatestCompletedWorkout(userId),
  })

  // Dashboard / deep-link: one tap Start → land on type chips
  useEffect(() => {
    if (!currentWorkoutId && (autoStart || isRepeatMode)) {
      setShowTypeSetup(true)
    }
  }, [autoStart, isRepeatMode, currentWorkoutId])

  // On repeat mode: pre-highlight last workout's type chip
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

  // ── Start / Finish ─────────────────────────────────────────────────────────

  const beginWorkoutWithType = async (typeLabel: string) => {
    if (currentWorkoutId || isStarting) return

    const normalizedType = typeLabel.trim()
    if (!normalizedType) {
      setTypeError('Pick a workout type to begin.')
      return
    }

    try {
      setIsStarting(true)
      setTypeError('')
      setSelectedType(normalizedType)
      addWorkoutType(normalizedType)

      const created = await createWorkout(userId, today, normalizedType)
      startWorkout(created.id, today, created.startedAt)
      setWorkoutLabel(normalizedType)
      setShowTypeSetup(false)
      setSaveError('')

      // Clear start/repeat query params
      if (autoStart || isRepeatMode) {
        setSearchParams({}, { replace: true })
      }

      if (isRepeatMode && latestWorkoutQuery.data?.exercises?.length) {
        for (const ex of latestWorkoutQuery.data.exercises) {
          try {
            const dbWeId = await addExerciseToWorkout(created.id, ex.exerciseId, ex.orderIndex)
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
            // Non-fatal: skip this exercise if it fails
          }
        }
        navigate('/workout', { replace: true })
      }
    } catch (err) {
      setSaveError((err as Error).message)
    } finally {
      setIsStarting(false)
    }
  }

  const handleStartWorkout = () => {
    if (currentWorkoutId) return
    // First tap: show type chips. Chip tap starts the workout.
    setShowTypeSetup(true)
    setTypeError('')
  }

  const flushAllPersists = async () => {
    const pending = [...persistChains.current.values()]
    if (pending.length === 0) return
    await Promise.allSettled(pending)
  }

  const handleFinishWorkout = async () => {
    if (!currentWorkoutId) return
    try {
      setIsFinishing(true)
      await flushAllPersists()
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
    const setIndexBeforeAdd =
      useWorkoutStore.getState().exercises.find((e) => e.id === exerciseLocalId)?.sets.length ?? 0

    const newSet = addSet(exerciseLocalId)
    if (!newSet || !dbWorkoutExerciseId) return

    justAddedSetIdRef.current = newSet.id

    const statusKey = `${exerciseLocalId}:${newSet.id}`
    setSetStatusMap((prev) => ({ ...prev, [statusKey]: 'saving' }))

    try {
      const latest = useWorkoutStore
        .getState()
        .exercises.find((e) => e.id === exerciseLocalId)
        ?.sets.find((s) => s.id === newSet.id)

      const setId = await addSetDb(dbWorkoutExerciseId, {
        reps: !latest || latest.reps === '' ? null : parseInt(latest.reps, 10),
        weight: !latest || latest.weight === '' ? null : parseFloat(latest.weight),
        to_failure: latest?.toFailure ?? false,
        set_index: setIndexBeforeAdd + 1,
      })
      updateSet(exerciseLocalId, newSet.id, { dbSetId: setId })
      setSaveError('')
      setSetStatusMap((prev) => ({ ...prev, [statusKey]: 'saved' }))
    } catch (err) {
      setSaveError((err as Error).message)
      setSetStatusMap((prev) => ({ ...prev, [statusKey]: 'error' }))
    }
  }

  /**
   * Persist a set using a per-set promise chain so rapid weight→reps edits
   * never race: each save reads the latest store values and runs after the prior one.
   */
  const persistSet = (
    exerciseLocalId: string,
    setLocalId: string,
    dbWorkoutExerciseId: string | undefined,
    index: number,
  ) => {
    if (!dbWorkoutExerciseId) return Promise.resolve()

    const prev = persistChains.current.get(setLocalId) ?? Promise.resolve()
    const next = prev
      .catch(() => {
        // Keep the chain alive after a failed save
      })
      .then(async () => {
        const exercise = useWorkoutStore
          .getState()
          .exercises.find((e) => e.id === exerciseLocalId)
        const setItem = exercise?.sets.find((s) => s.id === setLocalId)
        if (!setItem) return

        const payload = {
          reps: setItem.reps === '' ? null : parseInt(setItem.reps, 10),
          weight: setItem.weight === '' ? null : parseFloat(setItem.weight),
          to_failure: setItem.toFailure,
          set_index: index + 1,
        }

        const statusKey = `${exerciseLocalId}:${setLocalId}`
        setSetStatusMap((prevMap) => ({ ...prevMap, [statusKey]: 'saving' }))

        try {
          // Re-read dbSetId in case a prior chained insert just finished
          const fresh = useWorkoutStore
            .getState()
            .exercises.find((e) => e.id === exerciseLocalId)
            ?.sets.find((s) => s.id === setLocalId)

          if (fresh?.dbSetId) {
            await updateSetDb(fresh.dbSetId, {
              ...payload,
              reps: fresh.reps === '' ? null : parseInt(fresh.reps, 10),
              weight: fresh.weight === '' ? null : parseFloat(fresh.weight),
              to_failure: fresh.toFailure,
            })
          } else {
            const createdId = await addSetDb(dbWorkoutExerciseId, {
              ...payload,
              reps: fresh && fresh.reps !== '' ? parseInt(fresh.reps, 10) : payload.reps,
              weight: fresh && fresh.weight !== '' ? parseFloat(fresh.weight) : payload.weight,
              to_failure: fresh?.toFailure ?? payload.to_failure,
            })
            updateSet(exerciseLocalId, setLocalId, { dbSetId: createdId })
          }

          setSaveError('')
          setSetStatusMap((prevMap) => ({ ...prevMap, [statusKey]: 'saved' }))
        } catch (err) {
          setSaveError((err as Error).message)
          setSetStatusMap((prevMap) => ({ ...prevMap, [statusKey]: 'error' }))
          throw err
        }
      })

    persistChains.current.set(setLocalId, next)
    return next
  }

  const title = useMemo(() => {
    if (!currentWorkoutId) return 'Workout'
    return workoutLabel.trim() || 'Current Workout'
  }, [currentWorkoutId, workoutLabel])

  const headerLabel = currentWorkoutId ? 'Session Active' : 'Ready to Train'

  return (
    <div className="pb-28">
      {/* Header */}
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
              {workoutTypes.map((type) => (
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
                {workoutTypes.map((type) => (
                  <button
                    key={type}
                    type="button"
                    disabled={isStarting}
                    onClick={() => void beginWorkoutWithType(type)}
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
            {latestWorkoutQuery.data.exerciseNames.length > 0 && (
              <p className="mt-1 text-xs text-text-muted">
                {latestWorkoutQuery.data.exerciseNames.slice(0, 4).join(', ')}
                {latestWorkoutQuery.data.exerciseNames.length > 4 ? ' …' : ''}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Exercises */}
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
              const statusKey = `${ex.id}:${set.id}`
              const status = setStatusMap[statusKey]
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
                    {status === 'saved' && (
                      <span className="text-[9px] text-primary">✓</span>
                    )}
                    {status === 'error' && (
                      <span className="text-[9px] text-red-400">!</span>
                    )}
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
                    onChange={(e) => updateSet(ex.id, set.id, { weight: e.target.value })}
                    onBlur={() => void persistSet(ex.id, set.id, ex.dbWorkoutExerciseId, idx)}
                    className="w-full max-w-[5rem] bg-surface-2 border border-border rounded-lg px-2 py-2 text-sm text-center text-text-primary focus:outline-hidden focus:border-primary transition-colors"
                  />

                  <input
                    type="number"
                    inputMode="numeric"
                    value={set.reps}
                    disabled={!canEdit}
                    onFocus={selectOnFocus}
                    onChange={(e) => updateSet(ex.id, set.id, { reps: e.target.value })}
                    onBlur={() => void persistSet(ex.id, set.id, ex.dbWorkoutExerciseId, idx)}
                    className="w-full max-w-[5rem] bg-surface-2 border border-border rounded-lg px-2 py-2 text-sm text-center text-text-primary focus:outline-hidden focus:border-primary transition-colors"
                  />

                  <Toggle
                    checked={set.toFailure}
                    onChange={(v) => {
                      updateSet(ex.id, set.id, { toFailure: v })
                      void persistSet(ex.id, set.id, ex.dbWorkoutExerciseId, idx)
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

      {/* Sticky footer CTA */}
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
            {isStarting ? 'Starting…' : 'Pick a type above'}
          </p>
        ) : (
          <Button
            variant="secondary"
            size="lg"
            className="w-64"
            disabled={isStarting}
            onClick={handleStartWorkout}
          >
            <Dumbbell size={14} className="mr-2" />
            Start Workout
          </Button>
        )}
      </div>
    </div>
  )
}
