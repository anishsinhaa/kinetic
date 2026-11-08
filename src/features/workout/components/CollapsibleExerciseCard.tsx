/* eslint-disable react-refresh/only-export-components -- exerciseSummary is co-located */
import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { formatSetLine, toStoredKg } from '../../settings/lib/units'
import type { WeightUnits } from '../../../lib/supabase/database.types'
import { cn } from '../../../lib/utils'

export function exerciseSummary(
  sets: Array<{ weight: string; reps: string }>,
  units: WeightUnits,
  weightStep: number,
): string {
  const filled = sets.filter((set) => set.reps.trim() !== '')
  if (filled.length === 0) return 'No sets yet'

  let best = filled[0]!
  for (const set of filled.slice(1)) {
    const bestWeight = Number.parseFloat(best.weight)
    const setWeight = Number.parseFloat(set.weight)
    const bestReps = Number.parseInt(best.reps, 10)
    const setReps = Number.parseInt(set.reps, 10)
    const bw = Number.isFinite(bestWeight) ? bestWeight : Number.NEGATIVE_INFINITY
    const sw = Number.isFinite(setWeight) ? setWeight : Number.NEGATIVE_INFINITY
    const br = Number.isFinite(bestReps) ? bestReps : 0
    const sr = Number.isFinite(setReps) ? setReps : 0
    if (sw > bw || (sw === bw && sr > br)) best = set
  }

  const displayWeight = Number.parseFloat(best.weight)
  const kg =
    best.weight.trim() === '' || !Number.isFinite(displayWeight)
      ? null
      : toStoredKg(displayWeight, units)
  const reps = Number.parseInt(best.reps, 10)
  return `${filled.length} sets · best ${formatSetLine(
    kg,
    Number.isFinite(reps) ? reps : null,
    units,
    weightStep,
  )}`
}

type CollapsibleExerciseCardProps = {
  name: string
  subtitle?: ReactNode
  summary: string
  open: boolean
  onOpen: () => void
  onDone: () => void
  onRemove: () => void
  children: ReactNode
}

export function CollapsibleExerciseCard({
  name,
  subtitle,
  summary,
  open,
  onOpen,
  onDone,
  onRemove,
  children,
}: CollapsibleExerciseCardProps) {
  if (!open) {
    return (
      <section className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="flex items-stretch">
          <button
            type="button"
            aria-expanded={false}
            aria-label={`Edit ${name}`}
            onClick={onOpen}
            className="flex-1 min-w-0 min-h-12 px-4 py-3 text-left flex items-center gap-3"
          >
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-text-primary truncate">{name}</p>
              <p className="text-xs text-text-secondary truncate">{summary}</p>
            </div>
            <span className="shrink-0 text-primary text-sm font-medium">✓</span>
            <ChevronRight size={16} className="shrink-0 text-text-muted" />
          </button>
          <button
            type="button"
            aria-label={`Remove ${name}`}
            onClick={(event) => {
              event.stopPropagation()
              onRemove()
            }}
            className="min-h-12 min-w-11 shrink-0 text-text-secondary border-l border-border"
          >
            ×
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="px-4 py-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-text-primary truncate">{name}</p>
          {subtitle}
        </div>
        <button
          type="button"
          aria-label={`Remove ${name}`}
          onClick={onRemove}
          className="min-h-11 min-w-11 text-text-secondary"
        >
          ×
        </button>
      </div>
      {children}
      <button
        type="button"
        onClick={onDone}
        className={cn('w-full min-h-12 text-sm text-primary border-t border-border')}
      >
        Done with this exercise
      </button>
    </section>
  )
}
