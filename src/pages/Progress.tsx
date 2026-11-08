import { useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import { TrendingUp, Loader2, ChevronDown, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { Accordion } from '../components/ui/Accordion'
import { CATEGORY_LABELS } from '../features/exercises/lib/muscles'
import { useCurrentUser } from '../features/auth/useAuth'
import { useProgressData } from '../features/progress/hooks/useProgress'
import {
  allTimeSummary,
  chartTickFormatter,
  dailyMetricSeries,
  isoWeek,
  longestWeeklyStreak,
  niceTicks,
  weekSummary,
  workoutsPerWeekSeries,
} from '../features/progress/lib/progressAggregators'
import { useWeeklyGoal } from '../features/workout/hooks/useWeeklyGoal'
import { addDays } from '../features/workout/lib/weeklyConsistency'
import { startOfLocalWeekMonday } from '../features/workout/services/workoutService'
import { useWeightDisplay } from '../features/settings/hooks/useWeightUnits'
import { BottomSheet } from '../components/ui/BottomSheet'
import { todayDateString } from '../features/dailyLog/services/dailyLogService'
import {
  formatVolume,
  formatWeight,
  kgToDisplay,
  roundBodyWeight,
  roundWeightForDisplay,
} from '../features/settings/lib/units'
import { pluralize } from '../lib/pluralize'
import { cn } from '../lib/utils'

// ── Page-level fade-in ────────────────────────────────────────────────────────
const pageVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.25, 0.1, 0.25, 1] as const } },
} as const

const RANGES = [7, 30, 90] as const
type Range = (typeof RANGES)[number]

function fmtShortDate(iso: string): string {
  try {
    return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
    })
  } catch {
    return iso
  }
}

function formatWeekRangeTitle(start: string, end: string): string {
  try {
    const s = new Date(`${start}T00:00:00`)
    const e = new Date(`${end}T00:00:00`)
    const startMonth = s.toLocaleDateString('en-GB', { month: 'short' })
    const endMonth = e.toLocaleDateString('en-GB', { month: 'short' })
    if (startMonth === endMonth) return `${startMonth} ${s.getDate()} – ${e.getDate()}`
    return `${startMonth} ${s.getDate()} – ${endMonth} ${e.getDate()}`
  } catch {
    return `${start} – ${end}`
  }
}

type VolumeRange = '12w' | '6m' | 'all'

function VolumeRangeSelector({
  value,
  onChange,
}: {
  value: VolumeRange
  onChange: (r: VolumeRange) => void
}) {
  const options: Array<{ id: VolumeRange; label: string }> = [
    { id: '12w', label: '12w' },
    { id: '6m', label: '6m' },
    { id: 'all', label: 'All' },
  ]
  return (
    <div role="group" aria-label="Volume range" className="flex gap-1 bg-surface-2 border border-border rounded-xl p-1">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          aria-pressed={value === opt.id}
          className={cn(
            'min-h-9 px-3 rounded-lg text-xs font-semibold',
            value === opt.id ? 'bg-primary text-black' : 'text-text-secondary hover:text-text-primary',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function EmptyState({ msg }: { msg: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-6 text-center text-sm text-text-muted">
      {msg}
    </div>
  )
}

function ChartCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      {children}
    </div>
  )
}

// ── Custom tooltip ────────────────────────────────────────────────────────────
type TooltipPayloadItem = {
  name?: string
  value?: number | string
  color?: string
}

function KineticTooltip({
  active,
  payload,
  label,
  valueFormatter,
}: {
  active?: boolean
  payload?: TooltipPayloadItem[]
  label?: string
  valueFormatter?: (v: number) => string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-surface border border-border rounded-lg px-3 py-2 text-xs shadow-lg">
      <p className="text-text-muted mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="font-semibold">
          {p.name}: {typeof p.value === 'number' ? (valueFormatter ? valueFormatter(p.value) : p.value) : p.value}
        </p>
      ))}
    </div>
  )
}

