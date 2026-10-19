import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useWorkoutStore } from '../store/useWorkoutStore'
import { useWorkoutStoreHydrated } from './useWorkoutStoreHydrated'
import { getWorkoutStatus } from '../services/workoutService'
import { deriveActiveSession, isStaleStoredSession } from '../lib/activeSession'

/** The reset-on-load check runs once per page load, not once per component. */
let bootCheckDone = false

/**
 * Real active session = store points at a workouts row with ended_at IS NULL.
 *
 * On first use after the persisted store hydrates, a stale session (stuck on
 * the summary screen, or whose DB row is ended/missing) is reset to idle.
 * Failed lookups (offline) never reset anything.
 */
export function useActiveSession() {
  const hydrated = useWorkoutStoreHydrated()
  const currentWorkoutId = useWorkoutStore((s) => s.currentWorkoutId)
  const phase = useWorkoutStore((s) => s.phase)
  const workoutLabel = useWorkoutStore((s) => s.workoutLabel)
  const workoutStartedAt = useWorkoutStore((s) => s.workoutStartedAt)

  useEffect(() => {
    if (!hydrated || bootCheckDone) return
    bootCheckDone = true
    const initial = useWorkoutStore.getState()
    const id = initial.currentWorkoutId
    if (!id) return
    if (initial.phase === 'summary') {
      initial.resetToIdle()
      return
    }
    void getWorkoutStatus(id)
      .then((row) => {
        const now = useWorkoutStore.getState()
        // Only touch the session we checked — never a newer one started meanwhile
        if (now.currentWorkoutId !== id) return
        if (isStaleStoredSession({ currentWorkoutId: id, phase: now.phase }, row)) {
          now.resetToIdle()
        }
      })
      .catch(() => {
        /* offline / transient — keep the local session */
      })
  }, [hydrated])

  const statusQuery = useQuery({
    queryKey: ['workout', 'status', currentWorkoutId],
    queryFn: () => getWorkoutStatus(currentWorkoutId!),
    enabled: hydrated && Boolean(currentWorkoutId),
    staleTime: 0,
  })

  const activeSession = hydrated
    ? deriveActiveSession(
        { currentWorkoutId, phase, workoutLabel, workoutStartedAt },
        statusQuery.data,
      )
    : null

  return {
    activeSession,
    /** True until we know whether the persisted session is real. */
    isChecking: !hydrated || (Boolean(currentWorkoutId) && statusQuery.isLoading),
  }
}
