import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Check, Minus, Pencil, Plus, Trash2 } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { selectOnFocus } from '../../../lib/selectOnFocus'
import { kgToDisplay, snapToStep } from '../../settings/lib/units'
import { MAX_REPS, MAX_SET_WEIGHT_KG } from '../constants'
import type { WeightUnits } from '../../../lib/supabase/database.types'
import type { WorkoutSetDraft } from '../types'

function maxWeightInDisplay(units: WeightUnits, step: number): number {
  const raw = kgToDisplay(MAX_SET_WEIGHT_KG, units)
  if (!step || step <= 0) return raw
  const floored = Math.floor((raw + 1e-9) / step) * step
  return snapToStep(floored, step)
}

type SetStepperRowProps = {
  index: number
  set: WorkoutSetDraft
  weightStep: number
  units: WeightUnits
  disabled?: boolean
  status?: 'idle' | 'saving' | 'saved' | 'error'
  /** Logged sets are read-only until you tap Edit; saving an edit does not restart the rest timer. */
  onChange: (patch: Partial<WorkoutSetDraft>) => void
  onComplete: () => void
  onUncomplete: () => void
  /** Flush the pending save for this set; does not restart the rest timer. */
  onSave?: () => void
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
  snapStep,
  max,
  onType,
  onMinus,
  onPlus,
}: {
  label: string
  unit: string
  value: string
  inputMode: 'decimal' | 'numeric'
  disabled: boolean
  /** When set, snap a prefilled value once, and snap again on blur. Never while typing. */
  snapStep?: number
  /** Inclusive upper bound in the same units as `value`. */
  max?: number
  onType: (v: string) => void
  onMinus: () => void
  onPlus: () => void
}) {
  const edited = useRef(false)
  const focused = useRef(false)

  useEffect(() => {
    if (!snapStep || edited.current || focused.current || disabled) return
    if (value === '') return
    const n = parseFloat(value)
    if (!Number.isFinite(n)) return
    const next = String(snapToStep(n, snapStep))
    if (next !== value) onType(next)
  }, [value, snapStep, disabled, onType])

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
          // Default step is 1, so the browser rewrites 83.3 to 83 on blur and the
          // snapped 82.5 never shows. `any` lets our weight step own the value.
          step={snapStep ? 'any' : '1'}
          min={0}
          max={max}
          disabled={disabled}
          aria-label={label}
          value={value}
          onFocus={(e) => {
            focused.current = true
            selectOnFocus(e)
          }}
          onBlur={(e) => {
            focused.current = false
            const raw = e.currentTarget.value
            if (raw === '') return
            let n = parseFloat(raw)
            if (!Number.isFinite(n)) return
            if (snapStep && snapStep > 0) n = snapToStep(n, snapStep)
            if (n < 0) n = 0
            if (max != null && Number.isFinite(max)) n = Math.min(n, max)
            const next = String(n)
            if (next !== raw) onType(next)
          }}
          onChange={(e) => {
            edited.current = true
            onType(e.target.value)
          }}
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
  onSave,
  onDelete,
  onRetry,
}: SetStepperRowProps) {
  const reduceMotion = useReducedMotion()
  const [editing, setEditing] = useState(false)
  const weight = parseNum(set.weight)
  const reps = parseInt(set.reps || '0', 10) || 0
  const locked = Boolean(disabled)
  const readOnly = set.completed && !editing
  const n = index + 1

  if (!set.completed && editing) setEditing(false)

  return (
    <motion.div
      data-set-id={set.id}
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
        </span>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {readOnly ? (
            <button
              type="button"
              disabled={locked}
              onClick={() => setEditing(true)}
              className="min-h-11 min-w-11 rounded-xl flex items-center justify-center border border-border bg-surface-2 text-text-secondary hover:text-primary disabled:opacity-40"
              aria-label={`Edit set ${n}`}
            >
              <Pencil size={16} />
            </button>
          ) : set.completed ? (
            <>
              <button
                type="button"
                disabled={locked}
                onClick={() => {
                  onSave?.()
                  setEditing(false)
                }}
                className="min-h-11 px-3 rounded-xl flex items-center justify-center gap-1 border bg-primary text-black border-primary"
              >
                <Check size={16} strokeWidth={3} />
                Save
              </button>
              <button
                type="button"
                disabled={locked}
                onClick={() => {
                  onUncomplete()
                  setEditing(false)
                }}
                className="text-xs text-text-secondary min-h-11 px-2"
                aria-label={`Mark set ${n} not done`}
              >
                Mark not done
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={locked || set.weight === '' || set.reps === ''}
              onMouseDown={(e) => e.preventDefault()}
              onClick={onComplete}
              className="min-h-11 rounded-xl flex items-center justify-center border transition-colors px-3 gap-1 border-primary text-primary disabled:opacity-40"
              aria-label={`Complete set ${n}`}
            >
              <Check size={16} strokeWidth={3} />
              Log
            </button>
          )}
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
          disabled={locked || (set.completed && !editing)}
          snapStep={weightStep}
          max={maxWeightInDisplay(units, weightStep)}
          onType={(v) => onChange({ weight: v })}
          onMinus={() =>
            onChange({ weight: String(snapToStep(Math.max(0, weight - weightStep), weightStep)) })
          }
          onPlus={() => onChange({ weight: String(snapToStep(weight + weightStep, weightStep)) })}
        />
        <Stepper
          label={`Reps, set ${n}`}
          unit="reps"
          value={set.reps}
          inputMode="numeric"
          disabled={locked || (set.completed && !editing)}
          max={MAX_REPS}
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
