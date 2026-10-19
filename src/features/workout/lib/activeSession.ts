export type WorkoutDbStatus = {
  id: string
  endedAt: string | null
} | null

export type ActiveSessionStoreSlice = {
  currentWorkoutId: string | null
  phase: string
  workoutLabel: string
  workoutStartedAt: string | null
}

export type ActiveSession = {
  workoutId: string
  label: string
  startedAt: string | null
}

/**
 * A session is "active" only when the store points at a workouts row that
 * still exists and has `ended_at IS NULL`. A persisted store pointing at an
 * ended/missing row (or stuck on the summary screen) is stale, not active.
 *
 * `dbRow` is `undefined` while the status is still loading → not active yet.
 */
export function deriveActiveSession(
  store: ActiveSessionStoreSlice,
  dbRow: WorkoutDbStatus | undefined,
): ActiveSession | null {
  if (!store.currentWorkoutId) return null
  if (store.phase === 'summary') return null
  if (!dbRow) return null
  if (dbRow.id !== store.currentWorkoutId) return null
  if (dbRow.endedAt) return null
  return {
    workoutId: dbRow.id,
    label: store.workoutLabel,
    startedAt: store.workoutStartedAt,
  }
}

/**
 * Should the persisted store be reset to idle on load?
 * - stuck on the summary screen from an earlier page load, or
 * - its workout row has ended / no longer exists.
 * Only call with a *successful* status lookup (null = row missing).
 */
export function isStaleStoredSession(
  store: Pick<ActiveSessionStoreSlice, 'currentWorkoutId' | 'phase'>,
  dbRow: WorkoutDbStatus,
): boolean {
  if (!store.currentWorkoutId) return false
  if (store.phase === 'summary') return true
  if (!dbRow) return true
  return Boolean(dbRow.endedAt)
}
