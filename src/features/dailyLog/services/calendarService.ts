import { supabase } from '../../../lib/supabase/client'
import { listRestDays } from './restDayService'

export type MonthWorkout = {
  id: string
  date: string
  /** `workout_type`, or `name` when type is unset. */
  label: string
  startedAt: string | null
  endedAt: string | null
  durationMins: number | null
  exerciseCount: number
  setCount: number
}

export type MonthLog = {
  date: string
  weight: number | null
  calories: number | null
  protein: number | null
  sleep: number | null
  notes: string | null
}

type RawSet = { id?: string; completed_at?: string | null }
type RawExercise = { id?: string; sets?: RawSet[] | null }
type RawWorkout = {
  id: string
  name?: string | null
  workout_type?: string | null
  date: string
  created_at: string
  started_at?: string | null
  ended_at?: string | null
  workout_exercises?: RawExercise[] | null
}

type RawLog = {
  date: string
  weight: number | null
  calories: number | null
  protein: number | null
  sleep: number | null
  notes: string | null
}

function isMissingColumnError(error: { message?: string; code?: string; details?: string } | null): boolean {
  if (!error?.message && !error?.details) return false
  const blob = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase()
  return (
    blob.includes('schema cache') ||
    blob.includes('column') ||
    blob.includes('could not find') ||
    error.code === 'PGRST204'
  )
}

function wholeMinutes(
  startedAt: string | null | undefined,
  createdAt: string | null | undefined,
  endedAt: string | null | undefined,
): number | null {
  if (!endedAt) return null
  const start = startedAt || createdAt
  if (!start) return null
  const ms = new Date(endedAt).getTime() - new Date(start).getTime()
  if (!Number.isFinite(ms)) return null
  const minutes = Math.max(0, Math.round(ms / 60000))
  if (minutes < 1) return null
  return minutes
}

function mapWorkouts(rows: RawWorkout[], everySetCompleted: boolean): MonthWorkout[] {
  return rows.map((row) => {
    let exerciseCount = 0
    let setCount = 0
    for (const exercise of row.workout_exercises ?? []) {
      const sets = exercise.sets ?? []
      const completed = everySetCompleted
        ? sets.length
        : sets.filter((set) => set.completed_at != null && set.completed_at !== '').length
      if (completed > 0) exerciseCount += 1
      setCount += completed
    }
    return {
      id: row.id,
      date: row.date,
      label: (row.workout_type ?? row.name ?? '').trim(),
      startedAt: row.started_at ?? null,
      endedAt: row.ended_at ?? null,
      durationMins: wholeMinutes(row.started_at, row.created_at, row.ended_at),
      exerciseCount,
      setCount,
    }
  })
}

async function fetchMonthWorkouts(userId: string, from: string, to: string): Promise<MonthWorkout[]> {
  const v2Select =
    'id, name, workout_type, date, created_at, started_at, ended_at, workout_exercises ( id, sets ( id, completed_at ) )'
  const legacySelect =
    'id, name, date, created_at, started_at, ended_at, workout_exercises ( id, sets ( id ) )'

  try {
    const first = await supabase
      .from('workouts')
      .select(v2Select)
      .eq('user_id', userId)
      .not('ended_at', 'is', null)
      .gte('date', from)
      .lte('date', to)

    if (first.error && isMissingColumnError(first.error)) {
      const fallback = await supabase
        .from('workouts')
        .select(legacySelect)
        .eq('user_id', userId)
        .not('ended_at', 'is', null)
        .gte('date', from)
        .lte('date', to)
      if (fallback.error) {
        console.warn('[calendar] workouts', fallback.error.message)
        return []
      }
      return mapWorkouts((fallback.data ?? []) as RawWorkout[], true)
    }

    if (first.error) {
      console.warn('[calendar] workouts', first.error.message)
      return []
    }
    return mapWorkouts((first.data ?? []) as RawWorkout[], false)
  } catch (err) {
    console.warn('[calendar] workouts', err)
    return []
  }
}

async function fetchMonthLogs(userId: string, from: string, to: string): Promise<MonthLog[]> {
  try {
    const { data, error } = await supabase
      .from('daily_logs')
      .select('id, date, weight, calories, protein, sleep, notes')
      .eq('user_id', userId)
      .gte('date', from)
      .lte('date', to)
    if (error) {
      console.warn('[calendar] daily_logs', error.message)
      return []
    }
    return ((data ?? []) as RawLog[]).map((row) => ({
      date: row.date,
      weight: row.weight == null ? null : Number(row.weight),
      calories: row.calories == null ? null : Number(row.calories),
      protein: row.protein == null ? null : Number(row.protein),
      sleep: row.sleep == null ? null : Number(row.sleep),
      notes: row.notes ?? null,
    }))
  } catch (err) {
    console.warn('[calendar] daily_logs', err)
    return []
  }
}

/** Inclusive local-date window. Never throws — a failed query becomes an empty list. */
export async function getMonthOverview(
  userId: string,
  from: string,
  to: string,
): Promise<{ workouts: MonthWorkout[]; logs: MonthLog[]; restDates: string[] }> {
  const [workouts, logs, restDates] = await Promise.all([
    fetchMonthWorkouts(userId, from, to),
    fetchMonthLogs(userId, from, to),
    listRestDays(userId, { from, to }),
  ])
  return { workouts, logs, restDates }
}
