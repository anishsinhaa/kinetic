import { describe, expect, it } from 'vitest'
import { buildExerciseHistory } from './historyService'

describe('buildExerciseHistory', () => {
  it('keeps same-day workouts as separate sessions with their own volume', () => {
    const rows = [
      {
        exercise_id: 'ex-bench',
        exercises: { id: 'ex-bench', name: 'Bench Press', muscle_group: 'Chest' },
        sets: [
          { weight: 80, reps: 5, set_index: 1, completed_at: '2026-10-17T08:00:00Z' },
          { weight: 80, reps: 5, set_index: 2, completed_at: '2026-10-17T08:05:00Z' },
        ],
        workouts: {
          id: 'w-morning',
          date: '2026-10-17',
          feel: 4,
          note: 'AM',
          ended_at: '2026-10-17T08:30:00Z',
        },
      },
      {
        exercise_id: 'ex-bench',
        exercises: { id: 'ex-bench', name: 'Bench Press', muscle_group: 'Chest' },
        sets: [
          { weight: 60, reps: 10, set_index: 1, completed_at: '2026-10-17T18:00:00Z' },
        ],
        workouts: {
          id: 'w-evening',
          date: '2026-10-17',
          feel: 3,
          note: 'PM',
          ended_at: '2026-10-17T18:40:00Z',
        },
      },
    ]

    const [bench] = buildExerciseHistory(rows)
    expect(bench?.sessions).toHaveLength(2)
    expect(bench?.sessions.map((s) => s.workoutId).sort()).toEqual(['w-evening', 'w-morning'])
    expect(bench?.sessions.find((s) => s.workoutId === 'w-morning')?.totalVolume).toBe(800)
    expect(bench?.sessions.find((s) => s.workoutId === 'w-evening')?.totalVolume).toBe(600)
  })
})
