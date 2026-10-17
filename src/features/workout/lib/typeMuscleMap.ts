/**
 * Muscle groups (library labels) preferred for each workout type.
 * Used to filter the in-workout exercise picker.
 */
export const TYPE_MUSCLE_MAP: Record<string, string[]> = {
  Push: ['Chest', 'Triceps', 'Shoulders', 'Traps'],
  Pull: ['Lats', 'Middle Back', 'Lower Back', 'Biceps', 'Forearms', 'Traps'],
  Legs: ['Quadriceps', 'Hamstrings', 'Glutes', 'Calves', 'Abductors', 'Adductors'],
  Upper: [
    'Chest',
    'Lats',
    'Middle Back',
    'Lower Back',
    'Biceps',
    'Triceps',
    'Shoulders',
    'Traps',
    'Forearms',
  ],
  Lower: ['Quadriceps', 'Hamstrings', 'Glutes', 'Calves', 'Abductors', 'Adductors'],
  'Full Body': [],
  Mixed: [],
  Cardio: [],
  Free: [],
}

export function musclesForWorkoutType(type: string): string[] | null {
  const key = Object.keys(TYPE_MUSCLE_MAP).find((k) => k.toLowerCase() === type.trim().toLowerCase())
  if (!key) return null
  const muscles = TYPE_MUSCLE_MAP[key]
  // Empty array = no filter (show all)
  if (!muscles || muscles.length === 0) return null
  return muscles
}
