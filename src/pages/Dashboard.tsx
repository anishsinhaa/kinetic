import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'framer-motion'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import {
  Dumbbell,
  Loader2,
  Moon,
  Activity,
  TrendingUp,
  Zap,
  Flame,
} from 'lucide-react'
import { useDailyLog } from '../features/dailyLog/hooks/useDailyLog'
import {
  type DailyLogFormState,
  emptyFormState,
  logToFormState,
  formStateToPayload,
} from '../features/dailyLog/types'
import { useTodayFeedback } from '../features/feedback/hooks/useFeedback'
import { recoveryScoreFromFeedback, recoveryLabel } from '../features/feedback/types'
import { useCurrentUser } from '../features/auth/useAuth'
import { useWorkoutStore } from '../features/workout/store/useWorkoutStore'
import {
  getDashboardStats,
  getLatestCompletedWorkout,
  getRecentWorkoutTypes,
} from '../features/workout/services/workoutService'
import { suggestNextType } from '../features/workout/lib/suggestNextType'
import { formatRelativeDate } from '../features/workout/lib/formatRelativeDate'
import { resolveWorkoutTypes } from '../features/workout/lib/workoutTypes'
import { pluralize } from '../lib/pluralize'
import { formatVolumeKg } from '../features/workout/lib/volume'
import { cn } from '../lib/utils'
import { selectOnFocus } from '../lib/selectOnFocus'

