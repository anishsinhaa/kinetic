import { useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { BottomSheet } from '../components/ui/BottomSheet'
import { Button } from '../components/ui/Button'
import { useToast } from '../components/ui/toastContext'
import { useCurrentUser } from '../features/auth/useAuth'
import type { Exercise } from '../features/exercises/types'
import { ExercisePickerSheet } from '../features/workout/components/ExercisePickerSheet'
import { SetStepperRow } from '../features/workout/components/SetStepperRow'
import { MAX_REPS, MAX_SET_WEIGHT_KG } from '../features/workout/constants'
import { useSuggestedType } from '../features/workout/hooks/useSuggestedType'
import { formatRelativeDate } from '../features/workout/lib/formatRelativeDate'
import {
  buildPrefillDraftSets,
  isExerciseUntouched,
  shouldApplySetPrefill,
} from '../features/workout/lib/exercisePrefill'
import { getExercisePrefillContext, logPastWorkout } from '../features/workout/services/workoutService'
import type { WorkoutSetDraft } from '../features/workout/types'
import { formatSetLine, roundWeightForDisplay, toStoredKg } from '../features/settings/lib/units'
import type { WeightUnits } from '../lib/supabase/database.types'
import { localDateString } from '../lib/localDate'
import { cn } from '../lib/utils'

function newClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
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

function yesterdayString(): string {
  const now = new Date()
  return localDateString(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))
}

function initialDate(param: string | null, today: string): string {
  if (param && isRealDate(param) && param <= today) return param
  return yesterdayString()
}

function noonOrNow(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  const noon = new Date(year, month - 1, day, 12, 0, 0, 0)
  const stamp = noon.getTime() > Date.now() ? new Date() : noon
  return stamp.toISOString()
}

function emptySet(): WorkoutSetDraft {
  return {
    id: newClientId(),
    reps: '',
    weight: '',
    toFailure: false,
    completed: false,
    completedAt: null,
  }
}

function isSavableSet(set: WorkoutSetDraft): boolean {
  if (set.completed) return true
  return set.weight.trim() !== '' && set.reps.trim() !== ''
}

function toStoredSet(set: WorkoutSetDraft, units: WeightUnits): {
  weight: number | null
  reps: number | null
  toFailure: boolean
} {
  const rawReps = set.reps.trim() === '' ? null : Number.parseInt(set.reps, 10)
  const reps =
    rawReps != null && Number.isFinite(rawReps)
      ? Math.min(MAX_REPS, Math.max(0, Math.round(rawReps)))
      : null
  const displayWeight = set.weight.trim() === '' ? null : Number.parseFloat(set.weight)
  const weight =
    displayWeight != null && Number.isFinite(displayWeight)
      ? Math.min(MAX_SET_WEIGHT_KG, Math.max(0, toStoredKg(displayWeight, units)))
      : null
  return { weight, reps, toFailure: set.toFailure }
}

type PastExerciseCard = {
  id: string
  exerciseId: string
  name: string
  muscleGroup: string
  lastPerformance?: string
  prefillApplied: boolean
  sets: WorkoutSetDraft[]
}

const inputClass =
  'min-h-11 bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm text-text-primary focus:outline-hidden focus:border-primary'

