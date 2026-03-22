// ---------------------------------------------------------------------------
// Daily Logs
// ---------------------------------------------------------------------------

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
}

// ---------------------------------------------------------------------------
// Exercise History
// ---------------------------------------------------------------------------

export interface SetRecord {
  weight: number | null
  reps: number | null
}

export interface ExerciseHistorySession {
  date: string         // "YYYY-MM-DD"
  totalVolume: number
  sets: SetRecord[]
}

export interface ExerciseHistory {
  exerciseId: string
  exerciseName: string
  muscleGroup: string
  allTimeBest: number | null  // highest weight ever lifted (kg)
  sessions: ExerciseHistorySession[]
}
