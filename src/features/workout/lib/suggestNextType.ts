import { DEFAULT_WORKOUT_TYPES } from '../constants'

/** Classic push/pull/legs rotation used for suggestions. */
export const PPL_ROTATION = ['Push', 'Pull', 'Legs'] as const

function sameType(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}

/** Prefer the spelling from the user's type list when the day exists there. */
function spellType(type: string, available: readonly string[]): string {
  return available.find((t) => sameType(t, type)) ?? type
}

/**
 * Pick the split day that lines up with recent history (most recent first),
 * then return the following day. Repeated days are disambiguated by how many
 * earlier sessions match walking backwards around the list.
 */
function nextFromSplit(
  recentTypes: string[],
  available: readonly string[],
  split: readonly string[],
): string {
  const recent = recentTypes.map((t) => t.trim()).filter(Boolean)
  const first = split[0] ?? ''
  if (recent.length === 0 || !split.some((day) => sameType(day, recent[0] ?? ''))) {
    return spellType(first, available)
  }

  const last = recent[0] ?? ''
  let bestIndex = -1
  let bestCount = -1
  for (let i = 0; i < split.length; i++) {
    if (!sameType(split[i] ?? '', last)) continue
    let count = 0
    const steps = Math.min(split.length, recent.length - 1)
    for (let step = 1; step <= steps; step++) {
      const earlier = split[(i - step + split.length) % split.length] ?? ''
      if (sameType(earlier, recent[step] ?? '')) count += 1
    }
    if (count > bestCount) {
      bestCount = count
      bestIndex = i
    }
  }

  const next = split[(bestIndex + 1) % split.length] ?? first
  return spellType(next, available)
}

/**
 * Suggest the next workout type from recent completed types (most recent first).
 * A saved split wins. Otherwise uses PPL rotation when the last type is in that
 * split, or cycles the available types.
 */
export function suggestNextType(
  recentTypes: string[],
  availableTypes: readonly string[] = DEFAULT_WORKOUT_TYPES,
  split?: readonly string[],
): string | null {
  const available = availableTypes.map((t) => t.trim()).filter(Boolean)
  const days = (split ?? []).map((t) => t.trim()).filter(Boolean)
  if (days.length > 0) return nextFromSplit(recentTypes, available, days)
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
