/**
 * Volume helpers — a set counts toward totals once it has both weight and reps
 * (or an explicit completed_at), whether or not the row has finished syncing.
 */

export type VolumeSet = {
  weight: number | null | undefined
  reps: number | null | undefined
  completed_at?: string | null
}

export function isCompletedSet(set: VolumeSet): boolean {
  if (set.completed_at) return true
  return set.weight != null && set.reps != null
}

export function setVolumeKg(set: VolumeSet): number {
  if (!isCompletedSet(set)) return 0
  return (set.weight ?? 0) * (set.reps ?? 0)
}

export function totalVolumeKg(sets: VolumeSet[]): number {
  return sets.reduce((sum, s) => sum + setVolumeKg(s), 0)
}
