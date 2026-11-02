import { useSyncExternalStore } from 'react'
import { parseWeeklyGoal, readWeeklyGoalRaw, subscribeWeeklyGoal, writeWeeklyGoal } from '../lib/weeklyGoal'

export function useWeeklyGoal(userId: string) {
  const raw = useSyncExternalStore(
    subscribeWeeklyGoal,
    () => readWeeklyGoalRaw(userId),
    () => null,
  )
  return {
    goal: parseWeeklyGoal(raw),
    setGoal: (n: number) => writeWeeklyGoal(userId, n),
  }
}
