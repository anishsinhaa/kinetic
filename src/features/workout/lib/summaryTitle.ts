import { TYPE_MUSCLE_MAP } from './typeMuscleMap'

/** Broad library labels → the fine-grained groups used by TYPE_MUSCLE_MAP. */
const GROUP_ALIASES: Record<string, string[]> = {
  back: ['Lats', 'Middle Back', 'Lower Back', 'Traps'],
  legs: ['Quadriceps', 'Hamstrings', 'Glutes', 'Calves', 'Abductors', 'Adductors'],
  arms: ['Biceps', 'Triceps', 'Forearms'],
  quads: ['Quadriceps'],
  shoulder: ['Shoulders'],
}

function expandGroup(group: string): string[] {
  const key = group.trim().toLowerCase()
  if (!key) return []
  const alias = GROUP_ALIASES[key]
  return alias ?? [group.trim()]
}

/**
 * True when at least half of the logged exercises train muscles that belong to
 * `type` (per TYPE_MUSCLE_MAP). Types without a muscle map (Full Body, Mixed,
 * Cardio, Free, custom labels) can't be verified, so they never "match".
 */
export function muscleGroupsMatchType(type: string, muscleGroups: Array<string | null | undefined>): boolean {
  const key = Object.keys(TYPE_MUSCLE_MAP).find(
    (k) => k.toLowerCase() === type.trim().toLowerCase(),
  )
  const allowed = key ? TYPE_MUSCLE_MAP[key] : undefined
  if (!allowed || allowed.length === 0) return false

  const groups = muscleGroups.filter((g): g is string => Boolean(g && g.trim()))
  if (groups.length === 0) return false

  const allowedLc = new Set(allowed.map((m) => m.toLowerCase()))
  const matched = groups.filter((g) =>
    expandGroup(g).some((fine) => allowedLc.has(fine.toLowerCase())),
  ).length
  return matched / groups.length >= 0.5
}

/**
 * Summary heading for a finished session. Same source History uses: the type
 * saved on the workout (`workout_type`, kept on the session as `workoutLabel`).
 * "Workout" only when that type is missing.
 */
export function resolveSummaryTitle(input: {
  label: string
  typeExplicit?: boolean
  muscleGroups?: Array<string | null | undefined>
}): string {
  const label = input.label.trim()
  return label || 'Workout'
}
