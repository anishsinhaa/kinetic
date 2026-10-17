import { describe, expect, it } from 'vitest'
import { detectPrHits, isPersonalRecord } from './prDetection'

describe('prDetection', () => {
  it('treats first logged set as a PR', () => {
    expect(isPersonalRecord({ weight: 40, reps: 6 }, null)).toBe(true)
  })

  it('detects heavier weight as PR', () => {
    expect(isPersonalRecord({ weight: 45, reps: 5 }, { weight: 40, reps: 6 })).toBe(true)
  })

  it('detects more reps at same weight as PR', () => {
    expect(isPersonalRecord({ weight: 40, reps: 8 }, { weight: 40, reps: 6 })).toBe(true)
  })

  it('rejects weaker sets', () => {
    expect(isPersonalRecord({ weight: 35, reps: 6 }, { weight: 40, reps: 6 })).toBe(false)
  })

  it('detects PR hits across a session', () => {
    const hits = detectPrHits(
      [
        { exerciseId: 'a', exerciseName: 'Bench', weight: 60, reps: 5 },
        { exerciseId: 'a', exerciseName: 'Bench', weight: 65, reps: 3 },
        { exerciseId: 'b', exerciseName: 'Row', weight: 50, reps: 8 },
      ],
      { a: { weight: 60, reps: 5 }, b: null },
    )
    expect(hits).toHaveLength(2)
    expect(hits[0]?.weight).toBe(65)
    expect(hits[1]?.exerciseName).toBe('Row')
  })
})
