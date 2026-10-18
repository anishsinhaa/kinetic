import { describe, expect, it } from 'vitest'
import {
  SETS_UPSERT_COLUMNS,
  buildSetUpsertPayload,
} from './workoutService'

/** Canonical public.sets columns (schema + v2 migration). */
const SETS_TABLE_COLUMNS = [
  'id',
  'workout_exercise_id',
  'set_index',
  'reps',
  'weight',
  'to_failure',
  'failed',
  'completed_at',
  'created_at',
] as const

describe('sets upsert payload', () => {
  it('includes every writeable sets column (never a stripped subset)', () => {
    const payload = buildSetUpsertPayload('set-1', 'we-1', {
      reps: 8,
      weight: 80,
      to_failure: true,
      set_index: 2,
      completed_at: '2026-10-17T12:00:00.000Z',
    })

    expect(Object.keys(payload).sort()).toEqual([...SETS_UPSERT_COLUMNS].sort())

    for (const col of SETS_UPSERT_COLUMNS) {
      expect(SETS_TABLE_COLUMNS).toContain(col)
    }

    expect(payload).toEqual({
      id: 'set-1',
      workout_exercise_id: 'we-1',
      reps: 8,
      weight: 80,
      to_failure: true,
      failed: true,
      completed_at: '2026-10-17T12:00:00.000Z',
      set_index: 2,
    })
  })

  it('maps failed from to_failure and nulls incomplete completed_at', () => {
    const payload = buildSetUpsertPayload('set-2', 'we-2', {
      reps: null,
      weight: null,
      to_failure: false,
      set_index: 1,
      completed_at: null,
    })
    expect(payload.failed).toBe(false)
    expect(payload.to_failure).toBe(false)
    expect(payload.completed_at).toBeNull()
  })
})
