import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Heart, Loader2, Moon, Pencil, Plus, Trash2, Dumbbell } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { BottomSheet } from '../components/ui/BottomSheet'
import { useCurrentUser } from '../features/auth/useAuth'
import { useDailyLogs } from '../features/history/hooks/useHistory'
import { useDeleteFeedback, useFeedbackHistory } from '../features/feedback/hooks/useFeedback'
import { recoveryLabel, recoveryScoreFromFeedback } from '../features/feedback/types'
import type { BodyFeedback } from '../features/feedback/types'
import type { DailyLogEntry } from '../features/history/types'
import { LogDaySheet } from '../features/dailyLog/components/LogDaySheet'
import { dailyLogKeys } from '../features/dailyLog/hooks/useDailyLog'
import { useRestDay, useRestDays } from '../features/dailyLog/hooks/useRestDays'
import { RecoveryPanel } from '../features/feedback/components/RecoveryPanel'
import { deleteDailyLog } from '../features/dailyLog/services/dailyLogService'
import type { DailyLog } from '../features/dailyLog/types'
import type { DashboardStats } from '../features/workout/services/workoutService'
import { useWeightDisplay } from '../features/settings/hooks/useWeightUnits'
import { formatWeight } from '../features/settings/lib/units'
import { pluralize } from '../lib/pluralize'

const PAGE_SIZE = 20

