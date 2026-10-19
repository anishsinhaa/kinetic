/**
 * Exercises with zero completed sets must not appear in last-workout stats,
 * summary, or history aggregations.
 */

export type ExerciseWithSets = {
  sets: unknown[]
}

export function onlyExercisesWithCompletedSets<T extends ExerciseWithSets>(
  exercises: T[],
): T[] {
  return exercises.filter((e) => e.sets.length > 0)
}
