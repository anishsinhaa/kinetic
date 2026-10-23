import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Loader2, Moon, Zap } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { useToast } from '../../../components/ui/toastContext'
import { cn } from '../../../lib/utils'
import { pluralize } from '../../../lib/pluralize'
import { selectOnFocus } from '../../../lib/selectOnFocus'
import { useCurrentUser } from '../../auth/useAuth'
import { patchDailyLog, todayDateString } from '../../dailyLog/services/dailyLogService'
import { useSaveFeedback } from '../hooks/useFeedback'
import { MUSCLE_GROUPS, type BodyFeedback, type SorenessEntry } from '../types'

// ---------------------------------------------------------------------------
// Small controls
// ---------------------------------------------------------------------------

function sorenessColor(level: number): string {
  if (level === 1) return 'text-yellow-400 border-yellow-600 bg-yellow-900/30'
  if (level === 2) return 'text-orange-400 border-orange-600 bg-orange-900/30'
  if (level === 3) return 'text-red-400 border-red-600 bg-red-900/30'
  return ''
}

function sorenessLabel(level: number): string {
  if (level === 1) return 'Mild'
  if (level === 2) return 'Moderate'
  if (level === 3) return 'Severe'
  return ''
}

/** 1–10 as two rows of five so every target is ≥44px wide on a phone. */
function ScaleSelector({
  value,
  onChange,
  lowLabel,
  highLabel,
  label,
}: {
  value: number | null
  onChange: (n: number) => void
  lowLabel: string
  highLabel: string
  label: string
}) {
  const selected = value != null && value >= 1 && value <= 10 ? value : null
  return (
    <div role="group" aria-label={label}>
      <div className="grid grid-cols-5 gap-2 mb-2">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={selected === n}
            onClick={() => onChange(n)}
            className={cn(
              'min-h-11 rounded-xl text-sm font-semibold transition-colors focus:outline-hidden',
              selected === n
                ? 'bg-primary text-black'
                : 'bg-surface-2 border border-border text-text-secondary hover:border-primary hover:text-primary',
            )}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="flex justify-between text-[11px] text-text-secondary uppercase tracking-widest">
        <span>1 · {lowLabel}</span>
        <span>10 · {highLabel}</span>
      </div>
    </div>
  )
}

function PainToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className={cn(
        'w-full flex items-center justify-between gap-3 px-4 py-3 min-h-11 rounded-2xl border transition-colors',
        value
          ? 'border-red-600 bg-red-900/20 text-red-400'
          : 'border-border bg-surface-2 text-text-secondary hover:text-text-primary',
      )}
    >
      <div className="flex items-center gap-3 text-left">
        <AlertTriangle size={16} className={value ? 'text-red-400' : 'text-text-muted'} />
        <div>
          <p className="text-sm font-semibold">Pain flag</p>
          <p className="text-[11px] text-text-secondary mt-0.5">
            Active pain or injury that limits training
          </p>
        </div>
      </div>
      <div
        className={cn(
          'w-10 h-5 rounded-full relative shrink-0 transition-colors',
          value ? 'bg-red-500' : 'bg-surface-3 border border-border',
        )}
      >
        <div
          className={cn(
            'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all',
            value ? 'left-5' : 'left-0.5',
          )}
        />
      </div>
    </button>
  )
}

/** Tap cycles: none → mild → moderate → severe → none. */
function SorenessSelector({
  soreness,
  onChange,
}: {
  soreness: Record<string, number>
  onChange: (updated: Record<string, number>) => void
}) {
  const handleClick = (group: string) => {
    const next = (soreness[group] ?? 0) >= 3 ? 0 : (soreness[group] ?? 0) + 1
    const updated = { ...soreness }
    if (next === 0) delete updated[group]
    else updated[group] = next
    onChange(updated)
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {MUSCLE_GROUPS.map((group) => {
        const level = soreness[group] ?? 0
        const active = level > 0
        return (
          <button
            key={group}
            type="button"
            onClick={() => handleClick(group)}
            className={cn(
              'flex items-center justify-between gap-2 px-3 min-h-11 rounded-xl text-sm font-medium transition-colors border',
              active
                ? sorenessColor(level)
                : 'border-border bg-surface-2 text-text-secondary hover:text-text-primary',
            )}
          >
            <span>{group}</span>
            {active ? (
              <span className="text-[11px] font-semibold uppercase tracking-wider">
                {sorenessLabel(level)}
              </span>
            ) : (
              <span className="w-4 h-4 rounded-full border border-border" />
            )}
          </button>
        )
      })}
    </div>
  )
}

function sorenessToMap(entries: SorenessEntry[]): Record<string, number> {
  const map: Record<string, number> = {}
  for (const s of entries) map[s.muscle_group] = s.level
  return map
}

// ---------------------------------------------------------------------------
// Recovery form — shared by Workout → Recovery and the Home "Recovery update" sheet
// ---------------------------------------------------------------------------

type RecoveryFormProps = {
  /** Saved check-in for `date` (null/undefined = nothing logged). */
  existing: BodyFeedback | null | undefined
  /** Today's `daily_logs.sleep` (hours) for `date` — the single source of truth. */
  initialSleepHours: number | null | undefined
  /** Local date "YYYY-MM-DD" being edited; defaults to today. */
  date?: string
  onSaved?: () => void
}

/**
 * Callers must not key this on the feedback id (it changes on the first save and
 * a remount would drop the typed values and the "Saved ✓" state) — key by date.
 */
