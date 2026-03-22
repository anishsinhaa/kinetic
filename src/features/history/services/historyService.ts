import { supabase } from '../../../lib/supabase/client'
import { toServiceError } from '../../../lib/supabase/errors'
import type { DailyLogEntry, ExerciseHistory, ExerciseHistorySession } from '../types'

// ---------------------------------------------------------------------------
// Daily Logs
// ---------------------------------------------------------------------------

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
      .select('name, date, created_at, ended_at')
      .eq('user_id', userId)
      .not('ended_at', 'is', null),
  ])

  if (logsResult.error) throw toServiceError(logsResult.error)
  if (workoutsResult.error) throw toServiceError(workoutsResult.error)

  // Build a date → workouts map for O(1) join
  type WorkoutRow = { name: string | null; date: string; created_at: string; ended_at: string }
  const workoutsByDate = new Map<string, WorkoutRow[]>()
  for (const w of (workoutsResult.data ?? []) as WorkoutRow[]) {
    const list = workoutsByDate.get(w.date) ?? []
    list.push(w)
    workoutsByDate.set(w.date, list)
  }

  return (logsResult.data ?? []).map((row) => {
    const dayWorkouts = workoutsByDate.get(row.date as string) ?? []

    // Sum duration across all workouts that day
    const totalDurationMins = dayWorkouts.reduce((sum, w) => {
      if (!w.ended_at || !w.created_at) return sum
      const mins = Math.round(
        (new Date(w.ended_at).getTime() - new Date(w.created_at).getTime()) / 60000,
      )
      return sum + Math.max(0, mins)
    }, 0)

    // Pick label: prefer the first named workout, fall back to count
    const label =
      dayWorkouts.find((w) => w.name?.trim())?.name?.trim() ??
      (dayWorkouts.length > 1 ? `${dayWorkouts.length} workouts` : null)

    return {
      id: row.id as string,
      date: row.date as string,
      weight: row.weight as number | null,
      calories: row.calories as number | null,
      protein: row.protein as number | null,
      sleep: row.sleep as number | null,
      notes: row.notes as string | null,
      workoutType: label,
      workoutDurationMins: dayWorkouts.length > 0 ? totalDurationMins : null,
      workoutCount: dayWorkouts.length,
    }
  })
}

// ---------------------------------------------------------------------------
// Exercise History
// ---------------------------------------------------------------------------

type RawWorkoutExerciseRow = {
  exercise_id: string
  exercises: { id: string; name: string; muscle_group: string } | { id: string; name: string; muscle_group: string }[] | null
  sets: Array<{ weight: number | null; reps: number | null; set_index: number | null }> | null
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

  // Group by exercise_id
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

    // Each workout_exercise row is one session entry for that date
    const sets = (row.sets ?? [])
      .filter((s) => s.reps != null || s.weight != null)
      .sort((a, b) => (a.set_index ?? 0) - (b.set_index ?? 0))

    if (sets.length === 0) continue

    const totalVolume = sets.reduce(
      (sum, s) => sum + (s.weight ?? 0) * (s.reps ?? 0),
      0,
    )
    const allTimeBestWeight = Math.max(0, ...sets.map((s) => s.weight ?? 0))

    // Use date as key to group multiple workout_exercises from the same workout
    if (!entry.sessions.has(date)) {
      entry.sessions.set(date, {
        date,
        totalVolume,
        sets: sets.map((s) => ({ weight: s.weight, reps: s.reps })),
      })
    } else {
      // Merge sets and re-sum volume if somehow the same exercise appears twice in a workout
      const existing = entry.sessions.get(date)!
      existing.sets.push(...sets.map((s) => ({ weight: s.weight, reps: s.reps })))
      existing.totalVolume += totalVolume
      // suppress unused warning
      void allTimeBestWeight
    }
  }

  // Convert map to sorted array
  const result: ExerciseHistory[] = []
  for (const [exerciseId, entry] of exerciseMap.entries()) {
    const sessions = Array.from(entry.sessions.values()).sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    )

    const allTimeBest =
      sessions.length > 0
        ? Math.max(
            ...sessions.flatMap((s) => s.sets.map((set) => set.weight ?? 0)),
          )
        : null

    result.push({
      exerciseId,
      exerciseName: entry.name,
      muscleGroup: entry.muscleGroup,
      allTimeBest: allTimeBest !== null && allTimeBest > 0 ? allTimeBest : null,
      sessions,
    })
  }

  // Sort exercises alphabetically
  result.sort((a, b) => a.exerciseName.localeCompare(b.exerciseName))

  return result
}