export default function LogPastWorkout() {
  const { user } = useCurrentUser()
  const userId = user!.id
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const toast = useToast()
  const { typeChips, suggestedType, suggestionsReady, settings } = useSuggestedType(userId)
  const units = settings?.units ?? 'kg'
  const weightStep = settings?.weightStep ?? 2.5

  const today = localDateString()
  const [date, setDate] = useState(() => initialDate(searchParams.get('date'), today))
  const [pickedType, setPickedType] = useState<string | null>(null)
  const [exercises, setExercises] = useState<PastExerciseCard[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const savingRef = useRef(false)

  const workoutType = pickedType ?? (suggestionsReady ? suggestedType : '')

  const savableCount = useMemo(
    () => exercises.reduce((count, exercise) => count + exercise.sets.filter(isSavableSet).length, 0),
    [exercises],
  )

  const requestLeave = () => {
    if (exercises.length > 0) setDiscardOpen(true)
    else navigate(-1)
  }

  const patchSet = (cardId: string, setId: string, patch: Partial<WorkoutSetDraft>) => {
    setExercises((prev) =>
      prev.map((card) =>
        card.id === cardId
          ? { ...card, sets: card.sets.map((set) => (set.id === setId ? { ...set, ...patch } : set)) }
          : card,
      ),
    )
  }

  const addExercise = (exercise: Exercise) => {
    const cardId = newClientId()
    setExercises((prev) => [
      ...prev,
      {
        id: cardId,
        exerciseId: exercise.id,
        name: exercise.name,
        muscleGroup: exercise.muscleGroup,
        prefillApplied: false,
        sets: [emptySet()],
      },
    ])
    setPickerOpen(false)

    void (async () => {
      try {
        const ctx = await queryClient.fetchQuery({
          queryKey: ['exercise-prefill', userId, exercise.id],
          queryFn: () => getExercisePrefillContext(userId, exercise.id),
          staleTime: 1000 * 60 * 5,
        })
        const lastPerformance =
          ctx.lastSets.length > 0
            ? `Last: ${ctx.lastSets
                .map((set) => formatSetLine(set.weight, set.reps, units, weightStep))
                .join(' · ')}`
            : 'No previous performance'
        const prefillRows = ctx.lastSets.map((set) => ({
          weight: set.weight,
          reps: set.reps,
          displayWeight:
            set.weight != null ? roundWeightForDisplay(set.weight, units, weightStep) : null,
        }))
        setExercises((prev) =>
          prev.map((card) => {
            if (card.id !== cardId) return card
            const apply = shouldApplySetPrefill({
              untouched: isExerciseUntouched(card.sets),
              hasPrefillRows: prefillRows.length > 0,
              alreadyApplied: card.prefillApplied,
            })
            if (!apply) return { ...card, lastPerformance, prefillApplied: true }
            return {
              ...card,
              lastPerformance,
              prefillApplied: true,
              sets: buildPrefillDraftSets(prefillRows, newClientId),
            }
          }),
        )
      } catch {
        // Last-session lookup is optional.
      }
    })()
  }

  const save = async () => {
    if (savingRef.current || isSaving || !workoutType || savableCount === 0) return
    savingRef.current = true
    setIsSaving(true)
    const savedExercises = exercises.flatMap((exercise) => {
      const sets = exercise.sets.filter(isSavableSet).map((set) => toStoredSet(set, units))
      if (sets.length === 0) return []
      return [{ exerciseId: exercise.exerciseId, sets }]
    })
    try {
      const { id } = await logPastWorkout(userId, {
        date,
        workoutType,
        endedAt: noonOrNow(date),
        exercises: savedExercises,
      })
      void queryClient.invalidateQueries({
        queryKey: ['dashboard', 'stats', userId],
        refetchType: 'all',
      })
      void queryClient.invalidateQueries({
        queryKey: ['workout', 'latest-completed', userId],
        refetchType: 'all',
      })
      void queryClient.invalidateQueries({
        queryKey: ['workout', 'recent-list', userId],
        refetchType: 'all',
      })
      void queryClient.invalidateQueries({ queryKey: ['workout', 'recent-types', userId] })
      void queryClient.invalidateQueries({ queryKey: ['exercises', 'recent-ids', userId] })
      void queryClient.invalidateQueries({ queryKey: ['history'], refetchType: 'all' })
      void queryClient.invalidateQueries({ queryKey: ['progress'], refetchType: 'all' })
      for (const exercise of savedExercises) {
        void queryClient.invalidateQueries({
          queryKey: ['exercise-prefill', userId, exercise.exerciseId],
          refetchType: 'all',
        })
      }
      toast.show(`Workout saved for ${formatRelativeDate(date)}`, { kind: 'success' })
      navigate(`/progress/history?w=${id}`)
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Could not save workout', { kind: 'error' })
      savingRef.current = false
      setIsSaving(false)
    }
  }

  return (
    <div className="p-4 md:p-8 pb-28 max-w-lg mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-black text-text-primary">Log past workout</h1>
        <button type="button" onClick={requestLeave} className="min-h-11 px-3 text-sm text-text-secondary">
          Cancel
        </button>
      </div>

      <div className="flex items-center gap-3">
        <input
          type="date"
          max={today}
          value={date}
          onChange={(event) => {
            const next = event.target.value
            if (!isRealDate(next) || next > today) return
            setDate(next)
          }}
          className={inputClass}
        />
        <p className="text-sm text-text-secondary">{formatRelativeDate(date)}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {typeChips.map((type) => {
          const active = workoutType === type
          return (
            <button
              key={type}
              type="button"
              onClick={() => setPickedType(type)}
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

      {exercises.map((exercise) => (
        <section key={exercise.id} className="rounded-xl border border-border bg-surface overflow-hidden">
          <div className="px-4 py-3 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold text-text-primary truncate">{exercise.name}</p>
              <p className="text-xs text-text-secondary">{exercise.muscleGroup}</p>
              {exercise.lastPerformance && (
                <p className="text-xs text-text-secondary mt-1">{exercise.lastPerformance}</p>
              )}
            </div>
            <button
              type="button"
              aria-label={`Remove ${exercise.name}`}
              onClick={() => setExercises((prev) => prev.filter((card) => card.id !== exercise.id))}
              className="min-h-11 min-w-11 text-text-secondary"
            >
              ×
            </button>
          </div>
          {exercise.sets.map((set, index) => (
            <SetStepperRow
              key={set.id}
              index={index}
              set={set}
              weightStep={weightStep}
              units={units}
              disabled={false}
              status="idle"
              onChange={(patch) => patchSet(exercise.id, set.id, patch)}
              onComplete={() =>
                patchSet(exercise.id, set.id, { completed: true, completedAt: new Date().toISOString() })
              }
              onUncomplete={() => patchSet(exercise.id, set.id, { completed: false, completedAt: null })}
              onSave={() => {}}
              onDelete={() =>
                setExercises((prev) =>
                  prev.map((card) =>
                    card.id === exercise.id
                      ? { ...card, sets: card.sets.filter((row) => row.id !== set.id) }
                      : card,
                  ),
                )
              }
              onRetry={() => {}}
            />
          ))}
          <button
            type="button"
            onClick={() =>
              setExercises((prev) =>
                prev.map((card) =>
                  card.id === exercise.id ? { ...card, sets: [...card.sets, emptySet()] } : card,
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

      <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] pt-2">
        <Button
          variant="primary"
          size="lg"
          className="w-full min-h-12"
          disabled={isSaving || !workoutType || savableCount === 0}
          onClick={() => void save()}
        >
          Save workout
        </Button>
      </div>

      <ExercisePickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        userId={userId}
        workoutType={workoutType}
        excludeExerciseIds={exercises.map((exercise) => exercise.exerciseId)}
        onPick={addExercise}
      />

      <BottomSheet open={discardOpen} onClose={() => setDiscardOpen(false)} title="Discard this workout?">
        <p className="text-sm text-text-secondary mb-4">Nothing has been saved yet.</p>
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
      </BottomSheet>
    </div>
  )
}