function fmtDateLong(iso: string): string {
  try {
    return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

function fmtSleep(v: number): string {
  const h = Math.floor(v)
  const m = Math.round((v - h) * 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

type DayEntry = {
  date: string
  /** Day row (daily log values + workouts) — `hasLog` false when it only exists because of a workout. */
  row: DailyLogEntry | null
  hasLog: boolean
  feedback: BodyFeedback | null
}

type PendingDelete = { kind: 'log' | 'recovery'; date: string }

const iconBtn =
  'min-h-11 px-3 inline-flex items-center gap-1.5 rounded-xl border border-border text-xs font-semibold text-text-secondary hover:text-primary hover:border-primary'

function RestDayToggle({ date }: { date: string }) {
  const { isRestDay, toggle, isSaving } = useRestDay(date)
  return (
    <button type="button" className={iconBtn} onClick={() => toggle()} disabled={isSaving}>
      {isRestDay ? 'Undo rest day' : 'Mark rest day'}
    </button>
  )
}

/** One stacked card per day: daily log + recovery check-in, each with Edit / Delete. */
export default function DailyLogs() {
  const { user } = useCurrentUser()
  const userId = user!.id
  const { units } = useWeightDisplay()
  const queryClient = useQueryClient()
  const logsQuery = useDailyLogs()
  const { dates: restSet, isLoading: restLoading } = useRestDays()
  const feedbackQuery = useFeedbackHistory()
  const deleteFeedback = useDeleteFeedback()

  const [visible, setVisible] = useState(PAGE_SIZE)
  const [logSheet, setLogSheet] = useState<{ date?: string } | null>(null)
  const [recoverySheetDate, setRecoverySheetDate] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const entries = useMemo<DayEntry[]>(() => {
    const byDate = new Map<string, DayEntry>()
    for (const row of logsQuery.data ?? []) {
      // Workout-only days live in History, not here
      const hasLog = !row.id.startsWith('workout-day-')
      byDate.set(row.date, { date: row.date, row, hasLog, feedback: null })
    }
    for (const fb of feedbackQuery.data ?? []) {
      const existing = byDate.get(fb.date)
      if (existing) existing.feedback = fb
      else byDate.set(fb.date, { date: fb.date, row: null, hasLog: false, feedback: fb })
    }
    for (const date of restSet) {
      if (!byDate.has(date)) {
        byDate.set(date, { date, row: null, hasLog: false, feedback: null })
      }
    }
    return [...byDate.values()]
      .filter((e) => e.hasLog || e.feedback || restSet.has(e.date))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  }, [logsQuery.data, feedbackQuery.data, restSet])

  const isLoading = logsQuery.isLoading || feedbackQuery.isLoading || restLoading
  const error = logsQuery.error ?? feedbackQuery.error

  const handleDelete = async () => {
    if (!pendingDelete) return
    const { kind, date } = pendingDelete
    setDeleting(true)
    setDeleteError('')

    const historyKey = ['history', 'daily-logs', userId] as const
    const feedbackKey = ['feedback', 'history', userId] as const
    const todayFeedbackKey = ['feedback', 'today', userId] as const
    const dateFeedbackKey = ['feedback', 'date', userId, date] as const
    const todayLogKey = dailyLogKeys.today(userId)
    const byDateKey = dailyLogKeys.byDate(userId, date)
    const statsKey = ['dashboard', 'stats', userId] as const
    const previous = {
      history: queryClient.getQueryData<DailyLogEntry[]>(historyKey),
      feedback: queryClient.getQueryData<BodyFeedback[]>(feedbackKey),
      todayFeedback: queryClient.getQueryData<BodyFeedback | null>(todayFeedbackKey),
      dateFeedback: queryClient.getQueryData(dateFeedbackKey),
      todayLog: queryClient.getQueryData<DailyLog | null>(todayLogKey),
      byDate: queryClient.getQueryData(byDateKey),
      stats: queryClient.getQueryData<DashboardStats>(statsKey),
    }

    const rollback = () => {
      queryClient.setQueryData(historyKey, previous.history)
      queryClient.setQueryData(feedbackKey, previous.feedback)
      queryClient.setQueryData(todayFeedbackKey, previous.todayFeedback)
      queryClient.setQueryData(dateFeedbackKey, previous.dateFeedback)
      queryClient.setQueryData(todayLogKey, previous.todayLog)
      queryClient.setQueryData(byDateKey, previous.byDate)
      queryClient.setQueryData(statsKey, previous.stats)
    }

    try {
      if (kind === 'log') {
        queryClient.setQueryData<DailyLogEntry[]>(historyKey, (old) =>
          old?.flatMap((row) => {
            if (row.date !== date) return [row]
            if (row.workouts.length === 0) return []
            return [
              {
                ...row,
                id: `workout-day-${date}`,
                weight: null,
                calories: null,
                protein: null,
                sleep: null,
                notes: null,
              },
            ]
          }),
        )
        queryClient.setQueryData<DailyLog | null>(todayLogKey, (old) =>
          old && old.date === date ? null : old,
        )
        queryClient.setQueryData(byDateKey, null)
        queryClient.setQueryData<DashboardStats>(statsKey, (old) =>
          old ? { ...old, weightTrend: old.weightTrend.filter((p) => p.date !== date) } : old,
        )
        await deleteDailyLog(userId, date)
      } else {
        queryClient.setQueryData<BodyFeedback[]>(feedbackKey, (old) =>
          old?.filter((entry) => entry.date !== date),
        )
        queryClient.setQueryData(dateFeedbackKey, null)
        queryClient.setQueryData<BodyFeedback | null>(todayFeedbackKey, (old) =>
          old && old.date === date ? null : old,
        )
        await deleteFeedback.mutateAsync(date)
      }
      setPendingDelete(null)
      void queryClient.invalidateQueries({ queryKey: ['dashboard', 'stats', userId] })
      void queryClient.invalidateQueries({ queryKey: ['history', 'daily-logs', userId] })
      void queryClient.invalidateQueries({ queryKey: ['daily_logs', userId] })
    } catch (err) {
      rollback()
      setDeleteError((err as Error).message)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <div className="flex items-end justify-between gap-3 mb-5 md:mb-6">
        <div>
          <p className="text-[11px] text-primary uppercase tracking-widest mb-1">
            {entries.length > 0 ? pluralize(entries.length, 'day') : 'Body & nutrition'}
          </p>
          <h1 className="text-3xl md:text-4xl font-black text-text-primary">Daily logs</h1>
        </div>
        <Button
          variant="primary"
          size="md"
          className="min-h-11 shrink-0"
          onClick={() => setLogSheet({})}
        >
          <Plus size={14} className="mr-1.5" />
          Log today
        </Button>
      </div>

      {(error || deleteError) && (
        <div className="flex items-center gap-3 p-4 mb-4 rounded-xl bg-red-900/20 border border-red-800/50 text-red-400 text-sm">
          <AlertCircle size={16} className="shrink-0" />
          <span>{deleteError || (error as Error).message || 'Failed to load daily logs.'}</span>
        </div>
      )}

      {isLoading && (
        <div className="flex justify-center py-16">
          <Loader2 size={20} className="text-primary animate-spin" />
        </div>
      )}

      {!isLoading && !error && entries.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-16 text-center text-text-muted">
          <Moon size={28} className="opacity-30" />
          <p className="text-sm">Nothing logged yet. Tap “Log today” to add weight, calories, protein or sleep.</p>
        </div>
      )}

      <div className="space-y-3">
        {entries.slice(0, visible).map((entry) => {
          const { row, feedback } = entry
          const metrics: Array<[string, string]> = []
          if (row?.weight != null) metrics.push(['Weight', formatWeight(row.weight, units, { decimals: 1 })])
          if (row?.calories != null) metrics.push(['Calories', `${row.calories.toLocaleString()} kcal`])
          if (row?.protein != null) metrics.push(['Protein', `${row.protein} g`])
          if (row?.sleep != null) metrics.push(['Sleep', fmtSleep(row.sleep)])
          const score = feedback ? recoveryScoreFromFeedback(feedback) : null
          const soreCount = feedback?.soreness.length ?? 0
          const noWorkout = !(row && row.workoutCount > 0)

          return (
            <div key={entry.date} className="rounded-xl border border-border bg-surface overflow-hidden">
              <div className="px-4 pt-3 pb-2 flex items-center justify-between gap-2">
                <p className="font-semibold text-text-primary">{fmtDateLong(entry.date)}</p>
                {row && row.workoutCount > 0 ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
                    <Dumbbell size={12} className="text-primary" />
                    {row.workoutType ?? 'Workout'}
                    {row.workoutDurationMins ? ` · ${row.workoutDurationMins}m` : ''}
                  </span>
                ) : restSet.has(entry.date) ? (
                  <span className="text-xs text-text-muted">Rest day</span>
                ) : (
                  <span className="text-xs text-text-muted">No workout</span>
                )}
              </div>

              {entry.hasLog && (
                <div className="px-4 pb-3">
                  {metrics.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-2">
                      {metrics.map(([label, value]) => (
                        <div key={label}>
                          <p className="text-[11px] text-text-secondary uppercase tracking-widest">{label}</p>
                          <p className="text-sm font-semibold text-text-primary">{value}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-text-muted">Only a note was logged.</p>
                  )}
                  {row?.notes && <p className="text-xs text-text-secondary mt-2">{row.notes}</p>}
                  <div className="flex gap-2 mt-3">
                    {noWorkout && <RestDayToggle date={entry.date} />}
                    <button type="button" className={iconBtn} onClick={() => setLogSheet({ date: entry.date })}>
                      <Pencil size={14} /> Edit log
                    </button>
                    <button
                      type="button"
                      className={`${iconBtn} hover:text-red-400! hover:border-red-800/50!`}
                      onClick={() => setPendingDelete({ kind: 'log', date: entry.date })}
                    >
                      <Trash2 size={14} /> Delete log
                    </button>
                  </div>
                </div>
              )}

              <div className="px-4 py-3 border-t border-border">
                {feedback ? (
                  <>
                    <p className="text-[11px] text-text-secondary uppercase tracking-widest mb-1 flex items-center gap-1.5">
                      <Heart size={12} className="text-primary" /> Recovery
                      {score != null && (
                        <span className="text-primary normal-case tracking-normal font-semibold">
                          · {score}% {recoveryLabel(score)}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-text-secondary">
                      Fatigue {feedback.fatigue ?? '—'}/10 · Sleep quality {feedback.sleep_quality ?? '—'}/10 ·{' '}
                      {feedback.pain_flag ? <span className="text-red-400">Pain</span> : 'No pain'} ·{' '}
                      {soreCount > 0 ? `Sore: ${pluralize(soreCount, 'muscle')}` : 'No soreness'}
                    </p>
                    {soreCount > 0 && (
                      <p className="text-xs text-text-muted mt-1">
                        {feedback.soreness.map((s) => s.muscle_group).join(', ')}
                      </p>
                    )}
                    <div className="flex gap-2 mt-3">
                      {!entry.hasLog && noWorkout && <RestDayToggle date={entry.date} />}
                      <button
                        type="button"
                        className={iconBtn}
                        onClick={() => setRecoverySheetDate(entry.date)}
                      >
                        <Pencil size={14} /> Edit recovery
                      </button>
                      <button
                        type="button"
                        className={`${iconBtn} hover:text-red-400! hover:border-red-800/50!`}
                        onClick={() => setPendingDelete({ kind: 'recovery', date: entry.date })}
                      >
                        <Trash2 size={14} /> Delete recovery
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    {!entry.hasLog && noWorkout && <RestDayToggle date={entry.date} />}
                    <button
                      type="button"
                      className="min-h-11 text-sm text-primary underline underline-offset-4"
                      onClick={() => setRecoverySheetDate(entry.date)}
                    >
                      Add recovery update
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {entries.length > visible && (
        <Button
          variant="secondary"
          size="lg"
          className="w-full mt-4 min-h-11"
          onClick={() => setVisible((v) => v + PAGE_SIZE)}
        >
          Show more
        </Button>
      )}

      {logSheet && (
        <LogDaySheet
          open
          onClose={() => setLogSheet(null)}
          userId={userId}
          date={logSheet.date}
          title={logSheet.date ? `Edit ${fmtDateLong(logSheet.date)}` : 'Log today'}
        />
      )}

      <BottomSheet
        open={recoverySheetDate != null}
        onClose={() => setRecoverySheetDate(null)}
        title={recoverySheetDate ? `Recovery · ${fmtDateLong(recoverySheetDate)}` : 'Recovery'}
      >
        {recoverySheetDate && (
          <RecoveryPanel
            date={recoverySheetDate}
            onSaved={() => window.setTimeout(() => setRecoverySheetDate(null), 600)}
          />
        )}
      </BottomSheet>

      <BottomSheet
        open={pendingDelete != null}
        onClose={() => {
          if (!deleting) setPendingDelete(null)
        }}
        title={pendingDelete?.kind === 'recovery' ? 'Delete recovery update' : 'Delete daily log'}
      >
        <div className="p-4 space-y-4">
          <p className="text-sm text-text-secondary">
            {pendingDelete?.kind === 'recovery'
              ? 'Remove the recovery check-in for '
              : 'Remove the weight, calories, protein, sleep and notes logged for '}
            <span className="font-semibold text-text-primary">
              {pendingDelete ? fmtDateLong(pendingDelete.date) : ''}
            </span>
            ? This cannot be undone.
          </p>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="lg"
              className="flex-1 min-h-12"
              disabled={deleting}
              onClick={() => setPendingDelete(null)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="lg"
              className="flex-1 min-h-12"
              disabled={deleting}
              onClick={() => void handleDelete()}
            >
              {deleting ? <Loader2 size={16} className="animate-spin" /> : 'Delete'}
            </Button>
          </div>
        </div>
      </BottomSheet>
    </div>
  )
}
