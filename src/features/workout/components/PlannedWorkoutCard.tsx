import { useState } from 'react'
import { Dumbbell } from 'lucide-react'
import { BottomSheet } from '../../../components/ui/BottomSheet'
import { Button } from '../../../components/ui/Button'
import { pluralize } from '../../../lib/pluralize'
import { DELETE_PLAN_BODY, DELETE_PLAN_TITLE, type WorkoutPlan } from '../lib/workoutPlan'

type PlannedWorkoutCardProps = {
  plan: WorkoutPlan
  onStart: () => void
  onEdit: () => void
  onDelete: () => void
  disabled?: boolean
}

export function PlannedWorkoutCard({
  plan,
  onStart,
  onEdit,
  onDelete,
  disabled,
}: PlannedWorkoutCardProps) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const shown = plan.exercises.slice(0, 4).map((exercise) => exercise.name)
  const more = plan.exercises.length - shown.length
  const names = more > 0 ? `${shown.join(', ')} +${more} more` : shown.join(', ')

  return (
    <div className="rounded-xl border border-primary/40 bg-surface p-4 space-y-3">
      <div>
        <p className="text-[11px] uppercase tracking-widest text-primary">Planned</p>
        <p className="text-lg font-black text-text-primary">{plan.type}</p>
        <p className="text-sm text-text-secondary">{pluralize(plan.exercises.length, 'exercise')}</p>
        <p className="text-xs text-text-muted mt-1">{names}</p>
      </div>
      <Button
        variant="primary"
        size="lg"
        className="w-full min-h-12"
        disabled={disabled}
        onClick={onStart}
      >
        <Dumbbell size={16} className="mr-2" />
        Start planned workout
      </Button>
      <div className="flex gap-2">
        <button type="button" onClick={onEdit} className="min-h-11 text-sm text-primary">
          Edit
        </button>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className="min-h-11 text-sm text-red-400"
        >
          Delete plan
        </button>
      </div>
      <BottomSheet open={confirmOpen} onClose={() => setConfirmOpen(false)} title={DELETE_PLAN_TITLE}>
        <p className="text-sm text-text-secondary mb-4">{DELETE_PLAN_BODY}</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setConfirmOpen(false)}
            className="flex-1 min-h-11 rounded-xl border border-border text-sm font-semibold text-text-secondary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirmOpen(false)
              onDelete()
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
