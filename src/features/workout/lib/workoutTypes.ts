import { DEFAULT_WORKOUT_TYPES } from '../constants'

/**
 * Always surface the spec defaults first. Custom labels append after.
 * Empty / missing stored lists → defaults only.
 */
export function resolveWorkoutTypes(stored?: string[] | null): string[] {
  const defaults = [...DEFAULT_WORKOUT_TYPES]
  if (!stored || stored.length === 0) return defaults

  const custom: string[] = []
  for (const raw of stored) {
    if (typeof raw !== 'string') continue
    const t = raw.trim()
    if (!t) continue
    const isDefault = defaults.some((d) => d.toLowerCase() === t.toLowerCase())
    if (isDefault) continue
    if (custom.some((c) => c.toLowerCase() === t.toLowerCase())) continue
    custom.push(t)
  }
  return [...defaults, ...custom]
}
