export interface WorkoutSetDraft {
  id: string
  dbSetId?: string
  reps: string
  weight: string
  toFailure: boolean
}

export interface WorkoutExerciseDraft {
  id: string
  dbWorkoutExerciseId?: string
  exerciseId: string
  name: string
  muscleGroup?: string
  lastPerformance?: string
  personalRecord?: string
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
}

export interface AddSetInput {
  reps: number | null
  weight: number | null
  to_failure: boolean
  set_index?: number
}
