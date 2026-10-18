import { DEFAULT_WORKOUT_TYPES } from '../constants'

/**
 * Resolve stored workout types for the type picker.
 * Empty / missing → full defaults.
 * Non-empty → user order & visibility from Settings (defaults may be hidden).
 */
export function resolveWorkoutTypes(stored?: string[] | null): string[] {
  if (!stored || stored.length === 0) return [...DEFAULT_WORKOUT_TYPES]

  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of stored) {
    if (typeof raw !== 'string') continue
    const t = raw.trim()
    if (!t) continue
    const key = t.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(t)
  }
  return out.length > 0 ? out : [...DEFAULT_WORKOUT_TYPES]
}

export function isDefaultWorkoutType(label: string): boolean {
  const key = label.trim().toLowerCase()
  return DEFAULT_WORKOUT_TYPES.some((d) => d.toLowerCase() === key)
}
