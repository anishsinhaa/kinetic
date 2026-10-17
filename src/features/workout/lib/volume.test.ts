import { describe, expect, it } from 'vitest'
import { isCompletedSet, setVolumeKg, totalVolumeKg } from './volume'

describe('volume', () => {
  it('treats only weight+reps sets as completed', () => {
    expect(isCompletedSet({ weight: 90, reps: 5 })).toBe(true)
    expect(isCompletedSet({ weight: 90, reps: null })).toBe(false)
    expect(isCompletedSet({ weight: null, reps: 5 })).toBe(false)
    expect(isCompletedSet({ weight: null, reps: null })).toBe(false)
  })

  it('computes volume as weight × reps for completed sets only', () => {
    expect(setVolumeKg({ weight: 90, reps: 5 })).toBe(450)
    expect(setVolumeKg({ weight: 90, reps: null })).toBe(0)

    const sets = [
      { weight: 50, reps: 10 },
      { weight: 50, reps: 10 },
      { weight: 90, reps: 5 },
      { weight: 100, reps: null },
    ]
    expect(totalVolumeKg(sets)).toBe(50 * 10 + 50 * 10 + 90 * 5)
  })

  it('does not double-count when summing completed sets', () => {
    const completed = [
      { weight: 50, reps: 10 },
      { weight: 50, reps: 10 },
    ]
    expect(totalVolumeKg(completed)).toBe(1000)
    expect(totalVolumeKg(completed)).toBe(
      completed.reduce((sum, s) => sum + (s.weight ?? 0) * (s.reps ?? 0), 0),
    )
  })
})