// ── Daily-metric chart (rounded Y-axis ticks) ─────────────────────────────────
function MetricChart({
  title,
  data,
  color,
  gradientId,
  unit,
  decimals = 0,
  emptyMsg,
  animate,
}: {
  title: string
  data: Array<{ date: string; value: number }>
  color: string
  gradientId: string
  unit: string
  decimals?: number
  emptyMsg: string
  animate: boolean
}) {
  const { domain, ticks } = useMemo(() => niceTicks(data.map((d) => d.value)), [data])
  const formatTick = useMemo(() => chartTickFormatter(ticks), [ticks])
  if (data.length === 0) return <EmptyState msg={emptyMsg} />
  return (
    <ChartCard>
      <p className="text-xs text-text-muted mb-3 font-semibold uppercase tracking-wide">
        {title}
      </p>
      <ResponsiveContainer width="100%" height={160}>
        <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.25} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: '#64748b' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={fmtShortDate}
            minTickGap={24}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#64748b' }}
            tickLine={false}
            axisLine={false}
            width={48}
            domain={domain}
            ticks={ticks}
            interval={0}
            tickFormatter={formatTick}
          />
          <Tooltip
            content={
              <KineticTooltip
                valueFormatter={(v) =>
                  `${v.toLocaleString(undefined, { maximumFractionDigits: decimals })} ${unit}`
                }
              />
            }
          />
          <Area
            type="monotone"
            dataKey="value"
            name={title}
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            dot={data.length < 15 ? { r: 3, fill: color } : false}
            isAnimationActive={animate}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}

// ── Exercise picker: searchable sheet instead of a native <select> ────────────
type PickerExercise = { exerciseId: string; exerciseName: string; muscleGroup: string }

function ExercisePicker({
  exercises,
  selectedId,
  onSelect,
}: {
  exercises: PickerExercise[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const selected = exercises.find((e) => e.exerciseId === selectedId)
  const q = query.trim().toLowerCase()
  const filtered = q
    ? exercises.filter(
        (e) =>
          e.exerciseName.toLowerCase().includes(q) || e.muscleGroup.toLowerCase().includes(q),
      )
    : exercises

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Select exercise"
        className="w-full flex items-center justify-between gap-3 bg-surface-2 border border-border text-text-primary text-sm rounded-xl px-4 min-h-12 font-medium hover:border-primary text-left"
      >
        <span className="truncate">
          {selected ? selected.exerciseName : 'Choose an exercise…'}
          {selected && (
            <span className="text-text-secondary font-normal"> · {selected.muscleGroup}</span>
          )}
        </span>
        <ChevronDown size={16} className="shrink-0 text-text-muted" />
      </button>

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Exercise"
        className="h-[min(80dvh,640px)]"
      >
        <div className="sticky top-0 z-10 bg-surface p-4 pb-3 border-b border-border">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search exercises…"
              aria-label="Search exercises"
              className="w-full bg-surface-2 border border-border rounded-xl pl-10 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-hidden focus:border-primary min-h-11"
            />
          </div>
        </div>
        <div className="p-4 space-y-2">
          {filtered.map((ex) => (
            <button
              key={ex.exerciseId}
              type="button"
              onClick={() => {
                onSelect(ex.exerciseId)
                setOpen(false)
                setQuery('')
              }}
              className={cn(
                'w-full text-left px-4 rounded-xl border min-h-12 py-2',
                ex.exerciseId === selectedId
                  ? 'border-primary bg-primary/10'
                  : 'border-border bg-surface-2 hover:border-primary',
              )}
            >
              <p className="text-sm font-semibold text-text-primary truncate">{ex.exerciseName}</p>
              <p className="text-[11px] uppercase tracking-widest text-text-secondary">
                {ex.muscleGroup}
              </p>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-text-muted text-center py-8">No exercises match.</p>
          )}
        </div>
      </BottomSheet>
    </>
  )
}

function RangeSelector({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  return (
    <div role="group" aria-label="Date range" className="flex gap-1 bg-surface-2 border border-border rounded-xl p-1">
      {RANGES.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onChange(r)}
          aria-pressed={value === r}
          className={cn(
            'min-h-9 px-3 rounded-lg text-xs font-semibold',
            value === r ? 'bg-primary text-black' : 'text-text-secondary hover:text-text-primary',
          )}
        >
          {r}d
        </button>
      ))}
    </div>
  )
}

