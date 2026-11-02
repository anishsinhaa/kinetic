import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Pencil } from 'lucide-react'
import { BottomSheet } from '../../../components/ui/BottomSheet'
import type { BodyFeedback } from '../../feedback/types'
import { recoveryLabel, recoveryScoreFromFeedback } from '../../feedback/types'
import { useWeightDisplay } from '../../settings/hooks/useWeightUnits'
import { formatWeight } from '../../settings/lib/units'
import { localDateString } from '../../../lib/localDate'
import { pluralize } from '../../../lib/pluralize'
import { cn } from '../../../lib/utils'
import { useRestDay } from '../hooks/useRestDays'
import { useMonthOverview } from '../hooks/useMonthOverview'
import type { MonthLog, MonthWorkout } from '../services/calendarService'

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
  const entries: { label: string; value: string }[] = []
  if (log?.weight != null) {
    entries.push({ label: 'Weight', value: formatWeight(log.weight, units, { decimals: 1 }) })
  }
  if (log?.calories != null) {
    entries.push({ label: 'Calories', value: `${log.calories.toLocaleString()} kcal` })
  }
  if (log?.protein != null) {
    entries.push({ label: 'Protein', value: `${log.protein} g` })
  }
  if (log?.sleep != null) {
    entries.push({ label: 'Sleep', value: fmtSleep(log.sleep) })
  }
  if (feedback) {
    entries.push({
      label: 'Recovery',
      value: score != null ? `${score}% · ${recoveryLabel(score)}` : 'Logged',
    })
  }
  const notes = log?.notes ?? ''
  const showEmpty = entries.length === 0 && notes === '' && !hasWorkout && !isRestDay

  return (
    <div className="p-4 space-y-3">
      {workouts.map((workout) => (
        <div key={workout.id} className="flex items-stretch gap-2">
          <button
            type="button"
            className="flex-1 min-w-0 min-h-12 rounded-xl border border-border bg-surface-2 px-3 py-2 flex items-center justify-between gap-3 text-left"
            onClick={() => {
              onClose()
              navigate(`/progress/history?w=${workout.id}`)
            }}
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text-primary truncate">{workout.label || 'Workout'}</p>
              <p className="text-xs text-text-secondary">
                {pluralize(workout.exerciseCount, 'exercise')} · {pluralize(workout.setCount, 'set')}
                {workout.durationMins != null ? ` · ${workout.durationMins}m` : ''}
              </p>
            </div>
            <ChevronRight size={16} className="shrink-0 text-text-muted" />
          </button>
          <button
            type="button"
            aria-label={`Edit ${workout.label || 'workout'}`}
            onClick={() => {
              onClose()
              navigate(`/progress/history/${workout.id}/edit`)
            }}
            className="min-h-12 min-w-12 rounded-xl border border-border bg-surface-2 flex items-center justify-center text-text-secondary hover:text-primary"
          >
            <Pencil size={16} />
          </button>
        </div>
      ))}

      {isRestDay && !hasWorkout && (
        <span className="inline-flex rounded-full bg-surface-2 px-3 py-1 text-xs font-semibold text-text-secondary">
          Rest day
        </span>
      )}

      {entries.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {entries.map((entry) => (
            <div key={entry.label} className="rounded-lg bg-surface-2 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-text-muted">{entry.label}</p>
              <p className="text-sm font-semibold text-text-primary truncate">{entry.value}</p>
            </div>
          ))}
        </div>
      )}

      {notes !== '' && <p className="text-xs text-text-secondary line-clamp-2">{notes}</p>}

      {showEmpty && <p className="text-sm text-text-muted">Nothing logged yet</p>}

      <div className="grid grid-cols-2 gap-2 pt-1">
        <button
          type="button"
          className="min-h-11 rounded-xl border border-border px-2 text-sm font-medium text-text-primary hover:border-primary disabled:opacity-40"
          onClick={() => {
            onClose()
            onEditLog(date)
          }}
        >
          {log ? 'Edit log' : 'Add log'}
        </button>
        <button
          type="button"
          className="min-h-11 rounded-xl border border-border px-2 text-sm font-medium text-text-primary hover:border-primary disabled:opacity-40"
          onClick={() => {
            onClose()
            onOpenRecovery(date)
          }}
        >
          {feedback ? 'Edit recovery' : 'Add recovery'}
        </button>
        <button
          type="button"
          className={cn(
            'min-h-11 rounded-xl border border-border px-2 text-sm font-medium text-text-primary hover:border-primary disabled:opacity-40',
            hasWorkout && 'col-span-2',
          )}
          onClick={() => {
            onClose()
            navigate(`/workout/log?date=${date}`)
          }}
        >
          Add workout
        </button>
        {!hasWorkout && (
          <button
            type="button"
            className="min-h-11 rounded-xl border border-border px-2 text-sm font-medium text-text-primary hover:border-primary disabled:opacity-40"
            onClick={() => toggle()}
            disabled={isSaving}
          >
            {isRestDay ? 'Undo rest day' : 'Mark rest day'}
          </button>
        )}
      </div>
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
            const sorted = [...dayWorkouts].sort((a, b) =>
              (a.startedAt ?? a.endedAt ?? '').localeCompare(b.startedAt ?? b.endedAt ?? ''),
            )
            const first = abbreviateType(sorted[0]?.label || null)
            marker = sorted.length > 1 ? `${first}+${sorted.length - 1}` : first
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
              aria-label={`${fmtSheetTitle(date)}${marker && marker !== '·' ? `, ${marker}` : ''}`}
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
