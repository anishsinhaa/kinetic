import { useMemo, useSyncExternalStore } from 'react'
import { parseWorkoutPlan, readPlanRaw, subscribePlan, type WorkoutPlan } from '../lib/workoutPlan'

export function useWorkoutPlan(userId: string): WorkoutPlan | null {
  const raw = useSyncExternalStore(
    subscribePlan,
    () => readPlanRaw(userId),
    () => null,
  )
  return useMemo(() => parseWorkoutPlan(raw), [raw])
}
