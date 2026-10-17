export type SetLike = {
  weight: number | null | undefined
  reps: number | null | undefined
}

export type PersonalRecord = {
  weight: number
  reps: number
}

/** Estimated 1RM via Epley — used to compare sets when weights differ. */
export function estimated1RM(weight: number, reps: number): number {
  if (reps <= 0 || weight <= 0) return 0
  if (reps === 1) return weight
  return weight * (1 + reps / 30)
}

/**
 * True when `set` beats the previous PR by heavier weight, or same weight with more reps,
 * or higher estimated 1RM.
 */
export function isPersonalRecord(set: SetLike, previous: PersonalRecord | null): boolean {
  if (set.weight == null || set.reps == null) return false
  if (set.weight <= 0 || set.reps <= 0) return false

  if (!previous) return true

  if (set.weight > previous.weight) return true
  if (set.weight === previous.weight && set.reps > previous.reps) return true

  return estimated1RM(set.weight, set.reps) > estimated1RM(previous.weight, previous.reps)
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
