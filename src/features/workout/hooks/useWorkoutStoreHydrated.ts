import { useSyncExternalStore } from 'react'
import { useWorkoutStore } from '../store/useWorkoutStore'

function subscribeHydration(onStoreChange: () => void): () => void {
  try {
    if (useWorkoutStore.persist.hasHydrated()) {
      return () => {}
    }
    return useWorkoutStore.persist.onFinishHydration(onStoreChange)
  } catch {
    return () => {}
  }
}

function getHydratedSnapshot(): boolean {
  try {
    return useWorkoutStore.persist.hasHydrated()
  } catch {
    return true
  }
}

/** True after zustand persist has rehydrated the active workout session. */
export function useWorkoutStoreHydrated(): boolean {
  return useSyncExternalStore(subscribeHydration, getHydratedSnapshot, () => true)
}
