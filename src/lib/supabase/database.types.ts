/**
 * Raw row types that mirror the Supabase database schema exactly.
 * These are low-level and should only be used inside service files.
 * UI code should use the domain types in each feature's types.ts instead.
 */

export interface ProfileRow {
  id: string
  display_name: string | null
  avatar_url: string | null
  unit_system: 'metric' | 'imperial'
  created_at: string
  updated_at: string
}

export interface DailyLogRow {
  id: string
  user_id: string
  date: string           // ISO date string "YYYY-MM-DD"
  weight: number | null
  calories: number | null
  protein: number | null
  sleep: number | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface WorkoutRow {
  id: string
  user_id: string
  name: string
  date: string
  started_at: string | null
  ended_at: string | null
  created_at: string
}

export interface ExerciseRow {
  id: string
  name: string
  muscle_group: string
  equipment: string | null
  difficulty: string | null
  exercise_type: string | null
  instructions: string | null
  is_custom: boolean
  created_by: string | null
  created_at: string
}

export interface WorkoutExerciseRow {
  id: string
  workout_id: string
  exercise_id: string
  order_index: number
}

export interface SetRow {
  id: string
  workout_exercise_id: string
  set_index: number
  reps: number | null
  weight: number | null
  to_failure: boolean
  created_at: string
}

export interface BodyFeedbackRow {
  id: string
  user_id: string
  date: string
  fatigue: number | null
  sleep_quality: number | null
  pain_flag: boolean
  created_at: string
}

export interface MuscleSorenessRow {
  id: string
  feedback_id: string
  muscle_group: string
  level: number | null
}
