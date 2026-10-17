import { describe, expect, it } from 'vitest'
import { bestPersonalRecord, detectPrHits, isPersonalRecord } from './prDetection'

describe('prDetection', () => {
  it('treats first logged set as a PR', () => {
    expect(isPersonalRecord({ weight: 40, reps: 6 }, null)).toBe(true)
  })

  it('detects heavier weight as PR (100kg beats 90kg)', () => {
    expect(isPersonalRecord({ weight: 100, reps: 5 }, { weight: 90, reps: 5 })).toBe(true)
    expect(isPersonalRecord({ weight: 100, reps: 1 }, { weight: 90, reps: 10 })).toBe(true)
  })

  it('detects more reps at same weight as PR', () => {
    expect(isPersonalRecord({ weight: 40, reps: 8 }, { weight: 40, reps: 6 })).toBe(true)
  })

  it('rejects weaker sets', () => {
    expect(isPersonalRecord({ weight: 35, reps: 6 }, { weight: 40, reps: 6 })).toBe(false)
    expect(isPersonalRecord({ weight: 40, reps: 5 }, { weight: 40, reps: 6 })).toBe(false)
  })

  it('does not treat higher 1RM at lighter weight as a PR', () => {
    // 60×10 has higher Epley 1RM than 90×3, but is not heavier / same-weight more reps
    expect(isPersonalRecord({ weight: 60, reps: 10 }, { weight: 90, reps: 3 })).toBe(false)
  })

  it('detects PR hits across a session vs prior bests', () => {
    const hits = detectPrHits(
      [
        { exerciseId: 'a', exerciseName: 'Bench', weight: 100, reps: 5 },
        { exerciseId: 'a', exerciseName: 'Bench', weight: 90, reps: 8 },
        { exerciseId: 'b', exerciseName: 'Row', weight: 50, reps: 8 },
      ],
      { a: { weight: 90, reps: 5 }, b: null },
    )
    expect(hits).toHaveLength(2)
    expect(hits[0]).toMatchObject({ exerciseName: 'Bench', weight: 100, reps: 5 })
    expect(hits[1]?.exerciseName).toBe('Row')
  })

  it('bestPersonalRecord matches History all-time best selection', () => {
    const best = bestPersonalRecord([
      { weight: 90, reps: 5 },
      { weight: 100, reps: 3 },
      { weight: 100, reps: 5 },
      { weight: 80, reps: 12 },
    ])
    expect(best).toEqual({ weight: 100, reps: 5 })
  })
})
