import { useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Trash2 } from 'lucide-react'
import { BottomSheet } from '../components/ui/BottomSheet'
import { Button } from '../components/ui/Button'
import { useToast } from '../components/ui/toastContext'
import { useCurrentUser } from '../features/auth/useAuth'
import type { Exercise } from '../features/exercises/types'
import { ExercisePickerSheet } from '../features/workout/components/ExercisePickerSheet'
import { MAX_REPS, MAX_SET_WEIGHT_KG } from '../features/workout/constants'
import { useSuggestedType } from '../features/workout/hooks/useSuggestedType'
import {
  deleteFinishedWorkout,
  getWorkoutForEdit,
  saveWorkoutEdits,
  type EditableWorkout,
  type WorkoutEditDraft,
} from '../features/workout/services/editWorkoutService'
import {
  displayWeightString,
  kgToDisplay,
  roundDisplayWeight,
  toStoredKg,
  weightUnitLabel,
} from '../features/settings/lib/units'
import type { WeightUnits } from '../lib/supabase/database.types'
import { localDateString } from '../lib/localDate'
import { selectOnFocus } from '../lib/selectOnFocus'
import { pluralize } from '../lib/pluralize'
import { cn } from '../lib/utils'

function newClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

const inputClass =
  'min-h-11 bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm text-text-primary focus:outline-hidden focus:border-primary'

type DraftSet = {
  id: string
  weight: string
  reps: string
  isNew: boolean
  initialWeight: string
  initialReps: string
}

type DraftExercise = {
  rowId: string
  exerciseId: string
  name: string
  muscleGroup: string
  isNew: boolean
  sets: DraftSet[]
}

function buildCards(workout: EditableWorkout, units: WeightUnits): DraftExercise[] {
  return workout.exercises
    .filter((exercise) => exercise.sets.length > 0)
    .map((exercise) => ({
      rowId: exercise.id,
      exerciseId: exercise.exerciseId,
      name: exercise.name,
      muscleGroup: exercise.muscleGroup,
      isNew: false,
      sets: exercise.sets.map((set) => {
        const weight = displayWeightString(set.weight, units)
        const reps = set.reps == null ? '' : String(set.reps)
        return {
          id: set.id,
          weight,
          reps,
          isNew: false,
          initialWeight: weight,
          initialReps: reps,
        }
      }),
    }))
}

function emptySet(): DraftSet {
  return {
    id: newClientId(),
    weight: '',
    reps: '',
    isNew: true,
    initialWeight: '',
    initialReps: '',
  }
}

function isChangedSet(set: DraftSet): boolean {
  return !set.isNew && (set.weight !== set.initialWeight || set.reps !== set.initialReps)
}

function isInvalidSet(set: DraftSet, displayLimit: number): boolean {
  const weight = set.weight.trim()
  const reps = set.reps.trim()
  if (weight === '' || reps === '') return true
  const parsedWeight = Number.parseFloat(weight)
  if (!Number.isFinite(parsedWeight) || parsedWeight > displayLimit) return true
  const parsedReps = Number.parseInt(reps, 10)
  if (!Number.isInteger(parsedReps) || parsedReps < 1 || parsedReps > MAX_REPS) return true
  return false
}

function storedWeight(display: string, units: WeightUnits): number | null {
  return Math.min(MAX_SET_WEIGHT_KG, toStoredKg(Number.parseFloat(display), units))
}

function isRealDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const parsed = new Date(year, month - 1, day)
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day
}

function fmtShort(value: string): string {
  if (!isRealDate(value)) return value
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  })
}

async function invalidateAfterEdit(
  queryClient: ReturnType<typeof useQueryClient>,
  userId: string,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['history'], refetchType: 'all' }),
    queryClient.invalidateQueries({ queryKey: ['progress'], refetchType: 'all' }),
    queryClient.invalidateQueries({ queryKey: ['dashboard'], refetchType: 'all' }),
    queryClient.invalidateQueries({ queryKey: ['workout'], refetchType: 'all' }),
    queryClient.invalidateQueries({ queryKey: ['exercise-prefill', userId], refetchType: 'all' }),
    queryClient.invalidateQueries({
      queryKey: ['exercises', 'recent-ids', userId],
      refetchType: 'all',
    }),
  ])
}

