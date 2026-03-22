import { useEffect, useState } from 'react'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Zap, Moon, AlertTriangle, Activity, CheckCircle2, Loader2 } from 'lucide-react'
import { cn } from '../lib/utils'
import { useTodayFeedback, useSaveFeedback } from '../features/feedback/hooks/useFeedback'
import {
  MUSCLE_GROUPS,
  SORENESS_LEVELS,
  type SorenessEntry,
} from '../features/feedback/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const today = new Date()
const DAY_STR = today.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase()
const DATE_STR = today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()

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

// ---------------------------------------------------------------------------
// Scale Selector (1–10)
// ---------------------------------------------------------------------------

function ScaleSelector({
  value,
  onChange,
  lowLabel,
  midLabel,
  highLabel,
}: {
  value: number
  onChange: (n: number) => void
  lowLabel: string
  midLabel: string
  highLabel: string
}) {
  return (
    <>
      <div className="flex gap-1.5 justify-between mb-3">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            onClick={() => onChange(n)}
            className={cn(
              'flex-1 h-10 md:h-9 rounded-xl text-sm font-semibold transition-all',
              value === n
                ? 'bg-primary text-black scale-110 shadow-lg shadow-primary/30'
                : 'bg-surface-2 border border-border text-text-secondary hover:border-primary hover:text-primary',
            )}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-text-muted uppercase tracking-widest">
        <span>{lowLabel}</span>
        <span>{midLabel}</span>
        <span>{highLabel}</span>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Pain Toggle
// ---------------------------------------------------------------------------

function PainToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={cn(
        'w-full flex items-center justify-between px-5 py-4 rounded-2xl border transition-all',
        value
          ? 'border-red-600 bg-red-900/20 text-red-400'
          : 'border-border bg-surface-2 text-text-secondary hover:border-text-secondary hover:text-text-primary',
      )}
    >
      <div className="flex items-center gap-3">
        <AlertTriangle size={16} className={value ? 'text-red-400' : 'text-text-muted'} />
        <div className="text-left">
          <p className="text-sm font-semibold">Pain Flag</p>
          <p className="text-[11px] text-text-muted mt-0.5">
            Active pain or injury that limits training
          </p>
        </div>
      </div>
      <div
        className={cn(
          'w-10 h-5 rounded-full relative transition-all duration-200',
          value ? 'bg-red-500' : 'bg-surface-3 border border-border',
        )}
      >
        <div
          className={cn(
            'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all duration-200',
            value ? 'left-5' : 'left-0.5',
          )}
        />
      </div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Muscle Soreness Selector
// Click cycles: none → 1 (mild) → 2 (moderate) → 3 (severe) → none
// ---------------------------------------------------------------------------

function SorenessSelector({
  soreness,
  onChange,
}: {
  soreness: Record<string, number>
  onChange: (updated: Record<string, number>) => void
}) {
  const handleClick = (group: string) => {
    const current = soreness[group] ?? 0
    const next = current >= 3 ? 0 : current + 1
    const updated = { ...soreness }
    if (next === 0) {
      delete updated[group]
    } else {
      updated[group] = next
    }
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
            onClick={() => handleClick(group)}
            className={cn(
              'flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-medium transition-all border',
              active
                ? sorenessColor(level)
                : 'border-border bg-surface-2 text-text-secondary hover:border-text-secondary hover:text-text-primary',
            )}
          >
            <span>{group}</span>
            {active ? (
              <span className="text-[10px] font-semibold uppercase tracking-wider">
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

// ---------------------------------------------------------------------------
// Soreness legend
// ---------------------------------------------------------------------------

function SorenessLegend() {
  return (
    <div className="flex gap-3 mt-3">
      {SORENESS_LEVELS.map((s) => (
        <div key={s.level} className="flex items-center gap-1.5">
          <div className={cn('w-2 h-2 rounded-full', s.color.includes('yellow') ? 'bg-yellow-500' : s.color.includes('orange') ? 'bg-orange-500' : 'bg-red-500')} />
          <span className="text-[10px] text-text-muted uppercase tracking-widest">{s.label}</span>
        </div>
      ))}
      <div className="flex items-center gap-1.5">
        <div className="w-2 h-2 rounded-full border border-border bg-surface-2" />
        <span className="text-[10px] text-text-muted uppercase tracking-widest">Click to cycle</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Feedback Page
// ---------------------------------------------------------------------------

export default function Feedback() {
  const { data: existing, isLoading } = useTodayFeedback()
  const { mutateAsync: save, isPending: isSaving, isSuccess: isSaved, isError, error } = useSaveFeedback()

  const [fatigue, setFatigue] = useState(5)
  const [sleepQuality, setSleepQuality] = useState(7)
  const [painFlag, setPainFlag] = useState(false)
  const [soreness, setSoreness] = useState<Record<string, number>>({})
  const [seeded, setSeeded] = useState(false)

  // Pre-fill from existing today's feedback
  useEffect(() => {
    if (existing && !seeded) {
      setSeeded(true)
      setFatigue(existing.fatigue ?? 5)
      setSleepQuality(existing.sleep_quality ?? 7)
      setPainFlag(existing.pain_flag ?? false)
      const sorenessMap: Record<string, number> = {}
      for (const s of existing.soreness) {
        sorenessMap[s.muscle_group] = s.level
      }
      setSoreness(sorenessMap)
    }
  }, [existing, seeded])

  const buildSorenessList = (): SorenessEntry[] =>
    Object.entries(soreness).map(([muscle_group, level]) => ({ muscle_group, level }))

  const handleSubmit = async () => {
    await save({
      fatigue,
      sleepQuality,
      painFlag,
      soreness: buildSorenessList(),
    })
    setSeeded(false) // allow re-seeding on next fetch
  }

  const soreCount = Object.keys(soreness).length

  return (
    <div className="p-4 md:p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 md:mb-8">
        <div>
          <p className="text-[10px] text-primary uppercase tracking-widest mb-1">
            Recovery Protocol
          </p>
          <h1 className="text-3xl md:text-5xl font-black text-text-primary">Daily Check-in</h1>
        </div>
        <div className="text-right mt-1 md:mt-2 shrink-0 ml-3">
          <p className="text-xs md:text-sm font-semibold text-text-secondary uppercase tracking-widest">
            {DAY_STR}, {DATE_STR}
          </p>
          {existing ? (
            <p className="text-[10px] text-primary uppercase tracking-widest mt-0.5 flex items-center justify-end gap-1">
              <CheckCircle2 size={10} />
              Logged today
            </p>
          ) : (
            <p className="text-[10px] text-text-muted uppercase tracking-widest mt-0.5">
              Not logged yet
            </p>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 gap-2 text-text-secondary text-sm">
          <Loader2 size={16} className="animate-spin" />
          Loading today's recovery data…
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
          {/* Left column */}
          <div className="space-y-5">
            {/* Fatigue */}
            <Card className="p-6">
              <h3 className="text-sm font-bold text-text-primary uppercase tracking-widest flex items-center gap-2 mb-6">
                <Zap size={15} className="text-primary" />
                Fatigue Level
              </h3>
              <ScaleSelector
                value={fatigue}
                onChange={setFatigue}
                lowLabel="Fresh"
                midLabel="Neutral"
                highLabel="Exhausted"
              />
            </Card>

            {/* Sleep quality */}
            <Card className="p-6">
              <h3 className="text-sm font-bold text-text-primary uppercase tracking-widest flex items-center gap-2 mb-6">
                <Moon size={15} className="text-primary" />
                Sleep Quality
              </h3>
              <ScaleSelector
                value={sleepQuality}
                onChange={setSleepQuality}
                lowLabel="Restless"
                midLabel="Standard"
                highLabel="Deep"
              />
            </Card>

            {/* Pain flag */}
            <PainToggle value={painFlag} onChange={setPainFlag} />

            {/* Recovery preview */}
            <Card className="p-4">
              <p className="text-[10px] text-text-secondary uppercase tracking-widest mb-3">
                Recovery Preview
              </p>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-2xl font-black text-text-primary">{fatigue}</p>
                  <p className="text-[9px] text-text-muted uppercase tracking-widest mt-0.5">Fatigue</p>
                </div>
                <div>
                  <p className="text-2xl font-black text-primary">{sleepQuality}</p>
                  <p className="text-[9px] text-text-muted uppercase tracking-widest mt-0.5">Sleep</p>
                </div>
                <div>
                  <p className={cn('text-2xl font-black', soreCount > 0 ? 'text-orange-400' : 'text-text-primary')}>
                    {soreCount}
                  </p>
                  <p className="text-[9px] text-text-muted uppercase tracking-widest mt-0.5">Sore</p>
                </div>
              </div>
            </Card>
          </div>

          {/* Right column */}
          <div className="space-y-5">
            {/* Muscle soreness */}
            <Card className="p-6">
              <h3 className="text-sm font-bold text-text-primary uppercase tracking-widest flex items-center gap-2 mb-1">
                <Activity size={15} className="text-primary" />
                Muscle Soreness
              </h3>
              <SorenessLegend />
              <div className="mt-4">
                <SorenessSelector soreness={soreness} onChange={setSoreness} />
              </div>
            </Card>

            {/* Submit */}
            <div className="space-y-3">
              {isError && error && (
                <div className="flex items-center gap-2 text-red-400 text-sm bg-red-900/20 border border-red-800/50 rounded-xl px-4 py-3">
                  <AlertTriangle size={14} className="shrink-0" />
                  {(error as Error).message}
                </div>
              )}

              <Button
                variant="primary"
                size="lg"
                className="w-full"
                onClick={handleSubmit}
                disabled={isSaving}
              >
                {isSaving ? (
                  <>
                    <Loader2 size={14} className="mr-2 animate-spin" />
                    Saving…
                  </>
                ) : isSaved ? (
                  <>
                    <CheckCircle2 size={14} className="mr-2" />
                    Log Saved!
                  </>
                ) : existing ? (
                  'Update Log'
                ) : (
                  'Submit Log'
                )}
              </Button>

              <p className="text-center text-[10px] text-text-muted uppercase tracking-widest">
                {existing
                  ? `Last saved: ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`
                  : 'Estimated time: ~8s'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
