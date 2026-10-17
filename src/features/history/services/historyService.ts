import { supabase } from '../../../lib/supabase/client'
import { toServiceError } from '../../../lib/supabase/errors'
import { isCompletedSet, totalVolumeKg } from '../../workout/lib/volume'
import { deriveDayWorkoutSummary } from '../lib/deriveDayWorkoutSummary'
import type { DailyLogEntry, ExerciseHistory, ExerciseHistorySession } from '../types'

// ---------------------------------------------------------------------------
// Daily Logs
// ---------------------------------------------------------------------------

type WorkoutDayRow = {
  name: string | null
  workout_type?: string | null
  date: string
  created_at: string
  started_at: string | null
  ended_at: string
}

export async function getDailyLogs(userId: string): Promise<DailyLogEntry[]> {
  // Fetch daily logs and completed workouts in parallel
  const [logsResult, workoutsResult] = await Promise.all([
    supabase
      .from('daily_logs')
      .select('id, date, weight, calories, protein, sleep, notes')
      .eq('user_id', userId)
      .order('date', { ascending: false }),
    supabase
      .from('workouts')
      .select('name, workout_type, date, created_at, started_at, ended_at')
      .eq('user_id', userId)
      .not('ended_at', 'is', null),
  ])

  if (logsResult.error) throw toServiceError(logsResult.error)

  let workoutRows = (workoutsResult.data ?? []) as WorkoutDayRow[]
  // Pre-migration: workout_type may be missing from schema cache
  if (workoutsResult.error) {
    const legacy = await supabase
      .from('workouts')
      .select('name, date, created_at, started_at, ended_at')
      .eq('user_id', userId)
      .not('ended_at', 'is', null)
    if (legacy.error) throw toServiceError(legacy.error)
    workoutRows = (legacy.data ?? []) as WorkoutDayRow[]
  }

  const workoutsByDate = new Map<string, WorkoutDayRow[]>()
  for (const w of workoutRows) {
    const list = workoutsByDate.get(w.date) ?? []
    list.push(w)
    workoutsByDate.set(w.date, list)
  }

  const logByDate = new Map<
    string,
    {
      id: string
      weight: number | null
      calories: number | null
      protein: number | null
      sleep: number | null
      notes: string | null
    }
  >()

  for (const row of logsResult.data ?? []) {
    logByDate.set(row.date as string, {
      id: row.id as string,
      weight: row.weight as number | null,
      calories: row.calories as number | null,
      protein: row.protein as number | null,
      sleep: row.sleep as number | null,
      notes: row.notes as string | null,
    })
  }

  // Union of log dates + workout dates so multi-workout days always appear
  const allDates = new Set<string>([...logByDate.keys(), ...workoutsByDate.keys()])
  const dates = [...allDates].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))

  return dates.map((date) => {
    const log = logByDate.get(date)
    const dayWorkouts = workoutsByDate.get(date) ?? []
    const summary = deriveDayWorkoutSummary(dayWorkouts)

    return {
      id: log?.id ?? `workout-day-${date}`,
      date,
      weight: log?.weight ?? null,
      calories: log?.calories ?? null,
      protein: log?.protein ?? null,
      sleep: log?.sleep ?? null,
      notes: log?.notes ?? null,
      workoutType: summary.typeLabel,
      workoutDurationMins: summary.count > 0 ? summary.durationMins : null,
      workoutCount: summary.count,
    }
  })
}

// ---------------------------------------------------------------------------
// Exercise History
// ---------------------------------------------------------------------------

type RawWorkoutExerciseRow = {
  exercise_id: string
  exercises: { id: string; name: string; muscle_group: string } | { id: string; name: string; muscle_group: string }[] | null
  sets: Array<{
    weight: number | null
    reps: number | null
    set_index: number | null
  }> | null
  workouts: { date: string } | { date: string }[] | null
}

export async function getExerciseHistory(userId: string): Promise<ExerciseHistory[]> {
  const { data, error } = await supabase
    .from('workout_exercises')
    .select(`
      exercise_id,
      exercises ( id, name, muscle_group ),
      sets ( weight, reps, set_index ),
      workouts!inner ( date, user_id, ended_at )
    `)
    .eq('workouts.user_id', userId)
    .not('workouts.ended_at', 'is', null)
    .order('date', { ascending: false, foreignTable: 'workouts' })

  if (error) throw toServiceError(error)

  const exerciseMap = new Map<
    string,
    { name: string; muscleGroup: string; sessions: Map<string, ExerciseHistorySession> }
  >()

  for (const row of (data ?? []) as unknown as RawWorkoutExerciseRow[]) {
    const exercisesField = row.exercises
    const exercise = Array.isArray(exercisesField) ? exercisesField[0] : exercisesField
    if (!exercise) continue

    const workoutsField = row.workouts
    const workout = Array.isArray(workoutsField) ? workoutsField[0] : workoutsField
    const date = workout?.date ?? null
    if (!date) continue

    if (!exerciseMap.has(row.exercise_id)) {
      exerciseMap.set(row.exercise_id, {
        name: exercise.name,
        muscleGroup: exercise.muscle_group,
        sessions: new Map(),
      })
    }

    const entry = exerciseMap.get(row.exercise_id)!

    const sets = (row.sets ?? [])
      .filter(isCompletedSet)
      .sort((a, b) => (a.set_index ?? 0) - (b.set_index ?? 0))

    if (sets.length === 0) continue

    const totalVolume = totalVolumeKg(sets)
    const allTimeBestWeight = Math.max(0, ...sets.map((s) => s.weight ?? 0))

    if (!entry.sessions.has(date)) {
      entry.sessions.set(date, {
        date,
        totalVolume,
        sets: sets.map((s) => ({ weight: s.weight, reps: s.reps })),
      })
    } else {
      const existing = entry.sessions.get(date)!
      existing.sets.push(...sets.map((s) => ({ weight: s.weight, reps: s.reps })))
      existing.totalVolume += totalVolume
      void allTimeBestWeight
    }
  }

  const result: ExerciseHistory[] = []
  for (const [exerciseId, entry] of exerciseMap.entries()) {
    const sessions = Array.from(entry.sessions.values()).sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    )

    const allTimeBest =
      sessions.length > 0
        ? Math.max(...sessions.flatMap((s) => s.sets.map((set) => set.weight ?? 0)))
        : null

    result.push({
      exerciseId,
      exerciseName: entry.name,
      muscleGroup: entry.muscleGroup,
      allTimeBest: allTimeBest !== null && allTimeBest > 0 ? allTimeBest : null,
      sessions,
    })
  }

  result.sort((a, b) => a.exerciseName.localeCompare(b.exerciseName))

  return result
}
