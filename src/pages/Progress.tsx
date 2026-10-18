import { useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { TrendingUp, Dumbbell, Loader2, ChevronDown, Flame } from 'lucide-react'
import { useProgressData } from '../features/progress/hooks/useProgress'
import { useWeightUnits } from '../features/settings/hooks/useWeightUnits'
import {
  formatWeight,
  kgToDisplay,
  roundDisplayWeight,
} from '../features/settings/lib/units'
import { cn } from '../lib/utils'

// ── Page-level fade-in ────────────────────────────────────────────────────────
const pageVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.25, 0.1, 0.25, 1] as const } },
} as const

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon?: React.ElementType
  children: React.ReactNode
}) {
  return (
    <section className="mb-8">
      <h2 className="text-[10px] text-text-secondary uppercase tracking-widest font-semibold mb-3 flex items-center gap-2">
        <span className="w-1 h-3.5 bg-primary rounded-full inline-block" />
        {Icon && <Icon size={11} className="text-primary" />}
        {title}
      </h2>
      {children}
    </section>
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

// ── Exercise picker ───────────────────────────────────────────────────────────
function ExercisePicker({
  exercises,
  selectedId,
  onSelect,
}: {
  exercises: Array<{ exerciseId: string; exerciseName: string; muscleGroup: string }>
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const selected = exercises.find((e) => e.exerciseId === selectedId)
  return (
    <div className="relative">
      <select
        value={selectedId ?? ''}
        onChange={(e) => onSelect(e.target.value)}
        className="w-full appearance-none bg-surface-2 border border-border text-text-primary text-sm rounded-xl pl-4 pr-9 py-3 font-medium focus:outline-none focus:border-primary cursor-pointer min-h-11"
        aria-label="Select exercise"
      >
        <option value="" disabled>
          Pick an exercise…
        </option>
        {exercises.map((ex) => (
          <option key={ex.exerciseId} value={ex.exerciseId}>
            {ex.exerciseName} ({ex.muscleGroup})
          </option>
        ))}
      </select>
      <ChevronDown
        size={16}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-muted"
      />
      {selected && (
        <p className="mt-1.5 text-xs text-text-muted px-1">
          Showing{' '}
          <span className="text-text-primary font-semibold">{selected.exerciseName}</span>
        </p>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Progress() {
  const [pickedId, setPickedId] = useState<string | null>(null)
  const reduceMotion = useReducedMotion()
  const units = useWeightUnits()

  const {
    histories,
    isLoading,
    weightSeries,
    weeklyVolume,
    prList,
    selectedExerciseId,
    selectedHistory,
    exerciseSeries,
  } = useProgressData(pickedId)

  // Convert kg series → display units for charts/labels
  const recentWeekly = useMemo(
    () =>
      weeklyVolume.slice(-16).map((p) => ({
        ...p,
        volume: units === 'kg' ? p.volume : kgToDisplay(p.volume, units),
      })),
    [weeklyVolume, units],
  )
  const recentWeight = useMemo(
    () =>
      weightSeries.slice(-90).map((p) => ({
        ...p,
        weight: roundDisplayWeight(kgToDisplay(p.weight, units), units),
      })),
    [weightSeries, units],
  )
  const recentSeries = useMemo(
    () =>
      exerciseSeries.slice(-30).map((p) => ({
        ...p,
        bestWeight:
          p.bestWeight != null
            ? roundDisplayWeight(kgToDisplay(p.bestWeight, units), units)
            : p.bestWeight,
        volume: units === 'kg' ? p.volume : kgToDisplay(p.volume, units),
      })),
    [exerciseSeries, units],
  )

  const motionProps = reduceMotion
    ? {}
    : { variants: pageVariants, initial: 'hidden', animate: 'visible' }

  return (
    <motion.div className="p-4 md:p-8 max-w-5xl mx-auto" {...motionProps}>
      <div className="mb-6 md:mb-8">
        <p className="text-[10px] text-primary uppercase tracking-widest mb-1">Analytics</p>
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
          {/* ── Left column ── */}
          <div className="space-y-6">
            {/* Per-exercise charts */}
            <Section title="Exercise Progress" icon={Dumbbell}>
              {histories.length === 0 ? (
                <EmptyState msg="Log some workouts to see per-exercise progress." />
              ) : (
                <div className="space-y-4">
                  <ExercisePicker
                    exercises={histories}
                    selectedId={selectedExerciseId}
                    onSelect={setPickedId}
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
                          <AreaChart data={recentSeries} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                            <defs>
                              <linearGradient id="wGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.25} />
                                <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} tickFormatter={(d: string) => d.slice(5)} />
                            <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} width={36} />
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
                          <BarChart data={recentSeries} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} tickFormatter={(d: string) => d.slice(5)} />
                            <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} width={40} />
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
                </div>
              )}
            </Section>

            {/* Weekly volume */}
            <Section title="Weekly Volume">
              {recentWeekly.length === 0 ? (
                <EmptyState msg="Complete workouts to see weekly volume." />
              ) : (
                <ChartCard>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={recentWeekly} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => String(Math.round(v))} />
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
            </Section>
          </div>

          {/* ── Right column ── */}
          <div className="space-y-6">
            {/* Body weight trend */}
            <Section title="Body Weight">
              {recentWeight.length < 2 ? (
                <EmptyState msg="Log your morning weight on at least 2 days to see a trend." />
              ) : (
                <ChartCard>
                  <p className="text-xs text-text-muted mb-3 font-semibold uppercase tracking-wide">
                    Weight trend ({units})
                  </p>
                  <ResponsiveContainer width="100%" height={180}>
                    <AreaChart data={recentWeight} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="bwGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#34d399" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} tickFormatter={(d: string) => d.slice(5)} />
                      <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} width={36} domain={['auto', 'auto']} />
                      <Tooltip content={<KineticTooltip valueFormatter={(v) => `${v} ${units}`} />} />
                      <Area
                        type="monotone"
                        dataKey="weight"
                        name="Weight"
                        stroke="#34d399"
                        strokeWidth={2}
                        fill="url(#bwGrad)"
                        dot={false}
                        isAnimationActive={!reduceMotion}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}
            </Section>

            {/* PR list */}
            <Section title="All-Time PRs" icon={Flame}>
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
                          <p className="text-xs text-text-muted mt-0.5">{pr.achievedDate}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-primary tabular-nums">
                          {formatWeight(pr.weight, units)} × {pr.reps}
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
            </Section>
          </div>
        </div>
      )}
    </motion.div>
  )
}
