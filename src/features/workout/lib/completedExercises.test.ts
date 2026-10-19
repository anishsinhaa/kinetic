import { describe, expect, it } from 'vitest'
import { onlyExercisesWithCompletedSets } from './completedExercises'

describe('onlyExercisesWithCompletedSets', () => {
  it('drops exercises that have no completed sets', () => {
    const rows = [
      { name: 'Bench', sets: [{ weight: 60, reps: 8 }] },
      { name: 'Fly', sets: [] },
    ]
    expect(onlyExercisesWithCompletedSets(rows)).toEqual([
      { name: 'Bench', sets: [{ weight: 60, reps: 8 }] },
    ])
  })

  it('keeps count aligned with set totals', () => {
    const rows = [
      { sets: [{}, {}] },
      { sets: [] },
      { sets: [{}] },
    ]
    const kept = onlyExercisesWithCompletedSets(rows)
    expect(kept).toHaveLength(2)
    expect(kept.reduce((n, e) => n + e.sets.length, 0)).toBe(3)
  })
})
