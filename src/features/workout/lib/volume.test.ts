import { describe, expect, it } from 'vitest'
import { formatVolumeKg, isCompletedSet, setVolumeKg, totalVolumeKg } from './volume'

describe('volume', () => {
  it('requires completion when completed flag / completed_at is present', () => {
    expect(isCompletedSet({ weight: 90, reps: 5, completed: true })).toBe(true)
    expect(isCompletedSet({ weight: 90, reps: 5, completed: false })).toBe(false)
    expect(isCompletedSet({ weight: 90, reps: 5, completed_at: '2026-01-01T00:00:00Z' })).toBe(true)
    expect(isCompletedSet({ weight: 90, reps: 5, completed_at: null })).toBe(false)
  })

  it('legacy rows without completion metadata still count by weight+reps', () => {
    expect(isCompletedSet({ weight: 90, reps: 5 })).toBe(true)
    expect(isCompletedSet({ weight: 90, reps: null })).toBe(false)
  })

  it('computes volume for completed sets only', () => {
    expect(setVolumeKg({ weight: 90, reps: 5, completed: true })).toBe(450)
    expect(setVolumeKg({ weight: 90, reps: 5, completed: false })).toBe(0)

    const sets = [
      { weight: 50, reps: 10, completed: true },
      { weight: 50, reps: 10, completed: false },
      { weight: 90, reps: 5, completed: true },
    ]
    expect(totalVolumeKg(sets)).toBe(50 * 10 + 90 * 5)
  })

  it('formats volume with up to 1 decimal', () => {
    expect(formatVolumeKg(807.5)).toBe('807.5')
    expect(formatVolumeKg(800)).toBe('800')
    expect(formatVolumeKg(807.54)).toBe('807.5')
  })
})
