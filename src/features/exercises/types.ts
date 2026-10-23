export interface Exercise {
  id: string
  name: string
  muscleGroup: string
  equipment: string | null
  difficulty: string | null
  exerciseType: string | null
  instructions: string | null
  category: string | null
  searchTerms: string | null
  isHidden: boolean
  isCustom: boolean
  createdBy: string | null
  createdAt: string
}

export type ExerciseCategory =
  | 'All'
  | 'Chest'
  | 'Back'
  | 'Legs'
  | 'Shoulders'
  | 'Arms'
  | 'Core'
  | 'Cardio'
