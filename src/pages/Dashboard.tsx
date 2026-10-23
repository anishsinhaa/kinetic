import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, ChevronRight, Dumbbell, Flame, HeartPulse, NotebookPen } from 'lucide-react'
import { BottomSheet } from '../components/ui/BottomSheet'
import { Card } from '../components/ui/Card'
import { useDailyLog } from '../features/dailyLog/hooks/useDailyLog'
import { todayDateString } from '../features/dailyLog/services/dailyLogService'
import { localDateString } from '../lib/localDate'
import { useDailyLogs } from '../features/history/hooks/useHistory'
import { LogDaySheet } from '../features/dailyLog/components/LogDaySheet'
import { useTodayFeedback } from '../features/feedback/hooks/useFeedback'
import { RecoveryPanel } from '../features/feedback/components/RecoveryPanel'
import { recoveryScoreFromFeedback, recoveryLabel } from '../features/feedback/types'
import { useCurrentUser } from '../features/auth/useAuth'
import { useWeightDisplay } from '../features/settings/hooks/useWeightUnits'
import { useActiveSession } from '../features/workout/hooks/useActiveSession'
import {
  getDashboardStats,
  getLatestCompletedWorkout,
} from '../features/workout/services/workoutService'
import { formatRelativeDate } from '../features/workout/lib/formatRelativeDate'
import { pluralize } from '../lib/pluralize'
import { formatVolume, roundBodyWeight } from '../features/settings/lib/units'
import { cn } from '../lib/utils'

function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-surface-3', className)} />
}

function formatElapsedShort(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60000))
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function StatTile({
  label,
  children,
  hint,
  icon,
}: {
  label: string
  children: ReactNode
  hint?: string
  icon?: ReactNode
}) {
  return (
    <Card className="p-4 min-w-0">
      <p className="text-[11px] text-text-secondary uppercase tracking-widest mb-1.5 flex items-center gap-1">
        {icon}
        {label}
      </p>
      <div className="text-2xl font-black text-text-primary leading-tight">{children}</div>
      {hint && <p className="text-xs text-text-secondary mt-1 truncate">{hint}</p>}
    </Card>
  )
}

/** Secondary action with a "logged ✓ / not logged" state for today. */
function LogButton({
  icon,
  title,
  logged,
  loading,
  onClick,
}: {
  icon: ReactNode
  title: string
  logged: boolean
  loading: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border border-border bg-surface-2 hover:border-primary active:scale-[0.98] transition px-4 py-3 min-h-16 text-left flex flex-col gap-1"
    >
      <span className="flex items-center gap-2 text-sm font-semibold text-text-primary">
        {icon}
        {title}
      </span>
      {loading ? (
        <span className="text-xs text-text-secondary">Checking…</span>
      ) : logged ? (
        <span className="text-xs text-primary flex items-center gap-1">
          <CheckCircle2 size={12} /> Logged ✓
        </span>
      ) : (
        <span className="text-xs text-text-secondary">Not logged</span>
      )}
    </button>
  )
}

