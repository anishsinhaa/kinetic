import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { BottomSheet } from '../../../components/ui/BottomSheet'
import { Button } from '../../../components/ui/Button'
import type { BodyFeedback } from '../../feedback/types'
import { recoveryLabel, recoveryScoreFromFeedback } from '../../feedback/types'
import { deriveDayWorkoutSummary } from '../../history/lib/deriveDayWorkoutSummary'
import { useWeightDisplay } from '../../settings/hooks/useWeightUnits'
import { formatWeight } from '../../settings/lib/units'
import { localDateString } from '../../../lib/localDate'
import { pluralize } from '../../../lib/pluralize'
import { cn } from '../../../lib/utils'
import { useRestDay } from '../hooks/useRestDays'
import { useMonthOverview } from '../hooks/useMonthOverview'
import type { MonthLog, MonthWorkout } from '../services/calendarService'

/** Placeholder for logging a workout onto a past day. */
export const SHOW_LOG_PAST = false

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

type MonthCalendarProps = {
  userId: string
  feedback: BodyFeedback[]
  onEditLog: (date: string) => void
  onOpenRecovery: (date: string) => void
}

function fmtSleep(v: number): string {
  const h = Math.floor(v)
  const m = Math.round((v - h) * 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function fmtSheetTitle(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function abbreviateType(typeLabel: string | null): string {
  const raw = (typeLabel ?? '').trim()
  if (!raw) return 'Workout'
  const first = raw.split(/\s+/)[0] ?? raw
  return first.slice(0, 5)
}

function DaySheetBody({
  date,
  workouts,
  log,
  feedback,
  onEditLog,
  onOpenRecovery,
  onClose,
}: {
  date: string
  workouts: MonthWorkout[]
  log: MonthLog | null
  feedback: BodyFeedback | null
  onEditLog: (date: string) => void
  onOpenRecovery: (date: string) => void
  onClose: () => void
}) {
  const navigate = useNavigate()
  const { units } = useWeightDisplay()
  const { isRestDay, toggle, isSaving } = useRestDay(date)
  const score = feedback ? recoveryScoreFromFeedback(feedback) : null
  const hasWorkout = workouts.length > 0

  return (
    <div className="space-y-4">
      {workouts.map((workout) => (
        <button
          key={workout.id}
          type="button"
          className="w-full min-h-11 text-left"
          onClick={() => {
            onClose()
            navigate(`/progress/history?w=${workout.id}`)
          }}
        >
          <p className="font-semibold text-text-primary">{workout.label || 'Workout'}</p>
          <p className="text-xs text-text-secondary">
            {pluralize(workout.exerciseCount, 'exercise')} · {pluralize(workout.setCount, 'set')}
            {workout.durationMins != null ? ` · ${workout.durationMins}m` : ''}
          </p>
        </button>
      ))}

      {log ? (
        <div className="space-y-1 text-sm text-text-primary">
          {log.weight != null && <p>Weight {formatWeight(log.weight, units, { decimals: 1 })}</p>}
          {log.calories != null && <p>Calories {log.calories.toLocaleString()} kcal</p>}
          {log.protein != null && <p>Protein {log.protein} g</p>}
          {log.sleep != null && <p>Sleep {fmtSleep(log.sleep)}</p>}
          {log.notes && <p>Notes {log.notes}</p>}
        </div>
      ) : (
        <p className="text-sm text-text-muted">Nothing logged</p>
      )}

      {feedback && (
        <p className="text-sm text-text-primary">
          Recovery
          {score != null ? ` · ${score}% ${recoveryLabel(score)}` : ''}
        </p>
      )}

      <button
        type="button"
        className="min-h-11 text-sm text-primary"
        onClick={() => {
          onClose()
          onOpenRecovery(date)
        }}
      >
        {feedback ? 'Edit recovery' : 'Add recovery update'}
      </button>

      <button
        type="button"
        className="block min-h-11 text-sm text-primary"
        onClick={() => {
          onClose()
          onEditLog(date)
        }}
      >
        {log ? 'Edit daily log' : 'Add daily log'}
      </button>

      {!hasWorkout && (
        <button
          type="button"
          className="block min-h-11 text-sm text-primary"
          onClick={() => toggle()}
          disabled={isSaving}
        >
          {isRestDay ? 'Undo rest day' : 'Mark rest day'}
        </button>
      )}

      {SHOW_LOG_PAST && <Button disabled>Log workout for this day</Button>}
    </div>
  )
}

export function MonthCalendar({ userId, feedback, onEditLog, onOpenRecovery }: MonthCalendarProps) {
  const today = localDateString()
  const [view, setView] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const overview = useMonthOverview(view.year, view.month)
  const restDates = useMemo(() => new Set(overview.data?.restDates ?? []), [overview.data?.restDates])

  const workoutsByDate = useMemo(() => {
    const byDate = new Map<string, MonthWorkout[]>()
    for (const workout of overview.data?.workouts ?? []) {
      const list = byDate.get(workout.date)
      if (list) list.push(workout)
      else byDate.set(workout.date, [workout])
    }
    return byDate
  }, [overview.data?.workouts])

  const logByDate = useMemo(() => {
    const byDate = new Map<string, MonthLog>()
    for (const log of overview.data?.logs ?? []) {
      if (!byDate.has(log.date)) byDate.set(log.date, log)
    }
    return byDate
  }, [overview.data?.logs])

  const now = new Date()
  const onCurrentMonth = view.year === now.getFullYear() && view.month === now.getMonth()
  const title = new Date(view.year, view.month, 1).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  })

  const firstWeekday = new Date(view.year, view.month, 1).getDay()
  const leadingBlanks = (firstWeekday + 6) % 7
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate()

  const selectedWorkouts = selectedDate ? (workoutsByDate.get(selectedDate) ?? []) : []
  const selectedLog = selectedDate ? (logByDate.get(selectedDate) ?? null) : null
  const selectedFeedback = selectedDate ? (feedback.find((row) => row.date === selectedDate) ?? null) : null

  const closeSheet = () => setSelectedDate(null)

  return (
    <section className="mb-6" data-user={userId}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <button
          type="button"
          aria-label="Previous month"
          className="min-h-11 min-w-11 inline-flex items-center justify-center text-text-primary"
          onClick={() => {
            const prev = new Date(view.year, view.month - 1, 1)
            setView({ year: prev.getFullYear(), month: prev.getMonth() })
          }}
        >
          <ChevronLeft size={18} />
        </button>
        <h2 className="text-base font-semibold text-text-primary">{title}</h2>
        <button
          type="button"
          aria-label="Next month"
          className="min-h-11 min-w-11 inline-flex items-center justify-center text-text-primary disabled:opacity-40"
          disabled={onCurrentMonth}
          onClick={() => {
            if (onCurrentMonth) return
            const next = new Date(view.year, view.month + 1, 1)
            setView({ year: next.getFullYear(), month: next.getMonth() })
          }}
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((day) => (
          <div key={day} className="text-center text-[11px] text-text-muted">
            {day}
          </div>
        ))}
        {Array.from({ length: leadingBlanks }, (_, index) => (
          <div key={`blank-${index}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, index) => {
          const day = index + 1
          const date = localDateString(new Date(view.year, view.month, day))
          const isFuture = date > today
          const isToday = date === today
          const dayWorkouts = workoutsByDate.get(date) ?? []
          let marker: string | null = null
          let markerClass = 'text-text-muted'
          if (dayWorkouts.length > 0) {
            const summary = deriveDayWorkoutSummary(
              dayWorkouts.map((workout) => ({
                workout_type: workout.label || null,
                name: null,
                started_at: workout.startedAt,
                created_at: workout.startedAt ?? workout.endedAt ?? date,
                ended_at: workout.endedAt ?? workout.startedAt ?? date,
              })),
            )
            marker = abbreviateType(summary.typeLabel)
            markerClass = 'text-primary'
          } else if (restDates.has(date)) {
            marker = 'Rest'
          } else if (logByDate.has(date)) {
            marker = '·'
          }

          return (
            <button
              key={date}
              type="button"
              disabled={isFuture}
              onClick={() => setSelectedDate(date)}
              className={cn(
                'min-h-11 flex flex-col items-center justify-center rounded-lg text-sm tabular-nums text-text-primary',
                isToday && 'ring-2 ring-primary',
                isFuture && 'opacity-40',
              )}
            >
              <span>{day}</span>
              <span className={cn('h-3 max-w-full truncate text-[10px] leading-none', markerClass)}>
                {marker === '·' ? <span className="inline-block h-1.5 w-1.5 rounded-full bg-text-muted" /> : marker}
              </span>
            </button>
          )
        })}
      </div>

      <BottomSheet open={selectedDate != null} onClose={closeSheet} title={selectedDate ? fmtSheetTitle(selectedDate) : undefined}>
        {selectedDate && (
          <DaySheetBody
            date={selectedDate}
            workouts={selectedWorkouts}
            log={selectedLog}
            feedback={selectedFeedback}
            onEditLog={onEditLog}
            onOpenRecovery={onOpenRecovery}
            onClose={closeSheet}
          />
        )}
      </BottomSheet>
    </section>
  )
}
