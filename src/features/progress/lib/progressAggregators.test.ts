import { describe, expect, it } from 'vitest'
import {
  isoWeek,
  exerciseTimeSeries,
  exercisePrTimeline,
  bodyWeightSeries,
  weeklyVolumeSeries,
  allTimePrList,
} from './progressAggregators'
import type { ExerciseHistorySession } from '../../history/types'
import type { DailyLogEntry } from '../../history/types'
import type { ExerciseHistory } from '../../history/types'

const sess = (
  date: string,
  sets: { weight: number; reps: number }[],
  vol?: number,
): ExerciseHistorySession => ({
  workoutId: date + '-w',
  date,
  sets,
  totalVolume: vol ?? sets.reduce((s, x) => s + x.weight * x.reps, 0),
  feel: null,
  note: null,
})

describe('isoWeek', () => {
  it('returns correct ISO week for known dates', () => {
    expect(isoWeek('2026-10-18')).toBe('2026-W42') // a Sunday
    expect(isoWeek('2026-01-01')).toBe('2026-W01')
    expect(isoWeek('2024-12-30')).toBe('2025-W01') // year boundary
  })
})

describe('exerciseTimeSeries', () => {
  it('orders sessions chronologically', () => {
    const sessions = [sess('2026-10-15', [{ weight: 80, reps: 8 }]), sess('2026-10-10', [{ weight: 75, reps: 8 }])]
    const series = exerciseTimeSeries(sessions)
    expect(series[0].date).toBe('2026-10-10')
    expect(series[1].date).toBe('2026-10-15')
  })
  it('picks the best set by PR rules (heavier weight wins)', () => {
    const s = sess('2026-10-10', [
      { weight: 60, reps: 10 },
      { weight: 80, reps: 5 },
    ])
    const [pt] = exerciseTimeSeries([s])
    expect(pt.bestWeight).toBe(80)
    expect(pt.bestReps).toBe(5)
  })
  it('returns empty for empty sessions', () => {
    expect(exerciseTimeSeries([])).toHaveLength(0)
  })
})

describe('exercisePrTimeline', () => {
  it('detects PRs chronologically', () => {
    const sessions = [
      sess('2026-09-01', [{ weight: 60, reps: 8 }]),
      sess('2026-09-15', [{ weight: 70, reps: 8 }]),  // PR
      sess('2026-09-30', [{ weight: 70, reps: 8 }]),  // same — no new PR
    ]
    const events = exercisePrTimeline(sessions)
    expect(events).toHaveLength(2)
    expect(events[0].weight).toBe(60)
    expect(events[1].weight).toBe(70)
  })
  it('does NOT count more reps at lighter weight as PR', () => {
    const sessions = [
      sess('2026-09-01', [{ weight: 80, reps: 5 }]),
      sess('2026-09-15', [{ weight: 60, reps: 20 }]),  // lighter — not a PR
    ]
    const events = exercisePrTimeline(sessions)
    expect(events).toHaveLength(1)
    expect(events[0].weight).toBe(80)
  })
  it('counts more reps at same weight as PR', () => {
    const sessions = [
      sess('2026-09-01', [{ weight: 80, reps: 5 }]),
      sess('2026-09-15', [{ weight: 80, reps: 8 }]),
    ]
    const events = exercisePrTimeline(sessions)
    expect(events).toHaveLength(2)
    expect(events[1].reps).toBe(8)
  })
})

describe('bodyWeightSeries', () => {
  const makelog = (date: string, weight: number | null): DailyLogEntry => ({
    id: date,
    date,
    weight,
    calories: null,
    protein: null,
    sleep: null,
    notes: null,
    workoutType: null,
    workoutDurationMins: null,
    workoutCount: 0,
    workoutFeels: [],
    workoutNotes: [],
  })

  it('filters null weights and sorts ascending', () => {
    const logs = [makelog('2026-10-10', 80), makelog('2026-10-05', null), makelog('2026-10-01', 79)]
    const series = bodyWeightSeries(logs)
    expect(series).toHaveLength(2)
    expect(series[0].date).toBe('2026-10-01')
    expect(series[1].weight).toBe(80)
  })
})

describe('weeklyVolumeSeries', () => {
  const makeHistory = (date: string, vol: number): ExerciseHistory => ({
    exerciseId: 'e1',
    exerciseName: 'Bench',
    muscleGroup: 'chest',
    allTimeBest: 100,
    allTimeBestReps: 5,
    sessions: [sess(date, [{ weight: 100, reps: 5 }], vol)],
  })

  it('sums volumes by ISO week', () => {
    const histories = [makeHistory('2026-10-12', 500), makeHistory('2026-10-13', 300), makeHistory('2026-10-19', 200)]
    const series = weeklyVolumeSeries(histories)
    const w42 = series.find((w) => w.week === '2026-W42')
    const w43 = series.find((w) => w.week === '2026-W43')
    expect(w42?.volume).toBe(800)
    expect(w43?.volume).toBe(200)
  })
})

describe('allTimePrList', () => {
  it('returns exercises sorted by weight descending', () => {
    const histories: ExerciseHistory[] = [
      {
        exerciseId: 'e1',
        exerciseName: 'Squat',
        muscleGroup: 'legs',
        allTimeBest: 120,
        allTimeBestReps: 5,
        sessions: [sess('2026-10-01', [{ weight: 120, reps: 5 }])],
      },
      {
        exerciseId: 'e2',
        exerciseName: 'Bench',
        muscleGroup: 'chest',
        allTimeBest: 100,
        allTimeBestReps: 5,
        sessions: [sess('2026-10-02', [{ weight: 100, reps: 5 }])],
      },
    ]
    const list = allTimePrList(histories)
    expect(list[0].exerciseName).toBe('Squat')
    expect(list[1].exerciseName).toBe('Bench')
  })
})
