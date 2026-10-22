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

/** sets.weight is NUMERIC(6,2) kg. Stay under that so a large lb entry cannot overflow. */
export const MAX_SET_WEIGHT_KG = 600
/** sets.reps is INTEGER. Cap the field so a stuck key can't write a huge value. */
export const MAX_REPS = 100
