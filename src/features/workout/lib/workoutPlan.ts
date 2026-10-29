export type PlannedExercise = {
  exerciseId: string
  name: string
  muscleGroup: string
}

export type WorkoutPlan = {
  version: 1
  type: string
  exercises: PlannedExercise[]
  updatedAt: string
}

export const MAX_PLAN_EXERCISES = 30

export const DELETE_PLAN_TITLE = 'Delete this plan?'
export const DELETE_PLAN_BODY =
  'This only removes the plan. No workouts or logged sets are affected.'

export function planStorageKey(userId: string): string {
  return `kinetic-plan:v1:${userId}`
}

const listeners = new Set<() => void>()

function notifyPlan(): void {
  for (const listener of listeners) listener()
}

/** Re-read the plan when this tab writes it, or another tab does. */
export function subscribePlan(cb: () => void): () => void {
  listeners.add(cb)
  const onStorage = () => cb()
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(cb)
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage)
  }
}

export function parseWorkoutPlan(raw: string | null): WorkoutPlan | null {
  if (!raw) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object') return null
    const record = value as Record<string, unknown>
    if (record.version !== 1) return null
    if (typeof record.type !== 'string') return null
    const type = record.type.trim().slice(0, 40)
    if (!type) return null
    if (!Array.isArray(record.exercises)) return null

    const seen = new Set<string>()
    const exercises: PlannedExercise[] = []
    for (const entry of record.exercises) {
      if (exercises.length >= MAX_PLAN_EXERCISES) break
      if (!entry || typeof entry !== 'object') continue
      const row = entry as Record<string, unknown>
      if (typeof row.exerciseId !== 'string') continue
      const exerciseId = row.exerciseId.trim()
      if (!exerciseId || seen.has(exerciseId)) continue
      seen.add(exerciseId)
      const name = typeof row.name === 'string' && row.name.trim() ? row.name.trim() : 'Exercise'
      const muscleGroup = typeof row.muscleGroup === 'string' ? row.muscleGroup : ''
      exercises.push({ exerciseId, name, muscleGroup })
    }
    if (exercises.length === 0) return null
    const updatedAt =
      typeof record.updatedAt === 'string' && record.updatedAt
        ? record.updatedAt
        : new Date().toISOString()
    return { version: 1, type, exercises, updatedAt }
  } catch {
    return null
  }
}

export function readPlanRaw(userId: string): string | null {
  try {
    if (typeof window === 'undefined') return null
    return window.localStorage.getItem(planStorageKey(userId))
  } catch {
    return null
  }
}

export function saveWorkoutPlan(
  userId: string,
  draft: { type: string; exercises: PlannedExercise[] },
): boolean {
  const plan = parseWorkoutPlan(
    JSON.stringify({
      version: 1,
      type: draft.type,
      exercises: draft.exercises,
      updatedAt: new Date().toISOString(),
    }),
  )
  if (!plan) return false
  try {
    if (typeof window === 'undefined') return false
    window.localStorage.setItem(planStorageKey(userId), JSON.stringify(plan))
  } catch {
    return false
  }
  notifyPlan()
  return true
}

export function clearWorkoutPlan(userId: string): void {
  try {
    if (typeof window !== 'undefined') window.localStorage.removeItem(planStorageKey(userId))
  } catch {
    // Storage can be blocked; the in-memory subscribers still refresh.
  }
  notifyPlan()
}
