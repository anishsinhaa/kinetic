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

type SessionSet = SetLike & { exerciseId: string; exerciseName: string }
type SessionBest = { exerciseId: string; exerciseName: string; weight: number; reps: number }

/**
 * PR hits for a finished session.
 *
 * A PR only counts when the exercise already had a previous best — the very
 * first logged set of an exercise is a baseline ("First log"), not a PR. This
 * is enforced here rather than in `isPersonalRecord`, because
 * `bestPersonalRecord` relies on `isPersonalRecord(set, null) === true`.
 */
export function detectPrHits(
  sets: SessionSet[],
  previousPrByExercise: Record<string, PersonalRecord | null>,
): SessionBest[] {
  const hits: SessionBest[] = []

  const running: Record<string, PersonalRecord | null> = { ...previousPrByExercise }

  for (const set of sets) {
    if (set.weight == null || set.reps == null) continue
    const prev = running[set.exerciseId] ?? null
    if (!prev) continue // no history → not a PR (see detectFirstLogs)
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

/**
 * Exercises logged for the first time (no previous best): the best set of the
 * session is reported as the baseline.
 */
export function detectFirstLogs(
  sets: SessionSet[],
  previousPrByExercise: Record<string, PersonalRecord | null>,
): SessionBest[] {
  const byExercise = new Map<string, { name: string; sets: SetLike[] }>()
  for (const set of sets) {
    if (previousPrByExercise[set.exerciseId]) continue
    const entry = byExercise.get(set.exerciseId) ?? { name: set.exerciseName, sets: [] }
    entry.sets.push(set)
    byExercise.set(set.exerciseId, entry)
  }
  const out: SessionBest[] = []
  for (const [exerciseId, entry] of byExercise) {
    const best = bestPersonalRecord(entry.sets)
    if (best) out.push({ exerciseId, exerciseName: entry.name, ...best })
  }
  return out
}
