import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { TrendingUp, Zap, RepeatIcon, Loader2, Moon, Activity, Dumbbell } from 'lucide-react'
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
import { getLatestCompletedWorkout } from '../features/workout/services/workoutService'

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component: save status indicator
// ─────────────────────────────────────────────────────────────────────────────
function SaveStatus({
  isSaving,
  isError,
  error,
}: {
  isSaving: boolean
  isError: boolean
  error: Error | null
}) {
  if (isSaving) {
    return (
      <span className="flex items-center gap-1 text-[10px] text-text-muted uppercase tracking-widest">
        <Loader2 size={10} className="animate-spin" />
        Saving…
      </span>
    )
  }
  if (isError && error) {
    const msg = error.message.includes('schema cache')
      ? 'Table not found — run supabase/schema.sql in your Supabase project first'
      : error.message
    return (
      <span className="text-[10px] text-red-400 normal-case tracking-normal">
        ⚠ {msg}
      </span>
    )
  }
  return (
    <span className="text-[10px] text-text-muted uppercase tracking-widest">
      System auto-saves on blur • High density data input mode
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard
// ─────────────────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user } = useCurrentUser()
  const userId = user!.id
  const navigate = useNavigate()

  // Date/time computed at render so they're always current
  const { dateLabel, timeLabel } = useMemo(() => {
    const now = new Date()
    return {
      dateLabel: now
        .toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        })
        .toUpperCase(),
      timeLabel: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    }
  }, [])

  const { log, isLoading, isError, error, isSaving, save } = useDailyLog(userId)
  const { data: todayFeedback } = useTodayFeedback()
  const { data: lastWorkout } = useQuery({
    queryKey: ['workout', 'latest-completed', userId],
    queryFn: () => getLatestCompletedWorkout(userId),
    enabled: Boolean(userId),
  })

  // Local form state — strings so number inputs stay fully controlled
  const [form, setForm] = useState<DailyLogFormState>(emptyFormState)

  // Track whether we've seeded the form from the fetched log
  const seededRef = useRef(false)

  useEffect(() => {
    if (log !== undefined && !seededRef.current) {
      seededRef.current = true
      setForm(log ? logToFormState(log) : emptyFormState())
    }
  }, [log])

  // ── Field handlers ──────────────────────────────────────────────────────
  const handleChange = (field: keyof DailyLogFormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  // Persist on blur — fires once per field when the user leaves it.
  // Debouncing is acceptable here; blur is already a natural debounce.
  const handleBlur = () => {
    save(formStateToPayload(form)).catch(() => {
      // error is already reflected in `isError` from the hook
    })
  }

  // ── Numeric fields rendered in the table ──────────────────────────────
  const numericFields = [
    { key: 'weight', label: 'Weight (kg)' },
    { key: 'calories', label: 'Calories (kcal)' },
    { key: 'protein', label: 'Protein (g)+' },
    { key: 'sleep', label: 'Sleep (hrs)' },
  ] as const

  return (
    <div className="p-4 md:p-8">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="mb-6 md:mb-8">
        <p className="text-xs text-text-secondary uppercase tracking-widest mb-1">
          System Status: Active
        </p>
        <div className="flex items-start md:items-end justify-between gap-3">
          <h1 className="text-4xl md:text-7xl font-black text-text-primary leading-none">Today</h1>
          <div className="flex flex-col sm:flex-row gap-2 md:gap-3 shrink-0 md:mb-2">
            <Button variant="primary" size="md" onClick={() => navigate('/workout')}>
              <Dumbbell size={14} className="mr-2" />
              Start Workout
            </Button>
            {lastWorkout && (
              <Button
                variant="secondary"
                size="md"
                onClick={() => navigate('/workout?repeat=1')}
              >
                <RepeatIcon size={14} className="mr-2" />
                Repeat Last
              </Button>
            )}
          </div>
        </div>
        <p className="text-text-secondary text-sm mt-2">
          {dateLabel} • {timeLabel}
        </p>
      </div>

      {/* ── Daily Log Table ─────────────────────────────────────────────────── */}
      <Card className="mb-6">
        <div className="px-6 pt-4 pb-2 border-b border-border flex items-center justify-between">
          <SaveStatus isSaving={isSaving} isError={isError} error={error} />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-10 gap-2 text-text-secondary text-sm">
            <Loader2 size={16} className="animate-spin" />
            Loading today's log…
          </div>
        ) : (
          <div className="overflow-x-auto -mx-px">
            <table className="w-full text-sm min-w-[500px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-[10px] text-text-secondary uppercase tracking-widest px-6 py-3 font-medium">
                    Metric
                  </th>
                  {numericFields.map(({ key, label }) => (
                    <th
                      key={key}
                      className="text-left text-[10px] text-text-secondary uppercase tracking-widest px-4 py-3 font-medium"
                    >
                      {label}
                    </th>
                  ))}
                  <th className="text-left text-[10px] text-text-secondary uppercase tracking-widest px-4 py-3 font-medium">
                    Quick Notes
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-6 py-4 text-text-secondary text-xs uppercase tracking-widest font-medium">
                    Daily Log
                  </td>
                  {numericFields.map(({ key }) => (
                    <td key={key} className="px-4 py-4">
                      <input
                        type="number"
                        value={form[key]}
                        onChange={(e) => handleChange(key, e.target.value)}
                        onBlur={handleBlur}
                        placeholder="—"
                        className={`w-24 bg-transparent text-center text-base font-semibold focus:outline-none border-b border-transparent focus:border-primary transition-colors placeholder:text-text-muted ${
                          key === 'protein' ? 'text-primary' : 'text-text-primary'
                        }`}
                      />
                    </td>
                  ))}
                  <td className="px-4 py-4">
                    <input
                      type="text"
                      value={form.notes}
                      onChange={(e) => handleChange('notes', e.target.value)}
                      onBlur={handleBlur}
                      placeholder="Add note…"
                      className="bg-transparent text-text-secondary text-sm focus:outline-none border-b border-transparent focus:border-primary transition-colors w-40 placeholder:text-text-muted"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Insights ─────────────────────────────────────────────────────────── */}
      <div className="mb-4 md:mb-6">
        <h2 className="text-lg font-bold text-text-primary mb-4 flex items-center gap-2">
          <span className="w-1 h-5 bg-primary rounded-full inline-block" />
          Recovery
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Recovery Status — live */}
          <Card className="p-5">
            <p className="text-[10px] text-text-secondary uppercase tracking-widest mb-3">
              Recovery Status
            </p>
            {todayFeedback ? (
              <>
                <div className="flex items-end justify-between mb-3">
                  <span className="text-5xl font-black text-text-primary">
                    {recoveryScoreFromFeedback(todayFeedback)}%
                  </span>
                  <span className="flex items-center gap-1 text-primary text-xs font-semibold mb-2">
                    <TrendingUp size={12} />
                    {recoveryLabel(recoveryScoreFromFeedback(todayFeedback))}
                  </span>
                </div>
                <div className="w-full h-1 bg-surface-3 rounded-full mb-3">
                  <div
                    className="h-1 bg-primary rounded-full transition-all"
                    style={{ width: `${recoveryScoreFromFeedback(todayFeedback)}%` }}
                  />
                </div>
                <div className="flex gap-4 text-xs text-text-secondary">
                  <span className="flex items-center gap-1">
                    <Zap size={11} className="text-text-muted" />
                    Fatigue {todayFeedback.fatigue ?? '—'}/10
                  </span>
                  <span className="flex items-center gap-1">
                    <Moon size={11} className="text-text-muted" />
                    Sleep {todayFeedback.sleep_quality ?? '—'}/10
                  </span>
                  {todayFeedback.soreness.length > 0 && (
                    <span className="flex items-center gap-1">
                      <Activity size={11} className="text-orange-400" />
                      {todayFeedback.soreness.length} sore
                    </span>
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-text-muted text-sm">No recovery data logged today.</p>
                <Link
                  to="/feedback"
                  className="text-primary text-xs font-semibold hover:underline"
                >
                  Log check-in →
                </Link>
              </div>
            )}
          </Card>

          {/* Soreness snapshot */}
          <Card className="p-5">
            <p className="text-[10px] text-text-secondary uppercase tracking-widest mb-3">
              Muscle Soreness
            </p>
            {todayFeedback && todayFeedback.soreness.length > 0 ? (
              <div className="space-y-2">
                {todayFeedback.soreness.slice(0, 4).map((s) => (
                  <div key={s.muscle_group} className="flex items-center justify-between">
                    <span className="text-sm text-text-secondary">{s.muscle_group}</span>
                    <div className="flex gap-1">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <div
                          key={i}
                          className={`w-2 h-2 rounded-full ${
                            i < s.level
                              ? s.level === 1
                                ? 'bg-yellow-500'
                                : s.level === 2
                                ? 'bg-orange-500'
                                : 'bg-red-500'
                              : 'bg-surface-3 border border-border'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                ))}
                {todayFeedback.soreness.length > 4 && (
                  <p className="text-[10px] text-text-muted">
                    +{todayFeedback.soreness.length - 4} more
                  </p>
                )}
              </div>
            ) : (
              <p className="text-text-muted text-sm">
                {todayFeedback ? 'No soreness reported.' : 'Log your check-in to see soreness.'}
              </p>
            )}
          </Card>
        </div>
      </div>

      {/* ── Last Workout ──────────────────────────────────────────────────────── */}
      <Card className="p-5">
        <p className="text-[10px] text-text-secondary uppercase tracking-widest mb-2">
          Last Workout
        </p>
        {lastWorkout ? (
          <>
            <p className="text-lg font-bold text-text-primary">{lastWorkout.label}</p>
            <p className="text-text-secondary text-sm mt-0.5">
              {lastWorkout.date} • {lastWorkout.durationText}
            </p>
            <p className="text-text-muted text-xs mt-1">
              {lastWorkout.exerciseCount} exercises • {lastWorkout.setCount} sets •{' '}
              {lastWorkout.totalVolumeKg} kg volume
            </p>
            {lastWorkout.exerciseNames.length > 0 && (
              <p className="text-text-muted text-xs mt-1">
                {lastWorkout.exerciseNames.slice(0, 4).join(', ')}
                {lastWorkout.exerciseNames.length > 4 ? ' …' : ''}
              </p>
            )}
          </>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-text-muted text-sm">No workouts logged yet.</p>
            <button
              onClick={() => navigate('/workout')}
              className="text-primary text-xs font-semibold hover:underline text-left"
            >
              Start your first workout →
            </button>
          </div>
        )}
      </Card>
    </div>
  )
}