export function RecoveryForm({ existing, initialSleepHours, date, onSaved }: RecoveryFormProps) {
  const { user } = useCurrentUser()
  const queryClient = useQueryClient()
  const toast = useToast()
  const { mutateAsync: saveFeedback } = useSaveFeedback()

  // Only hydrate from a real saved log — never invent defaults (5/7 etc.)
  const hasSavedLog = Boolean(existing?.id)
  const [fatigue, setFatigue] = useState<number | null>(
    hasSavedLog ? (existing?.fatigue ?? null) : null,
  )
  const [sleepQuality, setSleepQuality] = useState<number | null>(
    hasSavedLog ? (existing?.sleep_quality ?? null) : null,
  )
  const [painFlag, setPainFlag] = useState(hasSavedLog ? (existing?.pain_flag ?? false) : false)
  const [soreness, setSoreness] = useState<Record<string, number>>(() =>
    hasSavedLog ? sorenessToMap(existing?.soreness ?? []) : {},
  )
  const [sleepHours, setSleepHours] = useState(
    initialSleepHours != null ? String(initialSleepHours) : '',
  )
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [savedAt, setSavedAt] = useState<string | null>(existing?.savedAt ?? null)

  const touch = () => setStatus((s) => (s === 'saved' ? 'idle' : s))
  const soreCount = Object.keys(soreness).length

  const handleSubmit = async () => {
    if (fatigue == null || status === 'saving' || !user) return
    setStatus('saving')
    try {
      const hours = sleepHours.trim() === '' ? null : Number.parseFloat(sleepHours)
      const sleepValue = hours != null && Number.isFinite(hours) ? hours : null
      const targetDate = date
      // Sleep hours live on daily_logs.sleep. Patch only that column so the
      // weight / calories / protein / notes of the day are never wiped.
      const sleepChanged = sleepValue !== (initialSleepHours ?? null)
      const logDate = targetDate ?? todayDateString()
      const [result] = await Promise.all([
        saveFeedback({
          fatigue,
          sleepQuality,
          painFlag,
          soreness: Object.entries(soreness).map(([muscle_group, level]) => ({
            muscle_group,
            level,
          })),
          date: targetDate,
          existingId: existing?.id,
        }),
        sleepChanged
          ? patchDailyLog(user.id, logDate, { sleep: sleepValue })
          : Promise.resolve(null),
      ])
      if (sleepChanged) {
        void queryClient.invalidateQueries({ queryKey: ['daily_logs', user.id] })
        void queryClient.invalidateQueries({ queryKey: ['history', 'daily-logs', user.id] })
        void queryClient.invalidateQueries({ queryKey: ['progress'] })
      }
      setSavedAt(result.savedAt)
      setStatus('saved')
      onSaved?.()
    } catch (err) {
      setStatus('idle')
      toast.show((err as Error).message || 'Could not save check-in', { kind: 'error' })
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h3 className="text-sm font-bold text-text-primary uppercase tracking-widest flex items-center gap-2 mb-4">
          <Zap size={15} className="text-primary" />
          Fatigue
        </h3>
        <ScaleSelector
          label="Fatigue"
          value={fatigue}
          onChange={(n) => {
            setFatigue(n)
            touch()
          }}
          lowLabel="Fresh"
          highLabel="Exhausted"
        />
      </Card>

      <Card className="p-4">
        <h3 className="text-sm font-bold text-text-primary uppercase tracking-widest flex items-center gap-2 mb-4">
          <Moon size={15} className="text-primary" />
          Sleep last night
        </h3>
        <label className="block mb-4">
          <span className="text-[11px] text-text-secondary uppercase tracking-widest">
            Hours slept
          </span>
          <input
            type="number"
            inputMode="decimal"
            step="any"
            min={0}
            max={24}
            value={sleepHours}
            onFocus={selectOnFocus}
            onChange={(e) => {
              setSleepHours(e.target.value)
              touch()
            }}
            placeholder="—"
            className="mt-1 w-full bg-surface-2 border border-border rounded-xl px-3 py-2.5 text-center font-semibold text-text-primary focus:outline-hidden focus:border-primary min-h-11"
          />
        </label>
        <p className="text-[11px] text-text-secondary uppercase tracking-widest mb-2">
          Sleep quality (optional)
        </p>
        <ScaleSelector
          label="Sleep quality"
          value={sleepQuality}
          onChange={(n) => {
            setSleepQuality(n)
            touch()
          }}
          lowLabel="Restless"
          highLabel="Deep"
        />
      </Card>

      <PainToggle
        value={painFlag}
        onChange={(v) => {
          setPainFlag(v)
          touch()
        }}
      />

      <Card className="p-4">
        <h3 className="text-sm font-bold text-text-primary uppercase tracking-widest mb-1">
          Muscle soreness
        </h3>
        <p className="text-[11px] text-text-secondary mb-3">
          Tap to cycle mild → moderate → severe → none ·{' '}
          <span className={cn(soreCount > 0 && 'text-orange-400')}>
            Sore: {pluralize(soreCount, 'muscle')}
          </span>
        </p>
        <SorenessSelector
          soreness={soreness}
          onChange={(u) => {
            setSoreness(u)
            touch()
          }}
        />
      </Card>

      <div className="space-y-2">
        <Button
          type="button"
          variant="primary"
          size="lg"
          className="w-full min-h-11"
          onClick={() => void handleSubmit()}
          disabled={status === 'saving' || fatigue == null}
        >
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
          ) : hasSavedLog ? (
            'Update check-in'
          ) : (
            'Save check-in'
          )}
        </Button>
        <p className="text-center text-[11px] text-text-secondary uppercase tracking-widest">
          {fatigue == null
            ? 'Pick a fatigue level to save'
            : savedAt
              ? `Last saved ${new Date(savedAt).toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}`
              : 'Not saved yet'}
        </p>
      </div>
    </div>
  )
}
