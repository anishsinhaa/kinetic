import { describe, expect, it } from 'vitest'
import { deriveDayWorkoutSummary } from './deriveDayWorkoutSummary'

describe('deriveDayWorkoutSummary', () => {
  it('sums exact durations then rounds only the total', () => {
    // 90s + 90s = 180s → 3 min (not 2+2 from per-workout rounding)
    const summary = deriveDayWorkoutSummary([
      {
        workout_type: 'Upper',
        name: 'Upper',
        started_at: '2026-10-17T10:00:00.000Z',
        created_at: '2026-10-17T10:00:00.000Z',
        ended_at: '2026-10-17T10:01:30.000Z',
      },
      {
        workout_type: 'Pull',
        name: 'Pull',
        started_at: '2026-10-17T18:00:00.000Z',
        created_at: '2026-10-17T18:00:00.000Z',
        ended_at: '2026-10-17T18:01:30.000Z',
      },
    ])

    expect(summary.count).toBe(2)
    expect(summary.durationMs).toBe(180_000)
    expect(summary.durationMins).toBe(3)
    expect(summary.typeLabel).toBe('Upper + Pull')
  })

  it('prefers workout_type over stale name when type changed mid-session', () => {
    const summary = deriveDayWorkoutSummary([
      {
        workout_type: 'Pull',
        name: 'Upper',
        started_at: '2026-10-17T10:00:00.000Z',
        created_at: '2026-10-17T10:00:00.000Z',
        ended_at: '2026-10-17T10:01:00.000Z',
      },
    ])

    expect(summary.typeLabel).toBe('Pull')
    expect(summary.durationMins).toBe(1)
  })

  it('returns empty summary when there are no workouts', () => {
    expect(deriveDayWorkoutSummary([])).toEqual({
      typeLabel: null,
      durationMins: 0,
      durationMs: 0,
      count: 0,
    })
  })
})