function EditWorkoutForm({ workout }: { workout: EditableWorkout }) {
  const { user } = useCurrentUser()
  const userId = user!.id
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const { typeChips, settings } = useSuggestedType(userId)
  const units = settings?.units ?? 'kg'
  const displayLimit = roundDisplayWeight(kgToDisplay(MAX_SET_WEIGHT_KG, units), units)

  const [type, setType] = useState(workout.type)
  const [date, setDate] = useState(workout.date)
  const today = localDateString()
  const [exercises, setExercises] = useState(() => buildCards(workout, units))
  const [removedSetIds, setRemovedSetIds] = useState<string[]>([])
  const [removedExerciseIds, setRemovedExerciseIds] = useState<string[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const savingRef = useRef(false)

  const chips = useMemo(() => {
    const current = workout.type.trim()
    if (!current) return typeChips
    const exists = typeChips.some((chip) => chip.trim().toLowerCase() === current.toLowerCase())
    return exists ? typeChips : [current, ...typeChips]
  }, [typeChips, workout.type])

  const changedCount = exercises.reduce(
    (count, exercise) => count + exercise.sets.filter(isChangedSet).length,
    0,
  )
  const addedSetCount = exercises.reduce(
    (count, exercise) => count + exercise.sets.filter((set) => set.isNew).length,
    0,
  )
  const addedExerciseCount = exercises.filter((exercise) => exercise.isNew).length
  const remainingSets = exercises.reduce((count, exercise) => count + exercise.sets.length, 0)
  const dateInvalid = !isRealDate(date) || date > today || date < '2000-01-01'
  const anyInvalid =
    dateInvalid ||
    exercises.some((exercise) => exercise.isNew && exercise.sets.length === 0) ||
    exercises.some((exercise) => exercise.sets.some((set) => isInvalidSet(set, displayLimit)))
  const typeChanged = type.trim() !== workout.type.trim()
  const dateChanged = date !== workout.date
  const hasChanges =
    changedCount > 0 ||
    addedSetCount > 0 ||
    removedSetIds.length > 0 ||
    removedExerciseIds.length > 0 ||
    addedExerciseCount > 0 ||
    typeChanged ||
    dateChanged

  const summary = useMemo(() => {
    const parts: string[] = []
    if (changedCount > 0) parts.push(`${pluralize(changedCount, 'set')} changed`)
    if (addedSetCount > 0) parts.push(`${pluralize(addedSetCount, 'set')} added`)
    if (removedSetIds.length > 0) parts.push(`${pluralize(removedSetIds.length, 'set')} removed`)
    if (addedExerciseCount > 0) parts.push(`${pluralize(addedExerciseCount, 'exercise')} added`)
    if (removedExerciseIds.length > 0) {
      parts.push(`${pluralize(removedExerciseIds.length, 'exercise')} removed`)
    }
    if (typeChanged) parts.push(`Type: ${workout.type.trim()} → ${type.trim()}`)
    if (dateChanged) parts.push(`Date: ${fmtShort(workout.date)} → ${fmtShort(date)}`)
    return parts.length > 0 ? parts.join(' · ') : 'No changes yet'
  }, [
    addedExerciseCount,
    addedSetCount,
    changedCount,
    date,
    dateChanged,
    removedExerciseIds.length,
    removedSetIds.length,
    type,
    typeChanged,
    workout.date,
    workout.type,
  ])

  const requestLeave = () => {
    if (hasChanges) setDiscardOpen(true)
    else navigate(-1)
  }

  const patchSet = (rowId: string, setId: string, patch: Partial<Pick<DraftSet, 'weight' | 'reps'>>) => {
    setExercises((prev) =>
      prev.map((exercise) =>
        exercise.rowId === rowId
          ? {
              ...exercise,
              sets: exercise.sets.map((set) => (set.id === setId ? { ...set, ...patch } : set)),
            }
          : exercise,
      ),
    )
  }

  const removeExercise = (exercise: DraftExercise) => {
    if (!exercise.isNew) {
      setRemovedExerciseIds((prev) =>
        prev.includes(exercise.rowId) ? prev : [...prev, exercise.rowId],
      )
      const ids = exercise.sets.filter((set) => !set.isNew).map((set) => set.id)
      if (ids.length > 0) {
        setRemovedSetIds((prev) => [...prev, ...ids.filter((id) => !prev.includes(id))])
      }
    }
    setExercises((prev) => prev.filter((card) => card.rowId !== exercise.rowId))
  }

  const removeSet = (exercise: DraftExercise, set: DraftSet) => {
    if (!set.isNew) {
      setRemovedSetIds((prev) => (prev.includes(set.id) ? prev : [...prev, set.id]))
    }
    setExercises((prev) =>
      prev.map((card) =>
        card.rowId === exercise.rowId
          ? { ...card, sets: card.sets.filter((row) => row.id !== set.id) }
          : card,
      ),
    )
  }

  const save = async () => {
    if (savingRef.current || isSaving || !hasChanges || anyInvalid || remainingSets === 0) return
    savingRef.current = true
    setIsSaving(true)

    const changedSets: WorkoutEditDraft['changedSets'] = []
    const addedSets: WorkoutEditDraft['addedSets'] = []
    const newExercises: WorkoutEditDraft['newExercises'] = []
    for (const exercise of exercises) {
      if (exercise.isNew) {
        newExercises.push({
          rowId: exercise.rowId,
          exerciseId: exercise.exerciseId,
          sets: exercise.sets.map((set) => ({
            id: set.id,
            weight: storedWeight(set.weight, units),
            reps: Number.parseInt(set.reps, 10),
          })),
        })
        continue
      }
      for (const set of exercise.sets) {
        if (set.isNew) {
          addedSets.push({
            exerciseRowId: exercise.rowId,
            set: {
              id: set.id,
              weight: storedWeight(set.weight, units),
              reps: Number.parseInt(set.reps, 10),
            },
          })
          continue
        }
        if (!isChangedSet(set)) continue
        const original = workout.exercises
          .flatMap((row) => row.sets)
          .find((row) => row.id === set.id)
        if (!original) continue
        changedSets.push({
          exerciseRowId: exercise.rowId,
          set: {
            id: set.id,
            weight: storedWeight(set.weight, units),
            reps: Number.parseInt(set.reps, 10),
            setIndex: original.setIndex,
          },
        })
      }
    }

    try {
      await saveWorkoutEdits(userId, workout, {
        type,
        removedSetIds,
        removedExerciseIds,
        changedSets,
        newExercises,
        addedSets,
        date: date !== workout.date ? date : undefined,
      })
      await invalidateAfterEdit(queryClient, userId)
      toast.show('Workout updated')
      navigate(`/progress/history?w=${workout.id}`, { replace: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong'
      toast.show(`Couldn't save — your edits are still here. ${message}`)
      savingRef.current = false
      setIsSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (savingRef.current) return
    savingRef.current = true
    setIsSaving(true)
    try {
      await deleteFinishedWorkout(userId, workout.id)
      await invalidateAfterEdit(queryClient, userId)
      toast.show('Workout deleted')
      navigate('/progress/history', { replace: true })
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Could not delete workout')
      savingRef.current = false
      setIsSaving(false)
    }
  }

  const blockMessage = dateInvalid
    ? 'Pick a valid date'
    : remainingSets === 0
      ? 'A workout needs at least one set — delete the workout instead.'
      : anyInvalid
        ? 'Fill weight and reps, or delete the set'
        : ''

  return (
    <div className="p-4 md:p-8 pb-24 max-w-lg mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-black text-text-primary">Edit workout</h1>
        <button type="button" onClick={requestLeave} className="min-h-11 px-3 text-sm text-text-secondary">
          Cancel
        </button>
      </div>

      <div>
        <label className="block text-xs uppercase tracking-widest text-text-secondary">Date</label>
        <input
          type="date"
          value={date}
          max={today}
          min="2000-01-01"
          onChange={(event) => setDate(event.target.value)}
          className={cn(inputClass, 'w-full')}
        />
        {date !== workout.date && (
          <p className="mt-1 text-xs text-text-secondary">
            The workout moves to this day. Its time of day is kept.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => {
          const active = type.trim().toLowerCase() === chip.trim().toLowerCase()
          return (
            <button
              key={chip}
              type="button"
              onClick={() => setType(chip)}
              className={cn(
                'px-4 rounded-xl text-sm font-semibold uppercase tracking-wider border min-h-11',
                active
                  ? 'bg-primary text-black border-primary'
                  : 'border-border text-text-secondary hover:border-primary',
              )}
            >
              {chip}
            </button>
          )
        })}
      </div>

      {exercises.map((exercise) => (
        <section key={exercise.rowId} className="rounded-xl border border-border bg-surface overflow-hidden">
          <div className="px-4 py-3 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold text-text-primary truncate">{exercise.name}</p>
              <p className="text-xs text-text-secondary">{exercise.muscleGroup}</p>
            </div>
            <button
              type="button"
              aria-label={`Remove ${exercise.name}`}
              onClick={() => removeExercise(exercise)}
              className="min-h-11 min-w-11 inline-flex items-center justify-center text-text-secondary"
            >
              <Trash2 size={16} />
            </button>
          </div>
          {exercise.sets.map((set, index) => {
            const highlighted = set.isNew || isChangedSet(set)
            return (
              <div
                key={set.id}
                className={cn(
                  'px-4 py-2 flex items-center gap-2 border-t border-border',
                  highlighted && 'border-l-2 border-l-primary',
                )}
              >
                <span className="text-xs text-text-secondary w-12 shrink-0">Set {index + 1}</span>
                <input
                  inputMode="decimal"
                  placeholder={weightUnitLabel(units)}
                  value={set.weight}
                  onFocus={selectOnFocus}
                  onChange={(event) => {
                    const next = event.target.value
                    if (next !== '' && !/^\d*\.?\d*$/.test(next)) return
                    patchSet(exercise.rowId, set.id, { weight: next })
                  }}
                  className={cn(inputClass, 'w-full')}
                />
                <input
                  inputMode="numeric"
                  placeholder="reps"
                  value={set.reps}
                  onFocus={selectOnFocus}
                  onChange={(event) => {
                    const next = event.target.value
                    if (next !== '' && !/^\d*$/.test(next)) return
                    patchSet(exercise.rowId, set.id, { reps: next })
                  }}
                  className={cn(inputClass, 'w-full')}
                />
                <button
                  type="button"
                  aria-label={`Delete set ${index + 1} of ${exercise.name}`}
                  onClick={() => removeSet(exercise, set)}
                  className="min-h-11 min-w-11 shrink-0 inline-flex items-center justify-center text-text-muted"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            )
          })}
          <button
            type="button"
            onClick={() =>
              setExercises((prev) =>
                prev.map((card) =>
                  card.rowId === exercise.rowId ? { ...card, sets: [...card.sets, emptySet()] } : card,
                ),
              )
            }
            className="w-full min-h-11 text-sm text-primary"
          >
            Add set
          </button>
        </section>
      ))}

      <Button variant="secondary" className="w-full min-h-11" onClick={() => setPickerOpen(true)}>
        Add exercise
      </Button>

      <button
        type="button"
        onClick={() => setDeleteOpen(true)}
        className="text-red-400 min-h-11 text-sm"
      >
        Delete workout
      </button>

      <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] pt-2 space-y-2">
        <p className="text-xs text-text-secondary">{summary}</p>
        {blockMessage && <p className="text-xs text-red-400">{blockMessage}</p>}
        <Button
          variant="primary"
          size="lg"
          className="w-full min-h-12"
          disabled={isSaving || !hasChanges || anyInvalid || remainingSets === 0}
          onClick={() => void save()}
        >
          Save changes
        </Button>
      </div>

      <ExercisePickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        userId={userId}
        workoutType={type}
        excludeExerciseIds={exercises.map((exercise) => exercise.exerciseId)}
        onPick={(exercise: Exercise) => {
          setExercises((prev) => [
            ...prev,
            {
              rowId: newClientId(),
              exerciseId: exercise.id,
              name: exercise.name,
              muscleGroup: exercise.muscleGroup,
              isNew: true,
              sets: [emptySet()],
            },
          ])
          setPickerOpen(false)
        }}
      />

      <BottomSheet open={discardOpen} onClose={() => setDiscardOpen(false)} title="Discard changes?">
        <div className="p-4 space-y-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setDiscardOpen(false)}
              className="flex-1 min-h-11 rounded-xl border border-border text-sm font-semibold text-text-secondary"
            >
              Keep editing
            </button>
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="flex-1 min-h-11 rounded-xl bg-primary text-black text-sm font-semibold"
            >
              Discard
            </button>
          </div>
        </div>
      </BottomSheet>

      <BottomSheet open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete this workout?">
        <div className="p-4 space-y-4">
          <p className="text-sm text-text-secondary">
            Remove this workout and all of its sets? This cannot be undone.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setDeleteOpen(false)}
              className="flex-1 min-h-11 rounded-xl border border-border text-sm font-semibold text-text-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void confirmDelete()}
              disabled={isSaving}
              className="flex-1 min-h-11 rounded-xl bg-primary text-black text-sm font-semibold disabled:opacity-40"
            >
              Delete workout
            </button>
          </div>
        </div>
      </BottomSheet>
    </div>
  )
}

function Unavailable({ onBack }: { onBack: () => void }) {
  return (
    <div className="p-4 md:p-8 max-w-lg mx-auto">
      <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
        <p className="text-sm text-text-primary">
          This workout can't be edited (not found or still in progress).
        </p>
        <button type="button" onClick={onBack} className="min-h-11 text-sm text-primary">
          Back to history
        </button>
      </div>
    </div>
  )
}

export default function EditWorkout() {
  const { workoutId } = useParams<{ workoutId: string }>()
  const { user } = useCurrentUser()
  const userId = user!.id
  const navigate = useNavigate()
  const { suggestionsReady } = useSuggestedType(userId)
  const query = useQuery({
    queryKey: ['workout', 'edit', userId, workoutId],
    queryFn: () => getWorkoutForEdit(userId, workoutId ?? ''),
    enabled: Boolean(workoutId),
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
  })

  if (!workoutId) return <Unavailable onBack={() => navigate('/progress/history')} />
  if (query.isLoading || !suggestionsReady) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 size={20} className="text-primary animate-spin" />
      </div>
    )
  }
  if (query.isError || !query.data) {
    return <Unavailable onBack={() => navigate('/progress/history')} />
  }
  return <EditWorkoutForm workout={query.data} />
}
