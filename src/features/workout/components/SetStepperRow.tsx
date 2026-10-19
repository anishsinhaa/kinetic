import { motion, useReducedMotion } from 'framer-motion'
import { Check, Minus, Plus, Trash2 } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { selectOnFocus } from '../../../lib/selectOnFocus'
import type { WeightUnits } from '../../../lib/supabase/database.types'
import type { WorkoutSetDraft } from '../types'

type SetStepperRowProps = {
  index: number
  set: WorkoutSetDraft
  weightStep: number
  units: WeightUnits
  disabled?: boolean
  status?: 'idle' | 'saving' | 'saved' | 'error'
  /** Edits go through here — also for completed sets (no un-complete needed, no rest restart). */
  onChange: (patch: Partial<WorkoutSetDraft>) => void
  onComplete: () => void
  onUncomplete: () => void
  onDelete: () => void
  onRetry?: () => void
}

function parseNum(v: string): number {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

const STEP_BTN =
  'min-h-11 min-w-11 shrink-0 rounded-xl bg-surface-2 border border-border flex items-center justify-center text-text-secondary hover:text-primary active:bg-surface-3 disabled:opacity-40'

function Stepper({
  label,
  unit,
  value,
  inputMode,
  disabled,
  onType,
  onMinus,
  onPlus,
}: {
  label: string
  unit: string
  value: string
  inputMode: 'decimal' | 'numeric'
  disabled: boolean
  onType: (v: string) => void
  onMinus: () => void
  onPlus: () => void
}) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <button
        type="button"
        disabled={disabled}
        className={STEP_BTN}
        aria-label={`Decrease ${label}`}
        onClick={onMinus}
      >
        <Minus size={16} />
      </button>
      <div className="relative flex-1 min-w-0">
        <input
          type="number"
          inputMode={inputMode}
          disabled={disabled}
          aria-label={label}
          value={value}
          onFocus={selectOnFocus}
          onChange={(e) => onType(e.target.value)}
          className="w-full min-h-11 bg-surface-2 border border-border rounded-xl pl-1 pr-1 text-center text-base font-semibold text-text-primary focus:outline-hidden focus:border-primary disabled:opacity-60"
        />
        <span className="pointer-events-none absolute right-1.5 bottom-0.5 text-[9px] text-text-muted leading-none">
          {unit}
        </span>
      </div>
      <button
        type="button"
        disabled={disabled}
        className={STEP_BTN}
        aria-label={`Increase ${label}`}
        onClick={onPlus}
      >
        <Plus size={16} />
      </button>
    </div>
  )
}

export function SetStepperRow({
  index,
  set,
  weightStep,
  units,
  disabled,
  status,
  onChange,
  onComplete,
  onUncomplete,
  onDelete,
  onRetry,
}: SetStepperRowProps) {
  const reduceMotion = useReducedMotion()
  const weight = parseNum(set.weight)
  const reps = parseInt(set.reps || '0', 10) || 0
  const locked = Boolean(disabled)
  const n = index + 1

  return (
    <motion.div
      layout
      className={cn(
        'px-3 py-3 border-b border-border space-y-2',
        set.completed && 'bg-primary/5',
      )}
      animate={set.completed && !reduceMotion ? { scale: [1, 1.01, 1] } : undefined}
      transition={{ duration: 0.25 }}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            'text-sm font-bold',
            set.completed ? 'text-primary' : 'text-text-secondary',
          )}
        >
          Set {n}
          {set.completed && <span className="ml-2 text-[11px] font-medium">Done</span>}
          {status === 'saving' && (
            <span className="ml-2 text-[11px] font-normal text-text-muted">Saving…</span>
          )}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={locked || (!set.completed && (set.weight === '' || set.reps === ''))}
            onClick={() => (set.completed ? onUncomplete() : onComplete())}
            className={cn(
              'min-h-11 min-w-11 rounded-xl flex items-center justify-center border transition-colors',
              set.completed
                ? 'bg-primary text-black border-primary'
                : 'bg-surface-2 border-border text-text-secondary hover:border-primary hover:text-primary disabled:opacity-40',
            )}
            aria-label={set.completed ? `Mark set ${n} not done` : `Complete set ${n}`}
          >
            <Check size={18} strokeWidth={3} />
          </button>
          <button
            type="button"
            disabled={locked}
            onClick={onDelete}
            className="min-h-11 min-w-11 rounded-xl flex items-center justify-center border border-border bg-surface-2 text-text-muted hover:text-red-400 hover:border-red-400/50 disabled:opacity-40"
            aria-label={`Delete set ${n}`}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stepper
          label={`Weight, set ${n}`}
          unit={units}
          value={set.weight}
          inputMode="decimal"
          disabled={locked}
          onType={(v) => onChange({ weight: v })}
          onMinus={() => onChange({ weight: String(Math.max(0, +(weight - weightStep).toFixed(2))) })}
          onPlus={() => onChange({ weight: String(+(weight + weightStep).toFixed(2)) })}
        />
        <Stepper
          label={`Reps, set ${n}`}
          unit="reps"
          value={set.reps}
          inputMode="numeric"
          disabled={locked}
          onType={(v) => onChange({ reps: v })}
          onMinus={() => onChange({ reps: String(Math.max(0, reps - 1)) })}
          onPlus={() => onChange({ reps: String(reps + 1) })}
        />
      </div>

      {status === 'error' && (
        <p className="text-[11px] text-red-400 flex items-center gap-2">
          Unsaved — save failed
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="underline text-primary hover:text-primary/80 min-h-11 px-2"
            >
              Retry
            </button>
          )}
        </p>
      )}
    </motion.div>
  )
}
