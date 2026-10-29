import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { BottomSheet } from '../components/ui/BottomSheet'
import { Button } from '../components/ui/Button'
import { useToast } from '../components/ui/toastContext'
import { useCurrentUser } from '../features/auth/useAuth'
import type { Exercise } from '../features/exercises/types'
import { ExercisePickerSheet } from '../features/workout/components/ExercisePickerSheet'
import { useSuggestedType } from '../features/workout/hooks/useSuggestedType'
import { useWorkoutPlan } from '../features/workout/hooks/useWorkoutPlan'
import {
  clearWorkoutPlan,
  DELETE_PLAN_BODY,
  DELETE_PLAN_TITLE,
  MAX_PLAN_EXERCISES,
  saveWorkoutPlan,
  type PlannedExercise,
  type WorkoutPlan,
} from '../features/workout/lib/workoutPlan'
import { cn } from '../lib/utils'

function sameExercises(a: PlannedExercise[], b: PlannedExercise[]): boolean {
  if (a.length !== b.length) return false
  return a.every((exercise, index) => exercise.exerciseId === b[index]?.exerciseId)
}

function isDirty(
  saved: WorkoutPlan | null,
  type: string,
  exercises: PlannedExercise[],
  pickedType: string | null,
): boolean {
  if (!saved) return exercises.length > 0 || pickedType != null
  return type !== saved.type || !sameExercises(exercises, saved.exercises)
}

export default function PlanWorkout() {
  const { user } = useCurrentUser()
  const userId = user!.id
  const saved = useWorkoutPlan(userId)
  const { typeChips, suggestedType, suggestionsReady } = useSuggestedType(userId)
  const toast = useToast()
  const navigate = useNavigate()

  const [pickedType, setPickedType] = useState<string | null>(null)
  const [exercises, setExercises] = useState<PlannedExercise[]>(() => saved?.exercises ?? [])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const type = pickedType ?? saved?.type ?? suggestedType
  const chipsEnabled = suggestionsReady || Boolean(saved)
  const dirty = isDirty(saved, type, exercises, pickedType)

  const requestLeave = () => {
    if (dirty) setDiscardOpen(true)
    else navigate(-1)
  }

  const onPick = (exercise: Exercise) => {
    setExercises((prev) => {
      if (prev.some((row) => row.exerciseId === exercise.id)) return prev
      if (prev.length >= MAX_PLAN_EXERCISES) return prev
      return [
        ...prev,
        { exerciseId: exercise.id, name: exercise.name, muscleGroup: exercise.muscleGroup },
      ]
    })
    setPickerOpen(false)
  }

  const move = (index: number, direction: -1 | 1) => {
    setExercises((prev) => {
      const target = index + direction
      if (target < 0 || target >= prev.length) return prev
      const next = [...prev]
      const [row] = next.splice(index, 1)
      if (!row) return prev
      next.splice(target, 0, row)
      return next
    })
  }

  const save = () => {
    const ok = saveWorkoutPlan(userId, { type, exercises })
    if (!ok) {
      toast.show("Couldn't save the plan on this device", { kind: 'error' })
      return
    }
    toast.show('Plan saved', { kind: 'success' })
    navigate('/workout', { replace: true })
  }

  return (
    <div className="p-4 md:p-8 pb-28 max-w-lg mx-auto space-y-4">
      <p className="text-[11px] text-primary uppercase tracking-widest">Workout</p>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-black text-text-primary">{saved ? 'Edit plan' : 'Plan workout'}</h1>
        <button type="button" onClick={requestLeave} className="min-h-11 px-3 text-sm text-text-secondary">
          Cancel
        </button>
      </div>
      <p className="text-sm text-text-muted">
        Saved on this device only. Starting it creates the workout with these exercises.
      </p>

      <div className="flex flex-wrap gap-2">
        {typeChips.map((chip) => {
          const active = type === chip
          return (
            <button
              key={chip}
              type="button"
              disabled={!chipsEnabled}
              onClick={() => setPickedType(chip)}
              className={cn(
                'px-4 rounded-xl text-sm font-semibold uppercase tracking-wider border min-h-11 disabled:opacity-40',
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

      {exercises.length === 0 ? (
        <p className="text-sm text-text-secondary">No exercises yet. Add the ones you want to do.</p>
      ) : (
        <div className="space-y-2">
          {exercises.map((exercise, index) => (
            <div
              key={exercise.exerciseId}
              className="rounded-xl border border-border bg-surface px-3 py-2 flex items-center gap-2"
            >
              <span className="text-sm tabular-nums text-text-muted w-6">{index + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-text-primary truncate">{exercise.name}</p>
                <p className="text-xs text-text-secondary truncate">{exercise.muscleGroup}</p>
              </div>
              <button
                type="button"
                aria-label={`Move ${exercise.name} up`}
                disabled={index === 0}
                onClick={() => move(index, -1)}
                className="min-h-11 min-w-11 inline-flex items-center justify-center text-text-secondary disabled:opacity-40"
              >
                <ChevronUp size={16} />
              </button>
              <button
                type="button"
                aria-label={`Move ${exercise.name} down`}
                disabled={index === exercises.length - 1}
                onClick={() => move(index, 1)}
                className="min-h-11 min-w-11 inline-flex items-center justify-center text-text-secondary disabled:opacity-40"
              >
                <ChevronDown size={16} />
              </button>
              <button
                type="button"
                aria-label={`Remove ${exercise.name}`}
                onClick={() =>
                  setExercises((prev) => prev.filter((row) => row.exerciseId !== exercise.exerciseId))
                }
                className="min-h-11 min-w-11 text-text-secondary"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <Button variant="secondary" className="w-full min-h-11" onClick={() => setPickerOpen(true)}>
        Add exercise
      </Button>

      <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] pt-2 space-y-2">
        <Button
          variant="primary"
          size="lg"
          className="w-full min-h-12"
          disabled={!type.trim() || exercises.length === 0}
          onClick={save}
        >
          Save plan
        </Button>
        {saved && (
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            className="block w-full min-h-11 text-sm text-red-400"
          >
            Delete plan
          </button>
        )}
      </div>

      <ExercisePickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        userId={userId}
        workoutType={type}
        excludeExerciseIds={exercises.map((exercise) => exercise.exerciseId)}
        onPick={onPick}
      />

      <BottomSheet open={discardOpen} onClose={() => setDiscardOpen(false)} title="Discard changes?">
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

      <BottomSheet open={deleteOpen} onClose={() => setDeleteOpen(false)} title={DELETE_PLAN_TITLE}>
        <p className="text-sm text-text-secondary mb-4">{DELETE_PLAN_BODY}</p>
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
            onClick={() => {
              clearWorkoutPlan(userId)
              toast.show('Plan deleted', { kind: 'success' })
              navigate('/workout')
            }}
            className="flex-1 min-h-11 rounded-xl text-sm font-semibold text-red-400"
          >
            Delete plan
          </button>
        </div>
      </BottomSheet>
    </div>
  )
}
