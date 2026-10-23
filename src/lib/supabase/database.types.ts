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
  /** Workout type chip label (Push, Pull, …). Prefer this over name. */
  workout_type: string | null
  date: string
  started_at: string | null
  ended_at: string | null
  warmup_started_at: string | null
  warmup_ended_at: string | null
  warmup_note: string | null
  feel: number | null
  note: string | null
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
  /** Comma-separated aliases ("back squat, barbell squat") searched alongside `name`. */
  search_terms: string | null
  slug: string | null
  category: string | null
  source: 'curated' | 'legacy' | 'custom' | null
  is_hidden: boolean
  is_custom: boolean
  created_by: string | null
  created_at: string
}

export type WorkoutExerciseTarget = 'maintain' | 'increase_weight' | 'increase_reps'

export interface WorkoutExerciseRow {
  id: string
  workout_id: string
  exercise_id: string
  order_index: number
  target: WorkoutExerciseTarget | null
  note: string | null
}

export interface SetRow {
  id: string
  workout_exercise_id: string
  set_index: number
  reps: number | null
  weight: number | null
  /** Legacy column — kept in sync with `failed`. */
  to_failure: boolean
  failed: boolean
  completed_at: string | null
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
  updated_at: string
}

export interface MuscleSorenessRow {
  id: string
  feedback_id: string
  muscle_group: string
  level: number | null
}

export type WeightUnits = 'kg' | 'lb'

export interface UserSettingsRow {
  user_id: string
  workout_types: string[]
  reminder_morning_weight_enabled: boolean
  reminder_morning_weight_time: string | null
  reminder_night_recovery_enabled: boolean
  reminder_night_recovery_time: string | null
  reminder_workout_enabled: boolean
  reminder_workout_time: string | null
  reminder_workout_days: number[]
  rest_timer_seconds: number
  weight_step: number
  units: WeightUnits
  /** IANA timezone; reminder times are wall-clock in this zone */
  timezone: string
  created_at: string
  updated_at: string
}

export interface PushSubscriptionRow {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  user_agent: string | null
  created_at: string
  updated_at: string
}
