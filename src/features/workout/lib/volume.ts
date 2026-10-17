/**
 * Volume = sum(weight × reps) of completed sets (both weight and reps present).
 */

export type VolumeSet = {
  weight: number | null | undefined
  reps: number | null | undefined
}

export function isCompletedSet(set: VolumeSet): boolean {
  return set.weight != null && set.reps != null && !Number.isNaN(set.weight) && !Number.isNaN(set.reps)
}

export function setVolumeKg(set: VolumeSet): number {
  if (!isCompletedSet(set)) return 0
  return Number(set.weight) * Number(set.reps)
}

export function totalVolumeKg(sets: VolumeSet[]): number {
  return sets.reduce((sum, s) => sum + setVolumeKg(s), 0)
}