export default function Dashboard() {
  const { user } = useCurrentUser()
  const userId = user!.id
  const navigate = useNavigate()
  const { units } = useWeightDisplay()

  // "Active" = store points at a workouts row that is still open (not a stale id)
  const { activeSession } = useActiveSession()

  const [logSheetOpen, setLogSheetOpen] = useState(false)
  const [recoverySheetOpen, setRecoverySheetOpen] = useState(false)

  // Elapsed time for the resume button (minute precision)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!activeSession) return
    const t = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(t)
  }, [activeSession])

  const { log, isLoading: logLoading } = useDailyLog(userId)
  const logsQuery = useDailyLogs()
  const { data: todayFeedback, isLoading: feedbackLoading } = useTodayFeedback()

  const lastWorkoutQuery = useQuery({
    queryKey: ['workout', 'latest-completed', userId],
    queryFn: () => getLatestCompletedWorkout(userId),
  })

  const statsQuery = useQuery({
    queryKey: ['dashboard', 'stats', userId],
    queryFn: () => getDashboardStats(userId),
  })

  const avgWeight = useMemo(() => {
    if (!logsQuery.isFetched) return null
    const today = todayDateString()
    const start = new Date()
    start.setDate(start.getDate() - 6)
    const startKey = localDateString(start)
    const weights = (logsQuery.data ?? []).filter(
      (row) => row.weight != null && row.date >= startKey && row.date <= today,
    )
    if (weights.length === 0) return null
    const shown = weights.map((row) => roundBodyWeight(row.weight ?? 0, units))
    const avg = shown.reduce((sum, value) => sum + value, 0) / shown.length
    return Math.round(avg * 10) / 10
  }, [logsQuery.isFetched, logsQuery.data, units])

  const score = todayFeedback ? recoveryScoreFromFeedback(todayFeedback) : null
  const soreCount = todayFeedback?.soreness.length ?? 0
  const last = lastWorkoutQuery.data
  const doneToday = !activeSession && last?.date === localDateString()

  return (
    <div className="p-4 md:p-8 pb-28 md:pb-8 max-w-3xl mx-auto space-y-5">
      <div>
        <p className="text-xs text-text-secondary uppercase tracking-widest mb-1">Home</p>
        <h1 className="text-4xl md:text-5xl font-black text-text-primary leading-none">Today</h1>
      </div>

      {/* Primary: resume, today's done card, or start (confirms on the workout page) */}
      {activeSession ? (
        <button
          type="button"
          onClick={() => navigate('/workout')}
          className="w-full rounded-2xl bg-primary text-black hover:bg-primary-hover active:scale-[0.99] transition px-6 py-5 min-h-20 flex items-center justify-center gap-3 text-left"
        >
          <Dumbbell size={26} className="shrink-0" />
          <span className="min-w-0">
            <span className="block text-xl font-black leading-tight">Resume workout</span>
            <span className="block text-sm font-medium opacity-80 truncate">
              {activeSession.label || 'In progress'}
              {activeSession.startedAt
                ? ` · ${formatElapsedShort(now - new Date(activeSession.startedAt).getTime())}`
                : ''}
            </span>
          </span>
        </button>
      ) : doneToday && last ? (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => navigate('/progress/history')}
            className="w-full rounded-2xl border border-primary/40 bg-surface px-6 py-5 min-h-20 text-left"
          >
            <span className="block text-xl font-black text-text-primary leading-tight">
              ✓ Today's workout done
            </span>
            <span className="block text-sm text-text-secondary mt-1">
              {last.label} · {last.exerciseCount} exercises · {last.setCount} sets
            </span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/workout?confirm=1')}
            className="text-sm text-primary min-h-11"
          >
            Start another workout
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => navigate('/workout?confirm=1')}
          className="w-full rounded-2xl bg-primary text-black hover:bg-primary-hover active:scale-[0.99] transition px-6 py-5 min-h-20 flex items-center justify-center gap-3 text-left"
        >
          <Dumbbell size={26} className="shrink-0" />
          <span className="block text-xl font-black leading-tight">Start Workout</span>
        </button>
      )}

      {/* Secondary: daily log + recovery, each with today's state */}
      <div className="grid grid-cols-2 gap-3">
        <LogButton
          icon={<NotebookPen size={16} className="text-primary" />}
          title="Log day"
          logged={Boolean(log)}
          loading={logLoading}
          onClick={() => setLogSheetOpen(true)}
        />
        <LogButton
          icon={<HeartPulse size={16} className="text-primary" />}
          title="Recovery update"
          logged={Boolean(todayFeedback)}
          loading={feedbackLoading}
          onClick={() => setRecoverySheetOpen(true)}
        />
      </div>

      {/* Compact stat tiles */}
      <div className="grid grid-cols-2 gap-3">
        {statsQuery.isLoading ? (
          <>
            <SkeletonBlock className="h-24" />
            <SkeletonBlock className="h-24" />
            <SkeletonBlock className="h-24" />
          </>
        ) : (
          <>
            <StatTile
              label="7-day avg weight"
              hint={logsQuery.isFetched && avgWeight == null ? 'No weigh-ins yet' : undefined}
            >
              {!logsQuery.isFetched ? (
                <SkeletonBlock className="h-8 w-24" />
              ) : avgWeight != null ? (
                <>
                  {avgWeight.toFixed(1)}
                  <span className="text-sm font-medium text-text-secondary ml-1">{units}</span>
                </>
              ) : (
                '—'
              )}
            </StatTile>
            <StatTile label="Workouts this week">{statsQuery.data?.workoutsThisWeek ?? 0}</StatTile>
            <StatTile label="Streak" icon={<Flame size={11} />}>
              <span className="text-primary">{statsQuery.data?.streakDays ?? 0}</span>
              <span className="text-sm font-medium text-text-secondary ml-1">
                {(statsQuery.data?.streakDays ?? 0) === 1 ? 'day' : 'days'}
              </span>
            </StatTile>
          </>
        )}

        {/* Last workout — opens it in Progress → History */}
        <button
          type="button"
          onClick={() => navigate('/progress/history')}
          disabled={!last}
          className="text-left min-w-0 disabled:cursor-default"
        >
          <Card className="p-4 h-full hover:border-primary transition-colors">
            <p className="text-[11px] text-text-secondary uppercase tracking-widest mb-1.5 flex items-center justify-between">
              Last workout
              {last && <ChevronRight size={12} />}
            </p>
            {lastWorkoutQuery.isLoading ? (
              <SkeletonBlock className="h-8 w-24" />
            ) : last ? (
              <>
                <p className="text-2xl font-black text-text-primary leading-tight truncate">
                  {last.label}
                </p>
                <p className="text-xs text-text-secondary mt-1 truncate">
                  {formatRelativeDate(last.date)} · {formatVolume(last.totalVolumeKg, units)}
                </p>
              </>
            ) : (
              <p className="text-sm text-text-secondary">No workouts yet</p>
            )}
          </Card>
        </button>
      </div>

      {/* Recovery tile */}
      <Card className="p-4">
        <p className="text-[11px] text-text-secondary uppercase tracking-widest mb-1.5">Recovery</p>
        {feedbackLoading ? (
          <SkeletonBlock className="h-12 w-40" />
        ) : todayFeedback ? (
          <>
            <p className="text-3xl font-black text-text-primary">
              {score != null ? `${score}%` : '—'}
              {score != null && (
                <span className="text-sm font-medium text-primary ml-2">{recoveryLabel(score)}</span>
              )}
            </p>
            <p className="text-xs text-text-secondary mt-1">Based on fatigue and sleep quality</p>
            <p className="text-xs text-text-primary mt-2">
              Fatigue {todayFeedback.fatigue ?? '—'}/10 · Sleep quality{' '}
              {todayFeedback.sleep_quality ?? '—'}/10
            </p>
            <p className="text-xs text-text-secondary mt-0.5">
              Sore: {pluralize(soreCount, 'muscle')}
              {todayFeedback.pain_flag ? ' · Pain flagged' : ''}
            </p>
          </>
        ) : (
          <p className="text-sm text-text-secondary">
            Not logged today — tap “Recovery update” to check in.
          </p>
        )}
      </Card>

      <LogDaySheet
        open={logSheetOpen}
        onClose={() => setLogSheetOpen(false)}
        userId={userId}
        title="Log day"
      />
      <BottomSheet
        open={recoverySheetOpen}
        onClose={() => setRecoverySheetOpen(false)}
        title="Recovery update"
      >
        <div className="p-4">
          <RecoveryPanel onSaved={() => window.setTimeout(() => setRecoverySheetOpen(false), 600)} />
        </div>
      </BottomSheet>
    </div>
  )
}
