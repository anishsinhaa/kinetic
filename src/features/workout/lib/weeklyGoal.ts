import { clampWeeklyGoal, DEFAULT_WEEKLY_GOAL } from './weeklyConsistency'

const listeners = new Set<() => void>()

function notifyWeeklyGoal(): void {
  for (const listener of listeners) listener()
}

function weeklyGoalKey(userId: string): string {
  return `kinetic-weekly-goal:v1:${userId}`
}

export function subscribeWeeklyGoal(cb: () => void): () => void {
  listeners.add(cb)
  const onStorage = () => cb()
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(cb)
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage)
  }
}

export function readWeeklyGoalRaw(userId: string): string | null {
  try {
    if (typeof window === 'undefined') return null
    return window.localStorage.getItem(weeklyGoalKey(userId))
  } catch {
    return null
  }
}

export function writeWeeklyGoal(userId: string, goal: number): void {
  try {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(weeklyGoalKey(userId), String(clampWeeklyGoal(goal)))
  } catch {
    return
  }
  notifyWeeklyGoal()
}

export function parseWeeklyGoal(raw: string | null): number {
  return raw == null ? DEFAULT_WEEKLY_GOAL : clampWeeklyGoal(Number(raw))
}