function countDelta(current: number, previous: number): string {
  const diff = current - previous
  if (diff === 0) return 'same'
  return diff > 0 ? `+${diff}` : `\u2212${Math.abs(diff)}`
}

function volumeDelta(currentKg: number, previousKg: number, units: 'kg' | 'lb'): string {
  const diff = currentKg - previousKg
  if (diff === 0) return 'same'
  const display = kgToDisplay(Math.abs(diff), units)
  const rounded = display >= 1000 ? Number((display / 1000).toFixed(1)) : Math.round(display)
  if (rounded === 0) return 'same'
  const body =
    display >= 1000 ? `${(display / 1000).toFixed(1)}k ${units}` : `${Math.round(display)} ${units}`
  return `${diff > 0 ? '+' : '\u2212'}${body}`
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Progress() {
  const [pickedId, setPickedId] = useState<string | null>(null)
  const [range, setRange] = useState<Range>(30)
  const [volumeRange, setVolumeRange] = useState<VolumeRange>('12w')
  const [weekOffset, setWeekOffset] = useState(0)
  const [showAllSessions, setShowAllSessions] = useState(false)
  const reduceMotion = useReducedMotion()
  const { units, step } = useWeightDisplay()
  const { user } = useCurrentUser()
  const userId = user?.id ?? ''
  const { goal } = useWeeklyGoal(userId)

  const {
    histories,
    isLoading,
    dailyLogs,
    weeklyVolume,
    prList,
    selectedExerciseId,
    selectedHistory,
    exerciseSeries,
  } = useProgressData(pickedId)

  const today = todayDateString()

  const thisWeekStart = startOfLocalWeekMonday()

  // Convert kg series → display units for charts/labels (calendar-week window, not last N data points)
  const recentWeekly = useMemo(() => {
    const weeksBack = volumeRange === '12w' ? 11 : volumeRange === '6m' ? 25 : null
    const cutoff =
      weeksBack == null ? null : isoWeek(addDays(thisWeekStart, -7 * weeksBack))
    const sliced =
      cutoff == null ? weeklyVolume : weeklyVolume.filter((p) => p.week >= cutoff)
    return sliced.map((p) => ({
      ...p,
      volume: units === 'kg' ? p.volume : kgToDisplay(p.volume, units),
    }))
  }, [weeklyVolume, units, volumeRange, thisWeekStart])
  const weightData = useMemo(
    () =>
      dailyMetricSeries(dailyLogs, 'weight', range, today).map((p) => ({
        date: p.date,
        value: roundBodyWeight(p.value, units),
      })),
    [dailyLogs, range, today, units],
  )
  const caloriesData = useMemo(
    () => dailyMetricSeries(dailyLogs, 'calories', range, today),
    [dailyLogs, range, today],
  )
  const proteinData = useMemo(
    () => dailyMetricSeries(dailyLogs, 'protein', range, today),
    [dailyLogs, range, today],
  )
  const sleepData = useMemo(
    () => dailyMetricSeries(dailyLogs, 'sleep', range, today),
    [dailyLogs, range, today],
  )
  const recentSeries = useMemo(
    () =>
      exerciseSeries.slice(-30).map((p) => ({
        ...p,
        bestWeight:
          p.bestWeight != null ? roundWeightForDisplay(p.bestWeight, units, step) : p.bestWeight,
        volume: units === 'kg' ? p.volume : kgToDisplay(p.volume, units),
      })),
    [exerciseSeries, units, step],
  )
  const weightTicks = useMemo(
    () => niceTicks(recentSeries.map((p) => p.bestWeight).filter((v): v is number => v != null)),
    [recentSeries],
  )
  const sessionVolumeTicks = useMemo(
    () => niceTicks(recentSeries.map((p) => p.volume), 4, { fromZero: true }),
    [recentSeries],
  )
  const weeklyTicks = useMemo(
    () => niceTicks(recentWeekly.map((p) => p.volume), 4, { fromZero: true }),
    [recentWeekly],
  )
  const weightTickFormat = useMemo(
    () => chartTickFormatter(weightTicks.ticks),
    [weightTicks.ticks],
  )
  const sessionVolumeTickFormat = useMemo(
    () => chartTickFormatter(sessionVolumeTicks.ticks),
    [sessionVolumeTicks.ticks],
  )
  const weeklyTickFormat = useMemo(
    () => chartTickFormatter(weeklyTicks.ticks),
    [weeklyTicks.ticks],
  )

  const selectedWeekStart = useMemo(
    () => addDays(thisWeekStart, 7 * weekOffset),
    [thisWeekStart, weekOffset],
  )
  const selectedWeekEnd = weekOffset === 0 ? today : addDays(selectedWeekStart, 6)
  const comparisonStart = addDays(selectedWeekStart, -7)
  const comparisonEnd = addDays(selectedWeekStart, -1)
  const selectedWeek = useMemo(
    () => weekSummary(histories, selectedWeekStart, selectedWeekEnd),
    [histories, selectedWeekStart, selectedWeekEnd],
  )
  const comparisonWeek = useMemo(
    () => weekSummary(histories, comparisonStart, comparisonEnd),
    [histories, comparisonStart, comparisonEnd],
  )
  const weekCardTitle =
    weekOffset === 0
      ? 'This week'
      : weekOffset === -1
        ? 'Last week'
        : formatWeekRangeTitle(selectedWeekStart, selectedWeekEnd)
  const muscleMax = Math.max(1, ...selectedWeek.setsByCategory.map((row) => row.sets))

  const lifetime = useMemo(() => allTimeSummary(histories), [histories])
  const trainingDates = useMemo(() => {
    const dates = new Set<string>()
    for (const ex of histories) {
      for (const session of ex.sessions) dates.add(session.date)
    }
    return Array.from(dates)
  }, [histories])
  const longestStreak = useMemo(
    () => longestWeeklyStreak(trainingDates, goal),
    [trainingDates, goal],
  )
  const workoutsPerWeek = useMemo(
    () => workoutsPerWeekSeries(histories, 12, today),
    [histories, today],
  )
  const workoutsTicks = useMemo(
    () => niceTicks(workoutsPerWeek.map((p) => p.workouts), 4, { fromZero: true }),
    [workoutsPerWeek],
  )
  const workoutsTickFormat = useMemo(
    () => chartTickFormatter(workoutsTicks.ticks),
    [workoutsTicks.ticks],
  )

  const sessions = selectedHistory?.sessions ?? []
  const visibleSessions = showAllSessions ? sessions : sessions.slice(0, 8)

  const motionProps = reduceMotion
    ? {}
    : { variants: pageVariants, initial: 'hidden', animate: 'visible' }

  return (
    <motion.div className="p-4 md:p-8 max-w-5xl mx-auto" {...motionProps}>
      <div className="mb-6 md:mb-8">
        <p className="text-[11px] text-primary uppercase tracking-widest mb-1">Analytics</p>
        <h1 className="text-3xl md:text-5xl font-black uppercase text-text-primary flex items-center gap-3">
          <TrendingUp size={32} className="text-primary shrink-0" />
          Progress
        </h1>
      </div>

      {isLoading && (
        <div className="flex items-center gap-3 text-text-secondary py-16">
          <Loader2 size={20} className="animate-spin text-primary" />
          <span className="text-sm uppercase tracking-widest">Loading…</span>
        </div>
      )}

      {!isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-xl border border-border bg-surface p-4 md:col-span-2">
            <div className="flex items-center gap-2 mb-3">
              <button
                type="button"
                aria-label="Previous week"
                disabled={weekOffset <= -104}
                onClick={() => setWeekOffset((n) => Math.max(-104, n - 1))}
                className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl text-text-secondary disabled:opacity-40"
              >
                <ChevronLeft size={20} />
              </button>
              <h2 className="flex-1 text-center text-[11px] text-text-secondary uppercase tracking-widest font-semibold flex items-center justify-center gap-2">
                <span className="w-1 h-3.5 bg-primary rounded-full inline-block" />
                {weekCardTitle}
              </h2>
              <button
                type="button"
                aria-label="Next week"
                disabled={weekOffset >= 0}
                onClick={() => setWeekOffset((n) => Math.min(0, n + 1))}
                className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl text-text-secondary disabled:opacity-40"
              >
                <ChevronRight size={20} />
              </button>
            </div>
            {selectedWeek.workouts === 0 ? (
              <p className="text-sm text-text-muted">
                {weekOffset === 0 ? 'No workouts logged this week yet.' : 'No workouts that week.'}
              </p>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-[11px] text-text-secondary uppercase tracking-widest">Workouts</p>
                    <p className="text-2xl font-black text-text-primary tabular-nums">{selectedWeek.workouts}</p>
                    <p className="text-xs text-text-secondary">{countDelta(selectedWeek.workouts, comparisonWeek.workouts)} vs last week</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-text-secondary uppercase tracking-widest">Sets</p>
                    <p className="text-2xl font-black text-text-primary tabular-nums">{selectedWeek.sets}</p>
                    <p className="text-xs text-text-secondary">{countDelta(selectedWeek.sets, comparisonWeek.sets)} vs last week</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-text-secondary uppercase tracking-widest">Volume</p>
                    <p className="text-2xl font-black text-text-primary tabular-nums">{formatVolume(selectedWeek.volumeKg, units)}</p>
                    <p className="text-xs text-text-secondary">{volumeDelta(selectedWeek.volumeKg, comparisonWeek.volumeKg, units)} vs last week</p>
                  </div>
                </div>
                {selectedWeek.setsByCategory.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <p className="text-[11px] text-text-secondary uppercase tracking-widest">Sets per muscle</p>
                    {selectedWeek.setsByCategory.map((row) => (
                      <div key={row.category}>
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="text-text-primary">{CATEGORY_LABELS[row.category]}</span>
                          <span className="text-text-secondary tabular-nums">{pluralize(row.sets, 'set')}</span>
                        </div>
                        <div className="mt-1 h-1 rounded-full bg-surface-3">
                          <div
                            className="h-1 rounded-full bg-primary"
                            style={{ width: `${(row.sets / muscleMax) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {lifetime.workouts > 0 && (
            <div className="rounded-xl border border-border bg-surface p-4 md:col-span-2">
              <h2 className="text-[11px] text-text-secondary uppercase tracking-widest font-semibold flex items-center gap-2 mb-3">
                <span className="w-1 h-3.5 bg-primary rounded-full inline-block" />
                All time
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <p className="text-[11px] text-text-secondary uppercase tracking-widest">Workouts</p>
                  <p className="text-2xl font-black text-text-primary tabular-nums">{lifetime.workouts}</p>
                </div>
                <div>
                  <p className="text-[11px] text-text-secondary uppercase tracking-widest">Sets</p>
                  <p className="text-2xl font-black text-text-primary tabular-nums">{lifetime.sets}</p>
                </div>
                <div>
                  <p className="text-[11px] text-text-secondary uppercase tracking-widest">Volume</p>
                  <p className="text-2xl font-black text-text-primary tabular-nums">{formatVolume(lifetime.volumeKg, units)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-text-secondary uppercase tracking-widest">Longest weekly streak</p>
                  <p className="text-2xl font-black text-text-primary tabular-nums">{longestStreak} wk</p>
                </div>
              </div>
              {lifetime.firstDate && (
                <p className="mt-3 text-xs text-text-muted">Since {fmtShortDate(lifetime.firstDate)}</p>
              )}
            </div>
          )}

            {/* Workouts per week */}
            <Accordion title="Workouts per week" defaultOpen>
              {workoutsPerWeek.every((p) => p.workouts === 0) ? (
                <EmptyState msg="Complete workouts to see weekly consistency." />
              ) : (
                <ChartCard>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={workoutsPerWeek} margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        tickLine={false}
                        axisLine={false}
                        width={32}
                        domain={workoutsTicks.domain}
                        ticks={workoutsTicks.ticks}
                        interval={0}
                        tickFormatter={workoutsTickFormat}
                      />
                      <Tooltip content={<KineticTooltip />} />
                      <ReferenceLine
                        y={goal}
                        strokeDasharray="4 4"
                        stroke="#64748b"
                        label={{ value: `Goal ${goal}`, position: 'insideTopRight', fontSize: 10, fill: '#64748b' }}
                      />
                      <Bar
                        dataKey="workouts"
                        name="Workouts"
                        radius={[3, 3, 0, 0]}
                        isAnimationActive={!reduceMotion}
                      >
                        {workoutsPerWeek.map((entry) => (
                          <Cell
                            key={entry.weekStart}
                            fill={entry.workouts >= goal ? '#CCFF00' : '#64748b'}
                            fillOpacity={entry.workouts >= goal ? 0.9 : 0.7}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}
            </Accordion>

            {/* Weekly volume */}
            <Accordion
              title="Weekly volume"
              defaultOpen
              action={<VolumeRangeSelector value={volumeRange} onChange={setVolumeRange} />}
            >
              {recentWeekly.length === 0 ? (
                <EmptyState msg="Complete workouts to see weekly volume." />
              ) : (
                <ChartCard>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={recentWeekly} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        tickLine={false}
                        axisLine={false}
                        interval={volumeRange === 'all' ? 'preserveStartEnd' : 0}
                        minTickGap={volumeRange === 'all' ? 28 : undefined}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        tickLine={false}
                        axisLine={false}
                        width={48}
                        domain={weeklyTicks.domain}
                        ticks={weeklyTicks.ticks}
                        interval={0}
                        tickFormatter={weeklyTickFormat}
                      />
                      <Tooltip content={<KineticTooltip valueFormatter={(v) => `${Math.round(v)} ${units}`} />} />
                      <Bar
                        dataKey="volume"
                        name="Volume"
                        fill="#a78bfa"
                        opacity={0.8}
                        radius={[3, 3, 0, 0]}
                        isAnimationActive={!reduceMotion}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}
            </Accordion>
            {/* Body & nutrition — one shared range */}
            <Accordion
              title="Body & nutrition"
              defaultOpen
              action={<RangeSelector value={range} onChange={setRange} />}
            >
              <div className="space-y-4">
                <MetricChart
                  title={`Body weight (${units})`}
                  data={weightData}
                  color="#34d399"
                  gradientId="bwGrad"
                  unit={units}
                  decimals={1}
                  emptyMsg={`No weight logged in the last ${range} days.`}
                  animate={!reduceMotion}
                />
                <MetricChart
                  title="Calories (kcal)"
                  data={caloriesData}
                  color="#fb923c"
                  gradientId="calGrad"
                  unit="kcal"
                  emptyMsg={`No calories logged in the last ${range} days.`}
                  animate={!reduceMotion}
                />
                <MetricChart
                  title="Protein (g)"
                  data={proteinData}
                  color="#22d3ee"
                  gradientId="proGrad"
                  unit="g"
                  emptyMsg={`No protein logged in the last ${range} days.`}
                  animate={!reduceMotion}
                />
                <MetricChart
                  title="Sleep (hours)"
                  data={sleepData}
                  color="#a78bfa"
                  gradientId="slpGrad"
                  unit="h"
                  decimals={1}
                  emptyMsg={`No sleep logged in the last ${range} days.`}
                  animate={!reduceMotion}
                />
              </div>
            </Accordion>

            {/* PR list */}
            <Accordion title="All-time PRs">
              {prList.length === 0 ? (
                <EmptyState msg="Complete exercises to see your personal records here." />
              ) : (
                <div className="rounded-xl border border-border bg-surface overflow-hidden">
                  {prList.slice(0, 20).map((pr, i) => (
                    <div
                      key={pr.exerciseId}
                      className={cn(
                        'flex items-center justify-between px-4 py-3 gap-3',
                        i > 0 && 'border-t border-border',
                      )}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-text-primary truncate">{pr.exerciseName}</p>
                        {pr.achievedDate && (
                          <p className="text-xs text-text-muted mt-0.5">{fmtShortDate(pr.achievedDate)}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-primary tabular-nums">
                          {formatWeight(pr.weight, units, { step })} × {pr.reps}
                        </p>
                      </div>
                    </div>
                  ))}
                  {prList.length > 20 && (
                    <p className="text-xs text-text-muted px-4 py-2 border-t border-border">
                      + {prList.length - 20} more
                    </p>
                  )}
                </div>
              )}
            </Accordion>
            {/* Per-exercise charts + session list */}
            <Accordion title="Exercise progress">
              {histories.length === 0 ? (
                <EmptyState msg="Log some workouts to see per-exercise progress." />
              ) : (
                <div className="space-y-4">
                  <ExercisePicker
                    exercises={histories}
                    selectedId={selectedExerciseId}
                    onSelect={(id) => {
                      setPickedId(id)
                      setShowAllSessions(false)
                    }}
                  />
                  {selectedHistory && recentSeries.length === 0 && (
                    <EmptyState msg="No completed sets recorded for this exercise yet." />
                  )}
                  {recentSeries.length > 0 && (
                    <>
                      <ChartCard>
                        <p className="text-xs text-text-muted mb-3 font-semibold uppercase tracking-wide">
                          Best set — weight ({units})
                        </p>
                        <ResponsiveContainer width="100%" height={160}>
                          <AreaChart data={recentSeries} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                            <defs>
                              <linearGradient id="wGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.25} />
                                <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                            <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} tickFormatter={fmtShortDate} minTickGap={24} />
                            <YAxis
                              tick={{ fontSize: 11, fill: '#64748b' }}
                              tickLine={false}
                              axisLine={false}
                              width={48}
                              domain={weightTicks.domain}
                              ticks={weightTicks.ticks}
                              interval={0}
                              tickFormatter={weightTickFormat}
                            />
                            <Tooltip content={<KineticTooltip valueFormatter={(v) => `${v} ${units}`} />} />
                            <Area
                              type="monotone"
                              dataKey="bestWeight"
                              name="Weight"
                              stroke="#22d3ee"
                              strokeWidth={2}
                              fill="url(#wGrad)"
                              dot={recentSeries.length < 15 ? { r: 3, fill: '#22d3ee' } : false}
                              isAnimationActive={!reduceMotion}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </ChartCard>
                      <ChartCard>
                        <p className="text-xs text-text-muted mb-3 font-semibold uppercase tracking-wide">
                          Session volume ({units})
                        </p>
                        <ResponsiveContainer width="100%" height={140}>
                          <BarChart data={recentSeries} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                            <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} tickFormatter={fmtShortDate} minTickGap={24} />
                            <YAxis
                              tick={{ fontSize: 11, fill: '#64748b' }}
                              tickLine={false}
                              axisLine={false}
                              width={48}
                              domain={sessionVolumeTicks.domain}
                              ticks={sessionVolumeTicks.ticks}
                              interval={0}
                              tickFormatter={sessionVolumeTickFormat}
                            />
                            <Tooltip content={<KineticTooltip valueFormatter={(v) => `${Math.round(v)} ${units}`} />} />
                            <Bar
                              dataKey="volume"
                              name="Volume"
                              fill="#22d3ee"
                              opacity={0.7}
                              radius={[3, 3, 0, 0]}
                              isAnimationActive={!reduceMotion}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </ChartCard>
                    </>
                  )}

                  {/* Every session of this exercise (read-only — delete a workout from History) */}
                  {sessions.length > 0 && (
                    <div className="rounded-xl border border-border bg-surface overflow-hidden">
                      <p className="px-4 py-3 text-[11px] text-text-secondary uppercase tracking-widest border-b border-border">
                        Sessions ({sessions.length})
                      </p>
                      {visibleSessions.map((session, i) => (
                        <div
                          key={session.workoutId}
                          className={cn('px-4 py-3', i > 0 && 'border-t border-border')}
                        >
                          <div className="flex items-baseline justify-between gap-3">
                            <p className="text-sm font-semibold text-text-primary">
                              {fmtShortDate(session.date)}
                            </p>
                            {session.feel != null && (
                              <span className="text-[11px] text-primary font-medium">
                                Feel {session.feel}/5
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-text-secondary mt-1 tabular-nums">
                            {session.sets
                              .map((s) => `${formatWeight(s.weight, units, { step })} × ${s.reps ?? '—'}`)
                              .join(' · ')}
                          </p>
                        </div>
                      ))}
                      {sessions.length > 8 && (
                        <button
                          type="button"
                          onClick={() => setShowAllSessions((v) => !v)}
                          className="w-full min-h-11 text-sm text-primary border-t border-border hover:bg-surface-2"
                        >
                          {showAllSessions ? 'Show fewer' : `Show all ${sessions.length}`}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </Accordion>

        </div>
      )}
    </motion.div>
  )
}
