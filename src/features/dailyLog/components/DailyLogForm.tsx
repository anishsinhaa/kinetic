import { useState } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { useToast } from '../../../components/ui/toastContext'
import { selectOnFocus } from '../../../lib/selectOnFocus'
import type { WeightUnits } from '../../../lib/supabase/database.types'
import {
  type DailyLog,
  type DailyLogFormState,
  type DailyLogPayload,
  displayFormToPayload,
  logToDisplayForm,
} from '../types'

type DailyLogFormProps = {
  /** Existing row for the date being edited (null/undefined = empty form). */
  initialLog: DailyLog | null | undefined
  units: WeightUnits
  /** Persist the payload (weight already converted to kg). */
  onSave: (payload: DailyLogPayload) => Promise<unknown>
  /** Called after a successful save. */
  onSaved?: () => void
}

/**
 * One form state for every field and an explicit Save button.
 *
 * Callers must NOT key this component on the log's id: the id changes
 * (new → optimistic → real UUID) during the first save and a remount would
 * wipe whatever was typed into the other fields.
 */
export function DailyLogForm({ initialLog, units, onSave, onSaved }: DailyLogFormProps) {
  const toast = useToast()
  // Initial value is captured once. A later log/units change must not remount or
  // overwrite what the user has started typing (see LogDaySheet's key).
  const [form, setForm] = useState<DailyLogFormState>(() => logToDisplayForm(initialLog, units))
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')

  const numericFields = [
    { key: 'weight' as const, label: `Weight (${units})`, mode: 'decimal' as const },
    { key: 'calories' as const, label: 'Calories', mode: 'numeric' as const },
    { key: 'protein' as const, label: 'Protein (g)', mode: 'numeric' as const },
    { key: 'sleep' as const, label: 'Sleep last night (hrs)', mode: 'decimal' as const },
  ]

  const setField = (key: keyof DailyLogFormState, value: string) => {
    setForm((p) => ({ ...p, [key]: value }))
    setStatus((s) => (s === 'saved' ? 'idle' : s))
  }

  const save = async () => {
    if (status === 'saving') return
    setStatus('saving')
    try {
      await onSave(displayFormToPayload(form, units))
      setStatus('saved')
      onSaved?.()
    } catch (err) {
      setStatus('idle')
      toast.show((err as Error).message || 'Could not save log', { kind: 'error' })
    }
  }

  return (
    <form
      className="p-4 space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        {numericFields.map(({ key, label, mode }) => (
          <label key={key} className="block">
            <span className="text-[11px] text-text-secondary uppercase tracking-widest">{label}</span>
            <input
              type="number"
              inputMode={mode}
              step="any"
              min={0}
              value={form[key]}
              onFocus={selectOnFocus}
              onChange={(e) => setField(key, e.target.value)}
              className="mt-1 w-full bg-surface-2 border border-border rounded-xl px-3 py-2.5 text-center font-semibold text-text-primary focus:outline-hidden focus:border-primary min-h-11"
              placeholder="—"
            />
          </label>
        ))}
      </div>

      <label className="block">
        <span className="text-[11px] text-text-secondary uppercase tracking-widest">Note</span>
        <textarea
          value={form.notes}
          onChange={(e) => setField('notes', e.target.value)}
          rows={2}
          placeholder="Journal note…"
          className="mt-1 w-full bg-surface-2 border border-border rounded-xl px-3 py-2.5 text-sm text-text-primary focus:outline-hidden focus:border-primary resize-none"
        />
      </label>

      <Button type="submit" variant="primary" size="lg" className="w-full min-h-11" disabled={status === 'saving'}>
        {status === 'saving' ? (
          <>
            <Loader2 size={14} className="mr-2 animate-spin" />
            Saving…
          </>
        ) : status === 'saved' ? (
          <>
            <CheckCircle2 size={14} className="mr-2" />
            Saved ✓
          </>
        ) : (
          'Save'
        )}
      </Button>
    </form>
  )
}