function DailyLogForm({
  initialForm,
  isSaving,
  onSave,
  weightUnit = 'kg',
}: {
  initialForm: DailyLogFormState
  isSaving: boolean
  onSave: (payload: ReturnType<typeof formStateToPayload>) => Promise<unknown>
  weightUnit?: 'kg' | 'lb'
}) {
  const [form, setForm] = useState(initialForm)
  const numericFields = [
    { key: 'weight' as const, label: `Weight (${weightUnit})` },
    { key: 'calories' as const, label: 'Calories' },
    { key: 'protein' as const, label: 'Protein (g)' },
    { key: 'sleep' as const, label: 'Sleep (hrs)' },
  ]
  return (
    <Card className="mb-4">
      <div className="px-4 pt-3 pb-2 border-b border-border flex justify-between">
        <p className="text-[10px] text-text-muted uppercase tracking-widest">Today’s log</p>
        {isSaving && (
          <span className="text-[10px] text-text-muted flex items-center gap-1">
            <Loader2 size={10} className="animate-spin" /> Saving
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4">
        {numericFields.map(({ key, label }) => (
          <label key={key} className="block">
            <span className="text-[10px] text-text-secondary uppercase tracking-widest">{label}</span>
            <input
              type="number"
              value={form[key]}
              onFocus={selectOnFocus}
              onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
              onBlur={() => void onSave(formStateToPayload(form))}
              className="mt-1 w-full bg-surface-2 border border-border rounded-xl px-3 py-2.5 text-center font-semibold text-text-primary focus:outline-hidden focus:border-primary min-h-11"
              placeholder="—"
            />
          </label>
        ))}
      </div>
      <div className="px-4 pb-4">
        <label className="block">
          <span className="text-[10px] text-text-secondary uppercase tracking-widest">Note</span>
          <textarea
            value={form.notes}
            onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
            onBlur={() => void onSave(formStateToPayload(form))}
            rows={2}
            placeholder="Journal note…"
            className="mt-1 w-full bg-surface-2 border border-border rounded-xl px-3 py-2.5 text-sm text-text-primary focus:outline-hidden focus:border-primary resize-none"
          />
        </label>
      </div>
    </Card>
  )
}

function WeightSparkline({ values, label }: { values: number[]; label: string }) {
  const reduceMotion = useReducedMotion()
  const pathD = useMemo(() => {
    if (values.length === 0) return ''
    const min = Math.min(...values)
    const max = Math.max(...values)
    const range = max - min || 1
    const w = 120
    const h = 48
    const pad = 4
    return values
      .map((v, i) => {
        const x = pad + (i / Math.max(values.length - 1, 1)) * (w - pad * 2)
        const y = h - pad - ((v - min) / range) * (h - pad * 2)
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`
      })
      .join(' ')
  }, [values])

  const last = values[values.length - 1]

  return (
    <Card className="p-4">
      <p className="text-[10px] text-text-secondary uppercase tracking-widest mb-2">{label}</p>
      {values.length < 2 ? (
        <div className="h-12 flex items-center text-xs text-text-muted">Not enough data</div>
      ) : (
        <div className="flex items-end gap-3">
          <svg
            viewBox="0 0 120 48"
            className="w-full h-12 overflow-visible text-primary"
            aria-hidden
          >
            <motion.path
              d={pathD}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              initial={reduceMotion ? false : { pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.5 }}
            />
          </svg>
          {last != null && (
            <span className="text-sm font-bold text-text-primary tabular-nums shrink-0">
              {last}
            </span>
          )}
        </div>
      )}
    </Card>
  )
}

function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-surface-3', className)} />
}

export default function Dashboard() {
  const { user } = useCurrentUser()
  const userId = user!.id
  const navigate = useNavigate()
  const reduceMotion = useReducedMotion()

  const currentWorkoutId = useWorkoutStore((s) => s.currentWorkoutId)
  const workoutLabel = useWorkoutStore((s) => s.workoutLabel)
  const workoutTypes = useWorkoutStore((s) => s.workoutTypes)
  const units = useWorkoutStore((s) => s.units)

  const { log, isLoading: logLoading, isSaving, save } = useDailyLog(userId)
  const { data: todayFeedback, isLoading: feedbackLoading } = useTodayFeedback()

  const lastWorkoutQuery = useQuery({
    queryKey: ['workout', 'latest-completed', userId],
    queryFn: () => getLatestCompletedWorkout(userId),
  })

  const recentTypesQuery = useQuery({
    queryKey: ['workout', 'recent-types', userId],
    queryFn: () => getRecentWorkoutTypes(userId),
  })

  const statsQuery = useQuery({
    queryKey: ['dashboard', 'stats', userId],
    queryFn: () => getDashboardStats(userId),
  })

  const suggestion = useMemo(
    () => suggestNextType(recentTypesQuery.data ?? [], resolveWorkoutTypes(workoutTypes)),
    [recentTypesQuery.data, workoutTypes],
  )

  const weightValues = useMemo(() => {
    const trend = statsQuery.data?.weightTrend ?? []
    return trend.map((t) => t.weight)
  }, [statsQuery.data])

  const queriesLoading =
    lastWorkoutQuery.isLoading || recentTypesQuery.isLoading || statsQuery.isLoading

  const cta = currentWorkoutId
    ? { label: 'Resume workout', to: '/workout', hint: workoutLabel || 'In progress' }
    : {
        label: 'Start Workout',
        to: suggestion
          ? `/workout?start=1&type=${encodeURIComponent(suggestion)}`
          : '/workout?start=1',
        hint:
          recentTypesQuery.isLoading || !suggestion
            ? null
            : `Suggested: ${suggestion}`,
      }

  return (
    <div className="p-4 md:p-8 pb-28 md:pb-8">
      <div className="mb-5 md:mb-8">
        <p className="text-xs text-text-secondary uppercase tracking-widest mb-1">Home</p>
        <h1 className="text-4xl md:text-6xl font-black text-text-primary leading-none">Today</h1>
        {cta.hint && <p className="text-sm text-text-muted mt-2">{cta.hint}</p>}
        {!cta.hint && !currentWorkoutId && recentTypesQuery.isLoading && (
          <SkeletonBlock className="h-4 w-40 mt-3" />
        )}
      </div>

      {/* Primary CTAs — desktop + mobile */}
      <div className="hidden md:flex gap-3 mb-6">
        <Button variant="primary" size="lg" onClick={() => navigate(cta.to)}>
          <Dumbbell size={16} className="mr-2" />
          {cta.label}
        </Button>
        {!currentWorkoutId &&
          (lastWorkoutQuery.isLoading ? (
            <SkeletonBlock className="h-11 w-32" />
          ) : lastWorkoutQuery.data ? (
            <Button variant="secondary" size="lg" onClick={() => navigate('/workout?repeat=1')}>
              Repeat last
            </Button>
          ) : null)}
      </div>

      {/* Suggested type chips */}
      {!currentWorkoutId && (
        <div className="flex flex-wrap gap-2 mb-5">
          {recentTypesQuery.isLoading
            ? Array.from({ length: 6 }).map((_, i) => (
                <SkeletonBlock key={i} className="h-11 w-16" />
              ))
            : resolveWorkoutTypes(workoutTypes).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => navigate(`/workout?start=1&type=${encodeURIComponent(type)}`)}
                  className={cn(
                    'px-3 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider border min-h-11',
                    suggestion === type
                      ? 'bg-primary text-black border-primary'
                      : 'border-border text-text-secondary hover:border-primary',
                  )}
                >
                  {type}
                </button>
              ))}
        </div>
      )}

      {/* Today card */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
        <Card className="p-4">
          <p className="text-[10px] text-text-secondary uppercase tracking-widest mb-2">
            Morning weight
          </p>
          {logLoading ? (
            <SkeletonBlock className="h-10 w-24" />
          ) : (
            <button
              type="button"
              className="text-left w-full"
              onClick={() => document.getElementById('dash-weight')?.focus()}
            >
              <p className="text-3xl font-black text-text-primary">
                {log?.weight != null ? `${log.weight}` : '—'}
                <span className="text-sm font-medium text-text-muted ml-1">{units}</span>
              </p>
              <p className="text-xs text-primary mt-1">Tap log below to update</p>
            </button>
          )}
        </Card>
        <Card className="p-4">
          <p className="text-[10px] text-text-secondary uppercase tracking-widest mb-2">Recovery</p>
          {feedbackLoading ? (
            <SkeletonBlock className="h-10 w-28" />
          ) : todayFeedback ? (
            <Link to="/feedback" className="block">
              {(() => {
                const score = recoveryScoreFromFeedback(todayFeedback)
                return (
                  <>
                    <p className="text-3xl font-black text-text-primary">
                      {score != null ? `${score}%` : '—'}
                    </p>
                    <p className="text-xs text-primary mt-1 flex items-center gap-1">
                      <Zap size={11} />
                      {score != null ? `${recoveryLabel(score)} · logged` : 'Logged'}
                    </p>
                  </>
                )
              })()}
            </Link>
          ) : (
            <Link to="/feedback" className="block">
              <p className="text-3xl font-black text-text-muted">—</p>
              <p className="text-xs text-primary mt-1">Log check-in →</p>
            </Link>
          )}
        </Card>
      </div>

      {logLoading ? (
        <Card className="mb-4 p-6">
          <SkeletonBlock className="h-20 w-full" />
        </Card>
      ) : (
        <div id="dash-weight">
          <DailyLogForm
            key={log?.id ?? 'new-log'}
            initialForm={log ? logToFormState(log) : emptyFormState()}
            isSaving={isSaving}
            weightUnit={units}
            onSave={save}
          />
        </div>
      )}

      {/* Mini charts */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        {statsQuery.isLoading ? (
          <>
            <SkeletonBlock className="h-28" />
            <SkeletonBlock className="h-28" />
            <SkeletonBlock className="h-28" />
          </>
        ) : (
          <>
            <WeightSparkline values={weightValues} label="7-day weight" />
            <Card className="p-4">
              <p className="text-[10px] text-text-secondary uppercase tracking-widest mb-2">
                Workouts this week
              </p>
              <motion.p
                className="text-4xl font-black text-text-primary"
                initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {statsQuery.data?.workoutsThisWeek ?? 0}
              </motion.p>
            </Card>
            <Card className="p-4">
              <p className="text-[10px] text-text-secondary uppercase tracking-widest mb-2 flex items-center gap-1">
                <Flame size={11} /> Streak
              </p>
              <p className="text-4xl font-black text-primary">
                {statsQuery.data?.streakDays ?? 0}
              </p>
              <p className="text-xs text-text-muted mt-1">
                {(statsQuery.data?.streakDays ?? 0) === 1 ? 'day' : 'days'}
              </p>
            </Card>
          </>
        )}
      </div>

      {/* Last workout */}
      <Card className="p-5 mb-4">
        <p className="text-[10px] text-text-secondary uppercase tracking-widest mb-2">Last workout</p>
        {lastWorkoutQuery.isLoading || queriesLoading ? (
          <div className="space-y-2">
            <SkeletonBlock className="h-6 w-32" />
            <SkeletonBlock className="h-4 w-48" />
            <SkeletonBlock className="h-4 w-56" />
          </div>
        ) : lastWorkoutQuery.data ? (
          <>
            <p className="text-xl font-bold text-text-primary">{lastWorkoutQuery.data.label}</p>
            <p className="text-text-secondary text-sm mt-0.5">
              {formatRelativeDate(lastWorkoutQuery.data.date)} · {lastWorkoutQuery.data.durationText}
            </p>
            <p className="text-text-muted text-xs mt-1 flex items-center gap-2">
              <TrendingUp size={12} />
              {pluralize(lastWorkoutQuery.data.exerciseCount, 'exercise')} ·{' '}
              {pluralize(lastWorkoutQuery.data.setCount, 'set')} ·{' '}
              {formatVolumeKg(lastWorkoutQuery.data.totalVolumeKg)} kg
            </p>
          </>
        ) : (
          <p className="text-text-muted text-sm">No workouts yet — start one below.</p>
        )}
      </Card>

      {todayFeedback && todayFeedback.soreness.length > 0 && (
        <Card className="p-4 mb-4">
          <p className="text-[10px] text-text-secondary uppercase tracking-widest mb-2 flex items-center gap-1">
            <Activity size={11} /> Soreness
          </p>
          <div className="flex flex-wrap gap-2">
            {todayFeedback.soreness.map((s) => (
              <span key={s.muscle_group} className="text-xs text-text-secondary">
                {s.muscle_group}
              </span>
            ))}
          </div>
          {todayFeedback.sleep_quality != null && (
            <p className="text-xs text-text-muted mt-2 flex items-center gap-1">
              <Moon size={11} /> Sleep quality {todayFeedback.sleep_quality}/10
            </p>
          )}
        </Card>
      )}

      {/* Mobile sticky CTA */}
      <div className="md:hidden fixed bottom-16 left-0 right-0 z-30 px-4 py-3 bg-background/95 backdrop-blur border-t border-border space-y-2">
        <Button variant="primary" size="lg" className="w-full" onClick={() => navigate(cta.to)}>
          <Dumbbell size={16} className="mr-2" />
          {cta.label}
        </Button>
        {!currentWorkoutId && lastWorkoutQuery.data && (
          <Button
            variant="secondary"
            size="md"
            className="w-full"
            onClick={() => navigate('/workout?repeat=1')}
          >
            Repeat last
          </Button>
        )}
      </div>
    </div>
  )
}
