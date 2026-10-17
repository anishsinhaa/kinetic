import { motion, useReducedMotion } from 'framer-motion'
import { Check, Minus, Plus } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { selectOnFocus } from '../../../lib/selectOnFocus'
import type { WorkoutSetDraft } from '../types'

type SetStepperRowProps = {
  index: number
  set: WorkoutSetDraft
  weightStep: number
  disabled?: boolean
  status?: 'idle' | 'saving' | 'saved' | 'error'
  onChange: (patch: Partial<WorkoutSetDraft>) => void
  onComplete: () => void
}

function parseNum(v: string): number {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

export function SetStepperRow({
  index,
  set,
  weightStep,
  disabled,
  status,
  onChange,
  onComplete,
}: SetStepperRowProps) {
  const reduceMotion = useReducedMotion()
  const weight = parseNum(set.weight)
  const reps = parseInt(set.reps || '0', 10) || 0

  return (
    <motion.div
      layout
      className={cn(
        'grid grid-cols-[2rem_1fr_1fr_3rem] gap-2 items-center px-3 py-3 border-b border-border',
        set.completed && 'bg-primary/5',
      )}
      animate={
        set.completed && !reduceMotion
          ? { scale: [1, 1.02, 1] }
          : undefined
      }
      transition={{ duration: 0.25 }}
    >
      <span
        className={cn(
          'text-sm font-bold',
          set.completed ? 'text-primary' : 'text-text-secondary',
        )}
      >
        {index + 1}
      </span>

      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={disabled || set.completed}
          className="min-h-11 min-w-11 rounded-xl bg-surface-2 border border-border flex items-center justify-center text-text-secondary hover:text-primary disabled:opacity-40"
          onClick={() =>
            onChange({ weight: String(Math.max(0, +(weight - weightStep).toFixed(2))) })
          }
        >
          <Minus size={14} />
        </button>
        <input
          type="number"
          inputMode="decimal"
          disabled={disabled || set.completed}
          value={set.weight}
          onFocus={selectOnFocus}
          onChange={(e) => onChange({ weight: e.target.value })}
          className="w-full min-h-11 bg-surface-2 border border-border rounded-xl px-1 text-center text-sm font-semibold text-text-primary focus:outline-hidden focus:border-primary"
        />
        <button
          type="button"
          disabled={disabled || set.completed}
          className="min-h-11 min-w-11 rounded-xl bg-surface-2 border border-border flex items-center justify-center text-text-secondary hover:text-primary disabled:opacity-40"
          onClick={() => onChange({ weight: String(+(weight + weightStep).toFixed(2)) })}
        >
          <Plus size={14} />
        </button>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={disabled || set.completed}
          className="min-h-11 min-w-11 rounded-xl bg-surface-2 border border-border flex items-center justify-center text-text-secondary hover:text-primary disabled:opacity-40"
          onClick={() => onChange({ reps: String(Math.max(0, reps - 1)) })}
        >
          <Minus size={14} />
        </button>
        <input
          type="number"
          inputMode="numeric"
          disabled={disabled || set.completed}
          value={set.reps}
          onFocus={selectOnFocus}
          onChange={(e) => onChange({ reps: e.target.value })}
          className="w-full min-h-11 bg-surface-2 border border-border rounded-xl px-1 text-center text-sm font-semibold text-text-primary focus:outline-hidden focus:border-primary"
        />
        <button
          type="button"
          disabled={disabled || set.completed}
          className="min-h-11 min-w-11 rounded-xl bg-surface-2 border border-border flex items-center justify-center text-text-secondary hover:text-primary disabled:opacity-40"
          onClick={() => onChange({ reps: String(reps + 1) })}
        >
          <Plus size={14} />
        </button>
      </div>

      <button
        type="button"
        disabled={disabled || set.completed || set.weight === '' || set.reps === ''}
        onClick={onComplete}
        className={cn(
          'min-h-11 min-w-11 rounded-xl flex items-center justify-center border transition-colors',
          set.completed
            ? 'bg-primary text-black border-primary'
            : 'bg-surface-2 border-border text-text-secondary hover:border-primary hover:text-primary disabled:opacity-40',
        )}
        aria-label={set.completed ? 'Set complete' : 'Complete set'}
      >
        <Check size={18} strokeWidth={3} />
      </button>

      {status === 'saving' && (
        <span className="col-span-4 text-[9px] text-text-muted">Saving…</span>
      )}
    </motion.div>
  )
}
