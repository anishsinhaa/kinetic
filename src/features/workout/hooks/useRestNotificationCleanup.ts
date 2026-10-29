import { useEffect } from 'react'
import { clearRestNotifications } from '../../settings/lib/pushNotifications'
import { useWorkoutStore } from '../store/useWorkoutStore'

/** Close the rest-done notification when rest, the workout, or visibility changes. */
export function useRestNotificationCleanup() {
  useEffect(() => {
    const unsub = useWorkoutStore.subscribe((state, prev) => {
      const newRest = state.restEndsAt !== prev.restEndsAt && state.restEndsAt !== null
      const skippedWhileRunning =
        state.restEndsAt === null &&
        prev.restEndsAt !== null &&
        new Date(prev.restEndsAt).getTime() > Date.now()
      const workoutChanged = state.currentWorkoutId !== prev.currentWorkoutId
      if (newRest || skippedWhileRunning || workoutChanged) {
        void clearRestNotifications()
      }
    })

    const onVisible = () => {
      if (document.visibilityState === 'visible') void clearRestNotifications()
    }
    document.addEventListener('visibilitychange', onVisible)
    onVisible()

    return () => {
      unsub()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
}
