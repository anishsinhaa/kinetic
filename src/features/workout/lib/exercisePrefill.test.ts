import { describe, expect, it } from 'vitest'
import {
  buildPrefillDraftSets,
  isExerciseUntouched,
  shouldApplySetPrefill,
} from './exercisePrefill'

describe('exercisePrefill', () => {
  it('treats a single empty incomplete row as untouched', () => {
    expect(
      isExerciseUntouched([{ id: 'a', weight: '', reps: '', completed: false }]),
    ).toBe(true)
  })

  it('marks card touched when user typed weight or reps', () => {
    expect(
      isExerciseUntouched([{ id: 'a', weight: '20', reps: '', completed: false }]),
    ).toBe(false)
    expect(
      isExerciseUntouched([{ id: 'a', weight: '', reps: '8', completed: false }]),
    ).toBe(false)
  })

  it('marks card touched when user completes a set or adds another', () => {
    expect(
      isExerciseUntouched([{ id: 'a', weight: '20', reps: '8', completed: true }]),
    ).toBe(false)
    expect(
      isExerciseUntouched([
        { id: 'a', weight: '', reps: '', completed: false },
        { id: 'b', weight: '', reps: '', completed: false },
      ]),
    ).toBe(false)
  })

  it('applies prefill only to untouched cards with data, once', () => {
    expect(
      shouldApplySetPrefill({ untouched: true, hasPrefillRows: true }),
    ).toBe(true)
    expect(
      shouldApplySetPrefill({ untouched: false, hasPrefillRows: true }),
    ).toBe(false)
    expect(
      shouldApplySetPrefill({ untouched: true, hasPrefillRows: false }),
    ).toBe(false)
    expect(
      shouldApplySetPrefill({
        untouched: true,
        hasPrefillRows: true,
        alreadyApplied: true,
      }),
    ).toBe(false)
  })

  it('builds draft rows with stable ids from factory (no shared empty id)', () => {
    let n = 0
    const rows = buildPrefillDraftSets(
      [
        { weight: 80, reps: 5, displayWeight: 176.4 },
        { weight: 85, reps: 6, displayWeight: 187.4 },
      ],
      () => `id-${++n}`,
    )
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      id: 'id-1',
      weight: '176.4',
      reps: '5',
      completed: false,
    })
    expect(rows[1]).toMatchObject({ id: 'id-2', weight: '187.4', reps: '6' })
  })

  it('race: typed values must not be replaced when shouldApply is false', () => {
    const userSets = [{ id: 'user-1', weight: '20', reps: '8', completed: true }]
    const untouched = isExerciseUntouched(userSets)
    const apply = shouldApplySetPrefill({
      untouched,
      hasPrefillRows: true,
    })
    expect(apply).toBe(false)
    // Caller keeps userSets — prefill payload is ignored
    expect(userSets[0]?.weight).toBe('20')
  })
})
