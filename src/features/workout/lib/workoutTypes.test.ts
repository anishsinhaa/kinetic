import { describe, expect, it } from 'vitest'
import { DEFAULT_WORKOUT_TYPES } from '../constants'
import { resolveWorkoutTypes } from './workoutTypes'

describe('resolveWorkoutTypes', () => {
  it('returns all spec defaults when stored list is missing or empty', () => {
    expect(resolveWorkoutTypes(null)).toEqual([...DEFAULT_WORKOUT_TYPES])
    expect(resolveWorkoutTypes([])).toEqual([...DEFAULT_WORKOUT_TYPES])
    expect(resolveWorkoutTypes(undefined)).toEqual([...DEFAULT_WORKOUT_TYPES])
  })

  it('expands a short localStorage list like Upper + Pull to include all defaults', () => {
    const resolved = resolveWorkoutTypes(['Upper', 'Pull'])
    expect(resolved).toEqual([...DEFAULT_WORKOUT_TYPES])
    expect(resolved).toContain('Push')
    expect(resolved).toContain('Legs')
    expect(resolved).toContain('Full Body')
    expect(resolved).toContain('Free')
  })

  it('appends custom types after defaults', () => {
    const resolved = resolveWorkoutTypes(['Pull', 'Olympic'])
    expect(resolved.slice(0, DEFAULT_WORKOUT_TYPES.length)).toEqual([...DEFAULT_WORKOUT_TYPES])
    expect(resolved).toContain('Olympic')
  })
})
