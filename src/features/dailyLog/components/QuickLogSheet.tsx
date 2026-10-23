import { useState } from 'react'
import { BottomSheet } from '../../../components/ui/BottomSheet'
import { Button } from '../../../components/ui/Button'
import { selectOnFocus } from '../../../lib/selectOnFocus'

type QuickLogSheetProps = {
  open: boolean
  onClose: () => void
  title: string
  unit: string
  mode: 'set' | 'add'
  initialValue?: string
  allowSetTotal?: boolean
  onSubmit: (value: number, setTotal: boolean) => Promise<unknown>
}

export function QuickLogSheet({
  open,
  onClose,
  title,
  unit,
  mode,
  initialValue,
  allowSetTotal = false,
  onSubmit,
}: QuickLogSheetProps) {
  const [value, setValue] = useState(initialValue ?? '')
  const [setTotal, setSetTotal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [wasOpen, setWasOpen] = useState(open)

  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setValue(initialValue ?? '')
      setSetTotal(false)
      setSaving(false)
      setError(null)
    }
  }

  const submit = async () => {
    if (saving) return
    const trimmed = value.trim()
    const entered = Number(trimmed)
    if (trimmed === '' || !Number.isFinite(entered) || entered < 0) return
    setSaving(true)
    setError(null)
    try {
      await onSubmit(entered, allowSetTotal && setTotal)
      onClose()
    } catch (err) {
      setError((err as Error).message || 'Could not save')
      setSaving(false)
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <form
        className="p-4 space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <label className="block">
          <span className="text-[11px] text-text-secondary uppercase tracking-widest">{unit}</span>
          <input
            type="number"
            inputMode="decimal"
            step="any"
            min={0}
            autoFocus
            value={value}
            onFocus={selectOnFocus}
            onChange={(e) => setValue(e.target.value)}
            className="mt-1 w-full bg-surface-2 border border-border rounded-xl px-3 py-4 text-center text-3xl font-black text-text-primary focus:outline-hidden focus:border-primary min-h-16"
          />
        </label>

        {allowSetTotal && (
          <label className="flex items-center gap-2 text-sm text-text-secondary min-h-11">
            <input
              type="checkbox"
              checked={setTotal}
              onChange={(e) => setSetTotal(e.target.checked)}
              className="size-4 accent-primary"
            />
            Set total instead
          </label>
        )}

        {error && <p className="text-xs text-red-400">{error}</p>}

        <Button type="submit" variant="primary" size="lg" className="w-full min-h-11" disabled={saving}>
          {saving ? 'Saving…' : mode === 'add' ? 'Add' : 'Save'}
        </Button>
      </form>
    </BottomSheet>
  )
}
