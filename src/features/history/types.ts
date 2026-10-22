// ---------------------------------------------------------------------------
// Daily Logs
// ---------------------------------------------------------------------------

export interface HistoryDayWorkout {
  id: string
  label: string | null
  durationMins: number | null
  /** ISO timestamp when the workout ended (for delete labels). */
  endedAt: string | null
}

export interface DailyLogEntry {
  id: string
  date: string         // "YYYY-MM-DD"
  weight: number | null
  calories: number | null
  protein: number | null
  sleep: number | null
  notes: string | null
  // Workout data for the same date (joined from workouts table)
  workoutType: string | null      // label, e.g. "Push", "Upper Body"
  workoutDurationMins: number | null
  workoutCount: number            // 0 = rest day
  /** Feel scores from workouts that day (1–5), most recent last */
  workoutFeels: number[]
  /** Notes from workouts that day */
  workoutNotes: string[]
  /** Completed workouts that day (for delete / detail) */
  workouts: HistoryDayWorkout[]
}

// ---------------------------------------------------------------------------
// Exercise History
// ---------------------------------------------------------------------------

export interface SetRecord {
  weight: number | null
  reps: number | null
}

export interface ExerciseHistorySession {
  /** Workout session id — same-day sessions stay separate */
  workoutId: string
  date: string         // "YYYY-MM-DD"
  totalVolume: number
  sets: SetRecord[]
  feel: number | null
  note: string | null
  /** workout_exercises.order_index — session order inside that workout */
  orderIndex?: number
}

export interface ExerciseHistory {
  exerciseId: string
  exerciseName: string
  muscleGroup: string
  /** Highest weight (kg) among completed sets — same PR rules as finish summary */
  allTimeBest: number | null
  allTimeBestReps: number | null
  sessions: ExerciseHistorySession[]
}
