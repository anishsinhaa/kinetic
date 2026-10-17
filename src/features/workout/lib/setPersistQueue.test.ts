import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSetPersistQueue, type SetPersistPayload } from './setPersistQueue'

function payload(partial: Partial<SetPersistPayload> & { setId: string }): SetPersistPayload {
  return {
    workoutExerciseId: 'we-1',
    reps: 5,
    weight: 90,
    toFailure: false,
    setIndex: 1,
    ...partial,
  }
}

describe('createSetPersistQueue', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounces and upserts the latest payload once per set', async () => {
    vi.useFakeTimers()
    const upserts: SetPersistPayload[] = []
    const queue = createSetPersistQueue(async (p) => {
      upserts.push({ ...p })
    }, 300)

    queue.schedule(payload({ setId: 's1', reps: 8, weight: 90 }))
    queue.schedule(payload({ setId: 's1', reps: 5, weight: 90 }))

    expect(upserts).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(300)
    expect(upserts).toHaveLength(1)
    expect(upserts[0]?.reps).toBe(5)
  })

  it('flush writes immediately and does not duplicate', async () => {
    vi.useFakeTimers()
    const upserts: SetPersistPayload[] = []
    const queue = createSetPersistQueue(async (p) => {
      upserts.push({ ...p })
    }, 300)

    queue.schedule(payload({ setId: 's1', reps: 8 }))
    queue.schedule(payload({ setId: 's1', reps: 5 }))
    await queue.flush('s1')

    expect(upserts).toHaveLength(1)
    expect(upserts[0]?.reps).toBe(5)

    await vi.advanceTimersByTimeAsync(300)
    expect(upserts).toHaveLength(1)
  })

  it('flushAll drains every pending set before continuing', async () => {
    vi.useFakeTimers()
    const upserts: string[] = []
    const queue = createSetPersistQueue(async (p) => {
      upserts.push(p.setId)
    }, 300)

    queue.schedule(payload({ setId: 'a', reps: 10 }))
    queue.schedule(payload({ setId: 'b', reps: 8 }))
    await queue.flushAll()

    expect(upserts.sort()).toEqual(['a', 'b'])
  })
})
