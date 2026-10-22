import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AlertCircle, ChevronDown, Dumbbell, Loader2, Trash2 } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { BottomSheet } from '../components/ui/BottomSheet'
import { useCurrentUser } from '../features/auth/useAuth'
import { useDailyLogs, useExerciseHistory } from '../features/history/hooks/useHistory'
import type { DailyLogEntry, ExerciseHistory, SetRecord } from '../features/history/types'
import type { DashboardStats } from '../features/workout/services/workoutService'
import { deleteWorkout } from '../features/workout/services/workoutService'
import { useWeightDisplay } from '../features/settings/hooks/useWeightUnits'
import { formatVolume, formatWeight } from '../features/settings/lib/units'
import { cn } from '../lib/utils'
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

function fmtTime(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

type WorkoutCardData = {
  id: string
  date: string
  label: string
  durationMins: number | null
  endedAt: string | null
}

type WorkoutDetail = {
  volumeKg: number
  feel: number | null
  note: string | null
  exercises: Array<{ name: string; sets: SetRecord[] }>
}

async function invalidateHistoryCaches(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['history'] }),
    queryClient.invalidateQueries({ queryKey: ['progress'] }),
    queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
    queryClient.invalidateQueries({ queryKey: ['workout'] }),
  ])
}

/** Completed workouts as cards, newest first. Tapping a card shows its exercises and sets. */
export default function History() {
  const { user } = useCurrentUser()
  const userId = user!.id
  const { data: logs, isLoading, error } = useDailyLogs()
  const { data: exerciseHistory } = useExerciseHistory()
  const { units, step } = useWeightDisplay()
  const queryClient = useQueryClient()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [visible, setVisible] = useState(PAGE_SIZE)
  const [pendingDelete, setPendingDelete] = useState<WorkoutCardData | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const workouts = useMemo<WorkoutCardData[]>(
    () =>
      (logs ?? []).flatMap((row) =>
        // Rows are newest date first; same-day workouts are oldest first → reverse them
        [...row.workouts].reverse().map((w) => ({
          id: w.id,
          date: row.date,
          label: w.label?.trim() || 'Workout',
          durationMins: w.durationMins,
          endedAt: w.endedAt,
        })),
      ),
    [logs],
  )

  // workoutId → exercises / volume, built from the per-exercise history
  const details = useMemo(() => {
    const map = new Map<string, WorkoutDetail>()
    for (const ex of exerciseHistory ?? []) {
      for (const s of ex.sessions) {
        const d = map.get(s.workoutId) ?? { volumeKg: 0, feel: null, note: null, exercises: [] }
        d.volumeKg += s.totalVolume
        d.feel = s.feel ?? d.feel
        d.note = s.note ?? d.note
        d.exercises.push({ name: ex.exerciseName, sets: s.sets })
        map.set(s.workoutId, d)
      }
    }
    return map
  }, [exerciseHistory])

  const handleDelete = async () => {
    if (!pendingDelete) return
    setDeleting(true)
    setDeleteError('')

    const historyKey = ['history', 'daily-logs', userId] as const
    const exerciseKey = ['history', 'exercise-history', userId] as const
    const statsKey = ['dashboard', 'stats', userId] as const
    const previous = {
      history: queryClient.getQueryData<DailyLogEntry[]>(historyKey),
      exercises: queryClient.getQueryData<ExerciseHistory[]>(exerciseKey),
      stats: queryClient.getQueryData<DashboardStats>(statsKey),
    }
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 6)
    const weekAgoStr = weekAgo.toISOString().slice(0, 10)

    queryClient.setQueryData<DailyLogEntry[]>(historyKey, (old) =>
      old?.flatMap((row) => {
        if (!row.workouts.some((w) => w.id === pendingDelete.id)) return [row]
        const workouts = row.workouts.filter((w) => w.id !== pendingDelete.id)
        if (workouts.length === 0 && row.id.startsWith('workout-day-')) return []
        const latest = workouts[workouts.length - 1]
        return [
          {
            ...row,
            workouts,
            workoutCount: workouts.length,
            workoutType: latest?.label ?? null,
            workoutDurationMins: latest?.durationMins ?? null,
          },
        ]
      }),
    )
    queryClient.setQueryData<ExerciseHistory[]>(exerciseKey, (old) =>
      old
        ?.map((ex) => ({
          ...ex,
          sessions: ex.sessions.filter((s) => s.workoutId !== pendingDelete.id),
        }))
        .filter((ex) => ex.sessions.length > 0),
    )
    queryClient.setQueryData<DashboardStats>(statsKey, (old) => {
      if (!old || pendingDelete.date < weekAgoStr) return old
      return { ...old, workoutsThisWeek: Math.max(0, old.workoutsThisWeek - 1) }
    })

    try {
      await deleteWorkout(pendingDelete.id)
      setPendingDelete(null)
      await invalidateHistoryCaches(queryClient)
      void queryClient.invalidateQueries({ queryKey: ['dashboard', 'stats', userId] })
    } catch (err) {
      queryClient.setQueryData(historyKey, previous.history)
      queryClient.setQueryData(exerciseKey, previous.exercises)
      queryClient.setQueryData(statsKey, previous.stats)
      setDeleteError((err as Error).message)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <div className="mb-5 md:mb-6">
        <p className="text-[11px] text-primary uppercase tracking-widest mb-1">Workouts</p>
        <h1 className="text-3xl md:text-4xl font-black text-text-primary">History</h1>
      </div>

      {(error || deleteError) && (
        <div className="flex items-center gap-3 p-4 mb-4 rounded-xl bg-red-900/20 border border-red-800/50 text-red-400 text-sm">
          <AlertCircle size={16} className="shrink-0" />
          <span>{deleteError || (error as Error).message || 'Failed to load history.'}</span>
        </div>
      )}

      {isLoading && (
        <div className="flex justify-center py-16">
          <Loader2 size={20} className="text-primary animate-spin" />
        </div>
      )}

      {!isLoading && !error && workouts.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-16 text-center text-text-muted">
          <Dumbbell size={28} className="opacity-30" />
          <p className="text-sm">No workouts yet. Finish a session and it will show up here.</p>
        </div>
      )}

      <div className="space-y-3">
        {workouts.slice(0, visible).map((w) => {
          const detail = details.get(w.id)
          const expanded = expandedId === w.id
          const time = fmtTime(w.endedAt)
          const setCount = detail?.exercises.reduce((n, e) => n + e.sets.length, 0) ?? 0
          return (
            <div key={w.id} className="rounded-xl border border-border bg-surface overflow-hidden">
              <div className="flex items-stretch">
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : w.id)}
                  aria-expanded={expanded}
                  className="flex-1 min-w-0 text-left px-4 py-3 min-h-14"
                >
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <p className="font-semibold text-text-primary">{w.label}</p>
                    <p className="text-xs text-text-secondary">
                      {fmtDateLong(w.date)}
                      {time ? ` · ${time}` : ''}
                    </p>
                  </div>
                  <p className="text-xs text-text-secondary mt-1">
                    {w.durationMins != null && w.durationMins > 0 ? `${w.durationMins} min` : '—'}
                    {detail
                      ? ` · ${pluralize(detail.exercises.length, 'exercise')} · ${pluralize(setCount, 'set')} · ${formatVolume(detail.volumeKg, units)}`
                      : ''}
                    {detail?.feel != null ? ` · Feel ${detail.feel}/5` : ''}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : w.id)}
                  aria-label={expanded ? 'Collapse workout' : 'Expand workout'}
                  className="min-w-11 flex items-center justify-center text-text-muted"
                >
                  <ChevronDown size={16} className={cn('transition-transform', expanded && 'rotate-180')} />
                </button>
                <button
                  type="button"
                  onClick={() => setPendingDelete(w)}
                  aria-label={`Delete ${w.label} on ${fmtDateLong(w.date)}`}
                  className="min-w-11 flex items-center justify-center text-text-muted hover:text-red-400 border-l border-border"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              {expanded && (
                <div className="border-t border-border px-4 py-3 space-y-3">
                  {detail?.note && <p className="text-xs text-text-secondary">{detail.note}</p>}
                  {detail && detail.exercises.length > 0 ? (
                    detail.exercises.map((ex, i) => (
                      <div key={`${ex.name}-${i}`}>
                        <p className="text-sm font-semibold text-text-primary">{ex.name}</p>
                        <p className="text-xs text-text-secondary mt-0.5 tabular-nums">
                          {ex.sets
                            .map((s) => `${formatWeight(s.weight, units, { step })} × ${s.reps ?? '—'}`)
                            .join(' · ')}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-text-muted">No sets recorded.</p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {workouts.length > visible && (
        <Button
          variant="secondary"
          size="lg"
          className="w-full mt-4 min-h-11"
          onClick={() => setVisible((v) => v + PAGE_SIZE)}
        >
          Show more
        </Button>
      )}

      <BottomSheet
        open={Boolean(pendingDelete)}
        onClose={() => {
          if (!deleting) setPendingDelete(null)
        }}
        title="Delete workout"
      >
        <div className="p-4 space-y-4">
          <p className="text-sm text-text-secondary">
            Remove this workout and all of its sets? This cannot be undone.
          </p>
          {pendingDelete && (
            <p className="text-sm font-semibold text-text-primary rounded-xl border border-border bg-surface-2 px-3 py-3">
              {pendingDelete.label} · {fmtDateLong(pendingDelete.date)}
              {fmtTime(pendingDelete.endedAt) ? ` · ${fmtTime(pendingDelete.endedAt)}` : ''}
            </p>
          )}
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
              {deleting ? <Loader2 size={16} className="animate-spin" /> : 'Delete workout'}
            </Button>
          </div>
        </div>
      </BottomSheet>
    </div>
  )
}
