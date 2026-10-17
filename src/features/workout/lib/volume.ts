/**
 * Volume = sum(weight × reps) of checked/completed sets only.
 */

export type VolumeSet = {
  weight: number | null | undefined
  reps: number | null | undefined
  /** Client draft flag */
  completed?: boolean | null
  /** DB completion timestamp */
  completed_at?: string | null
}

function hasLiftData(set: VolumeSet): boolean {
  return (
    set.weight != null &&
    set.reps != null &&
    !Number.isNaN(Number(set.weight)) &&
    !Number.isNaN(Number(set.reps))
  )
}

/**
 * A set counts only when it has weight+reps AND is explicitly completed
 * (`completed` / `completed_at`). Legacy rows with neither field still count
 * by weight+reps so pre-migration history is preserved.
 */
export function isCompletedSet(set: VolumeSet): boolean {
  if (!hasLiftData(set)) return false
  if (set.completed === false) return false
  if (set.completed === true) return true
  if (set.completed_at != null && set.completed_at !== '') return true
  // Legacy: no completion metadata on the object
  return set.completed === undefined && set.completed_at === undefined
}

export function setVolumeKg(set: VolumeSet): number {
  if (!isCompletedSet(set)) return 0
  return Number(set.weight) * Number(set.reps)
}

export function totalVolumeKg(sets: VolumeSet[]): number {
  return sets.reduce((sum, s) => sum + setVolumeKg(s), 0)
}

/** Display volume with up to 1 decimal (807.5), dropping trailing .0 */
export function formatVolumeKg(volume: number): string {
  const rounded = Math.round(volume * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}
