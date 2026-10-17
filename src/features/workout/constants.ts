/** Default workout type chips (custom types live in user_settings). */
export const DEFAULT_WORKOUT_TYPES = [
  'Push',
  'Pull',
  'Legs',
  'Upper',
  'Lower',
  'Full Body',
  'Mixed',
  'Cardio',
  'Free',
] as const

export type WorkoutTarget = 'maintain' | 'increase_weight' | 'increase_reps'
