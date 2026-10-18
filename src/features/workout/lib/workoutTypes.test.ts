import { describe, expect, it } from 'vitest'
import { DEFAULT_WORKOUT_TYPES } from '../constants'
import { resolveWorkoutTypes } from './workoutTypes'

describe('resolveWorkoutTypes', () => {
  it('returns all spec defaults when stored list is missing or empty', () => {
    expect(resolveWorkoutTypes(null)).toEqual([...DEFAULT_WORKOUT_TYPES])
    expect(resolveWorkoutTypes([])).toEqual([...DEFAULT_WORKOUT_TYPES])
    expect(resolveWorkoutTypes(undefined)).toEqual([...DEFAULT_WORKOUT_TYPES])
  })

  it('respects user order and hidden defaults from Settings', () => {
    const resolved = resolveWorkoutTypes(['Pull', 'Legs', 'Olympic'])
    expect(resolved).toEqual(['Pull', 'Legs', 'Olympic'])
    expect(resolved).not.toContain('Push')
  })

  it('dedupes case-insensitively and trims', () => {
    expect(resolveWorkoutTypes(['  Pull ', 'pull', 'Push'])).toEqual(['Pull', 'Push'])
  })
})
