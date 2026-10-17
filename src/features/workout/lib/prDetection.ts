export type SetLike = {
  weight: number | null | undefined
  reps: number | null | undefined
}

export type PersonalRecord = {
  weight: number
  reps: number
}

/**
 * True when `set` beats the previous PR by heavier weight, or same weight with more reps.
 * Shared by finish-summary celebration and History all-time best.
 */
export function isPersonalRecord(set: SetLike, previous: PersonalRecord | null): boolean {
  if (set.weight == null || set.reps == null) return false
  if (set.weight <= 0 || set.reps <= 0) return false

  if (!previous) return true

  if (set.weight > previous.weight) return true
  if (set.weight === previous.weight && set.reps > previous.reps) return true

  return false
}

/** Pick the best set among candidates using the same PR rules. */
export function bestPersonalRecord(sets: SetLike[]): PersonalRecord | null {
  let best: PersonalRecord | null = null
  for (const set of sets) {
    if (set.weight == null || set.reps == null) continue
    if (set.weight <= 0 || set.reps <= 0) continue
    if (isPersonalRecord(set, best)) {
      best = { weight: set.weight, reps: set.reps }
    }
  }
  return best
}

export function detectPrHits(
  sets: Array<SetLike & { exerciseId: string; exerciseName: string }>,
  previousPrByExercise: Record<string, PersonalRecord | null>,
): Array<{ exerciseId: string; exerciseName: string; weight: number; reps: number }> {
  const hits: Array<{
    exerciseId: string
    exerciseName: string
    weight: number
    reps: number
  }> = []

  const running: Record<string, PersonalRecord | null> = { ...previousPrByExercise }

  for (const set of sets) {
    if (set.weight == null || set.reps == null) continue
    const prev = running[set.exerciseId] ?? null
    if (isPersonalRecord(set, prev)) {
      hits.push({
        exerciseId: set.exerciseId,
        exerciseName: set.exerciseName,
        weight: set.weight,
        reps: set.reps,
      })
      running[set.exerciseId] = { weight: set.weight, reps: set.reps }
    }
  }

  return hits
}
