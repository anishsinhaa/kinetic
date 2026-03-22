import { useEffect, useMemo, useRef, useState } from 'react'
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

export default function Workout() {
  const { user } = useCurrentUser()
  const userId = user!.id

  // Compute today's date inside the component so it's always current
  const today = new Date().toISOString().slice(0, 10)

  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isRepeatMode = searchParams.get('repeat') === '1'

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

  // Tracks sets currently being saved — prevents duplicate inserts on rapid blur
  const inFlightSets = useRef(new Set<string>())

  // Ref to auto-focus the weight input on a newly added set
  const justAddedSetIdRef = useRef<string | null>(null)

  const canEdit = Boolean(currentWorkoutId)

  const latestWorkoutQuery = useQuery({
    queryKey: ['workout', 'latest-completed', userId],
    queryFn: () => getLatestCompletedWorkout(userId),
  })

  // On repeat mode: show type setup pre-filled with last workout's label
  useEffect(() => {
    if (isRepeatMode && !currentWorkoutId && latestWorkoutQuery.data) {
      setShowTypeSetup(true)
      setSelectedType(latestWorkoutQuery.data.label)
    }
  }, [isRepeatMode, currentWorkoutId, latestWorkoutQuery.data])

  // Elapsed timer — only ticks while a workout is active
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

  // ── Start / Begin / Finish ────────────────────────────────────────────────

  const handleStartWorkout = async () => {
    if (currentWorkoutId) return

    if (!showTypeSetup) {
      setShowTypeSetup(true)
      return
    }

    const normalizedType = selectedType.trim()
    if (!normalizedType) {
      setTypeError('Workout type is required before beginning.')
      return
    }

    try {
      setIsStarting(true)
      setTypeError('')
      addWorkoutType(normalizedType)

      const created = await createWorkout(userId, today)
      startWorkout(created.id, today, created.createdAt)
      setWorkoutLabel(normalizedType)
      await updateWorkoutLabel(created.id, normalizedType)
      setShowTypeSetup(false)
      setSelectedType('')
      setSaveError('')

      // Repeat mode: re-add all exercises from the previous workout
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
        // Remove repeat param from URL without re-render
        navigate('/workout', { replace: true })
      }
    } catch (err) {
      setSaveError((err as Error).message)
    } finally {
      setIsStarting(false)
    }
  }

  const handleFinishWorkout = async () => {
    if (!currentWorkoutId) return
    try {
      setIsFinishing(true)
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

  // ── Set management ────────────────────────────────────────────────────────

  const handleAddSet = async (exerciseLocalId: string, dbWorkoutExerciseId?: string) => {
    // exercises here is the stale closure value (before addSet runs),
    // so .sets.length gives the current count → correct 1-indexed position for new set
    const setIndexBeforeAdd =
      exercises.find((e) => e.id === exerciseLocalId)?.sets.length ?? 0

    const newSet = addSet(exerciseLocalId)
    if (!newSet || !dbWorkoutExerciseId) return

    // Queue auto-focus on this set's weight input
    justAddedSetIdRef.current = newSet.id

    const statusKey = `${exerciseLocalId}:${newSet.id}`
    setSetStatusMap((prev) => ({ ...prev, [statusKey]: 'saving' }))

    try {
      const setId = await addSetDb(dbWorkoutExerciseId, {
        reps: newSet.reps === '' ? null : parseInt(newSet.reps, 10),
        weight: newSet.weight === '' ? null : parseFloat(newSet.weight),
        to_failure: newSet.toFailure,
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

  // Saves a set on blur. Guards against duplicate inserts when weight and reps
  // both blur rapidly before the first insert has returned a dbSetId.
  const persistSet = async (
    exerciseLocalId: string,
    setLocalId: string,
    dbWorkoutExerciseId: string | undefined,
    index: number,
  ) => {
    if (!dbWorkoutExerciseId) return

    const exercise = exercises.find((e) => e.id === exerciseLocalId)
    const setItem = exercise?.sets.find((s) => s.id === setLocalId)
    if (!setItem) return

    const payload = {
      reps: setItem.reps === '' ? null : parseInt(setItem.reps, 10),
      weight: setItem.weight === '' ? null : parseFloat(setItem.weight),
      to_failure: setItem.toFailure,
      set_index: index + 1,
    }

    const statusKey = `${exerciseLocalId}:${setLocalId}`

    if (setItem.dbSetId) {
      // Already persisted → update
      setSetStatusMap((prev) => ({ ...prev, [statusKey]: 'saving' }))
      try {
        await updateSetDb(setItem.dbSetId, payload)
        setSaveError('')
        setSetStatusMap((prev) => ({ ...prev, [statusKey]: 'saved' }))
      } catch (err) {
        setSaveError((err as Error).message)
        setSetStatusMap((prev) => ({ ...prev, [statusKey]: 'error' }))
      }
      return
    }

    // Not yet persisted → insert, guarded against duplicates
    if (inFlightSets.current.has(setLocalId)) return
    inFlightSets.current.add(setLocalId)
    setSetStatusMap((prev) => ({ ...prev, [statusKey]: 'saving' }))
    try {
      const createdId = await addSetDb(dbWorkoutExerciseId, payload)
      updateSet(exerciseLocalId, setLocalId, { dbSetId: createdId })
      setSaveError('')
      setSetStatusMap((prev) => ({ ...prev, [statusKey]: 'saved' }))
    } catch (err) {
      setSaveError((err as Error).message)
      setSetStatusMap((prev) => ({ ...prev, [statusKey]: 'error' }))
    } finally {
      inFlightSets.current.delete(setLocalId)
    }
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
            <input
              value={workoutLabel}
              onChange={(e) => setWorkoutLabel(e.target.value)}
              onBlur={() => {
                if (!currentWorkoutId) return
                void updateWorkoutLabel(currentWorkoutId, workoutLabel.trim())
              }}
              placeholder="Optional workout label (e.g. Upper, Cardio, etc.)"
              className="w-full bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary"
            />
          </div>
        )}

        {!currentWorkoutId && showTypeSetup && (
          <div className="mt-4 space-y-3">
            <div className="w-full">
              <label className="block text-[10px] text-text-secondary uppercase tracking-widest mb-1.5">
                Workout Type {isRepeatMode && <span className="text-primary">(repeating last)</span>}
              </label>
              <input
                list="workout-types"
                value={selectedType}
                onChange={(e) => {
                  setSelectedType(e.target.value)
                  if (typeError) setTypeError('')
                }}
                placeholder="Type or select (e.g. Upper, Cardio, Full Body)"
                className="w-full bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary"
              />
              <datalist id="workout-types">
                {workoutTypes.map((type) => (
                  <option key={type} value={type} />
                ))}
              </datalist>
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="md"
                onClick={() => {
                  addWorkoutType(selectedType)
                  if (typeError && selectedType.trim()) setTypeError('')
                }}
              >
                Save Type
              </Button>
              <Button
                variant="ghost"
                size="md"
                onClick={() => {
                  setShowTypeSetup(false)
                  setSelectedType('')
                  setTypeError('')
                }}
              >
                Cancel
              </Button>
            </div>
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
            {/* Exercise header */}
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

            {/* Set header */}
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

            {/* Sets */}
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
                  {/* Col 1: set number + save status badge */}
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

                  {/* Col 2: weight */}
                  <input
                    ref={(el) => {
                      if (el && set.id === justAddedSetIdRef.current) {
                        el.focus()
                        justAddedSetIdRef.current = null
                      }
                    }}
                    type="number"
                    inputMode="decimal"
                    value={set.weight}
                    disabled={!canEdit}
                    onChange={(e) => updateSet(ex.id, set.id, { weight: e.target.value })}
                    onBlur={() => void persistSet(ex.id, set.id, ex.dbWorkoutExerciseId, idx)}
                    className="w-full max-w-[5rem] bg-surface-2 border border-border rounded-lg px-2 py-2 text-sm text-center text-text-primary focus:outline-none focus:border-primary transition-colors"
                  />

                  {/* Col 3: reps */}
                  <input
                    type="number"
                    inputMode="numeric"
                    value={set.reps}
                    disabled={!canEdit}
                    onChange={(e) => updateSet(ex.id, set.id, { reps: e.target.value })}
                    onBlur={() => void persistSet(ex.id, set.id, ex.dbWorkoutExerciseId, idx)}
                    className="w-full max-w-[5rem] bg-surface-2 border border-border rounded-lg px-2 py-2 text-sm text-center text-text-primary focus:outline-none focus:border-primary transition-colors"
                  />

                  {/* Col 4: failure toggle */}
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

            {/* Add set */}
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

        {/* Add Exercise */}
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
        <Button
          variant={currentWorkoutId ? 'primary' : 'secondary'}
          size="lg"
          className="w-64"
          disabled={isStarting || isFinishing}
          onClick={() =>
            currentWorkoutId ? void handleFinishWorkout() : void handleStartWorkout()
          }
        >
          {isStarting || isFinishing ? (
            <Loader2 size={14} className="mr-2 animate-spin" />
          ) : (
            <Dumbbell size={14} className="mr-2" />
          )}
          {currentWorkoutId
            ? 'Finish Workout'
            : showTypeSetup
            ? `Begin${isRepeatMode ? ' Repeat' : ''} Workout`
            : 'Start Workout'}
        </Button>
      </div>
    </div>
  )
}
