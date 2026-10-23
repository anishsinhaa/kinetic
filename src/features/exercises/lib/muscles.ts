export type MuscleCategory =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'legs'
  | 'core'
  | 'full_body'
  | 'other'

export const CATEGORY_LABELS: Record<MuscleCategory, string> = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  legs: 'Legs',
  core: 'Core',
  full_body: 'Full body',
  other: 'Other',
}

export const CATEGORY_CHIPS: MuscleCategory[] = [
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'legs',
  'core',
  'forearms',
  'full_body',
]

export const MUSCLE_OPTIONS: Array<{ muscle: string; category: MuscleCategory }> = [
  { muscle: 'Chest', category: 'chest' },
  { muscle: 'Upper Chest', category: 'chest' },
  { muscle: 'Lower Chest', category: 'chest' },
  { muscle: 'Lats', category: 'back' },
  { muscle: 'Upper Back', category: 'back' },
  { muscle: 'Middle Back', category: 'back' },
  { muscle: 'Lower Back', category: 'back' },
  { muscle: 'Traps', category: 'back' },
  { muscle: 'Front Delts', category: 'shoulders' },
  { muscle: 'Side Delts', category: 'shoulders' },
  { muscle: 'Rear Delts', category: 'shoulders' },
  { muscle: 'Biceps', category: 'biceps' },
  { muscle: 'Brachialis', category: 'biceps' },
  { muscle: 'Triceps', category: 'triceps' },
  { muscle: 'Forearms', category: 'forearms' },
  { muscle: 'Quads', category: 'legs' },
  { muscle: 'Hamstrings', category: 'legs' },
  { muscle: 'Glutes', category: 'legs' },
  { muscle: 'Calves', category: 'legs' },
  { muscle: 'Adductors', category: 'legs' },
  { muscle: 'Abductors', category: 'legs' },
  { muscle: 'Abs', category: 'core' },
  { muscle: 'Obliques', category: 'core' },
  { muscle: 'Full Body', category: 'full_body' },
]

const CATEGORY_SET = new Set<string>(Object.keys(CATEGORY_LABELS))

export function categoryForMuscle(muscle: string): MuscleCategory {
  const key = muscle.trim().toLowerCase()
  const found = MUSCLE_OPTIONS.find((option) => option.muscle.toLowerCase() === key)
  return found?.category ?? 'other'
}

export function exerciseCategory(ex: {
  category?: string | null
  muscleGroup: string
}): MuscleCategory {
  if (ex.category && CATEGORY_SET.has(ex.category)) return ex.category as MuscleCategory
  return categoryForMuscle(ex.muscleGroup)
}
