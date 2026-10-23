import type { WorkoutExerciseTarget, WorkoutRow } from '../../lib/supabase/database.types'

// Warmup is an optional card inside the training view, not a phase. 'type' / 'warmup'
// values persisted by older builds are coerced on rehydrate (see the store's merge).
export type WorkoutPhase = 'idle' | 'training' | 'summary'

export interface WorkoutSetDraft {
  id: string
  dbSetId?: string
  reps: string
  weight: string
  toFailure: boolean
  completed: boolean
  completedAt?: string | null
}

export type ExercisePrefillStatus = 'pending' | 'ready'

export interface WorkoutExerciseDraft {
  id: string
  dbWorkoutExerciseId?: string
  exerciseId: string
  name: string
  muscleGroup?: string
  lastPerformance?: string
  personalRecord?: string
  targetLabel?: string
  target?: WorkoutExerciseTarget | null
  note?: string | null
  /** Blocks set edits until last-session prefill resolves (or is skipped). */
  prefillStatus?: ExercisePrefillStatus
  /** User marked the exercise finished for this session. Sets stay visible. */
  done?: boolean
  sets: WorkoutSetDraft[]
}

export interface WorkoutDraft {
  workoutId: string | null
  userId: string
  date: string
  exercises: WorkoutExerciseDraft[]
}

export interface CreateWorkoutInput {
  userId: string
  date: string
  workoutType?: string
}

export interface AddSetInput {
  reps: number | null
  weight: number | null
  to_failure: boolean
  set_index?: number
  failed?: boolean
  completed_at?: string | null
}

export interface UpdateWorkoutMetaInput {
  workout_type?: string | null
  name?: string | null
  warmup_started_at?: string | null
  warmup_ended_at?: string | null
  warmup_note?: string | null
  feel?: number | null
  note?: string | null
}

export type { WorkoutExerciseTarget, WorkoutRow }
