import { DEFAULT_WORKOUT_TYPES } from '../constants'

/** Classic push/pull/legs rotation used for suggestions. */
export const PPL_ROTATION = ['Push', 'Pull', 'Legs'] as const

/**
 * Suggest the next workout type from recent completed types (most recent first).
 * Uses PPL rotation when the last type is in that split; otherwise cycles defaults.
 */
export function suggestNextType(
  recentTypes: string[],
  availableTypes: readonly string[] = DEFAULT_WORKOUT_TYPES,
): string | null {
  const available = availableTypes.map((t) => t.trim()).filter(Boolean)
  if (available.length === 0) return null

  const last = recentTypes.map((t) => t.trim()).find(Boolean)
  if (!last) return available[0] ?? null

  const pplIndex = PPL_ROTATION.findIndex((t) => t.toLowerCase() === last.toLowerCase())
  if (pplIndex >= 0) {
    const next = PPL_ROTATION[(pplIndex + 1) % PPL_ROTATION.length]
    const match = available.find((t) => t.toLowerCase() === next.toLowerCase())
    if (match) return match
  }

  const idx = available.findIndex((t) => t.toLowerCase() === last.toLowerCase())
  if (idx >= 0) return available[(idx + 1) % available.length] ?? available[0] ?? null

  return available[0] ?? null
}
