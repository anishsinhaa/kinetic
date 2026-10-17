export type SetPersistPayload = {
  setId: string
  workoutExerciseId: string
  reps: number | null
  weight: number | null
  toFailure: boolean
  setIndex: number
}

export type SetPersistQueue = {
  /** Debounce a save for this set (latest payload wins). */
  schedule: (payload: SetPersistPayload) => void
  /** Flush one set immediately (cancels its debounce). */
  flush: (setId: string) => Promise<void>
  /** Flush every pending / in-flight set save. */
  flushAll: () => Promise<void>
  /** True if anything is waiting or saving. */
  hasPending: () => boolean
}

type UpsertFn = (payload: SetPersistPayload) => Promise<void>

/**
 * One upsert path per set id: debounce writes, serialize per set, never race.
 */
export function createSetPersistQueue(
  upsert: UpsertFn,
  debounceMs = 300,
): SetPersistQueue {
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const latest = new Map<string, SetPersistPayload>()
  const chains = new Map<string, Promise<void>>()

  const runUpsert = async (setId: string) => {
    const payload = latest.get(setId)
    if (!payload) return
    // Clear before await so a concurrent schedule can stage a newer payload
    latest.delete(setId)
    await upsert(payload)
    // If something newer arrived while we were saving, run again
    if (latest.has(setId)) {
      await runUpsert(setId)
    }
  }

  const enqueue = (setId: string) => {
    const prev = chains.get(setId) ?? Promise.resolve()
    const next = prev
      .catch(() => {
        /* keep chain alive */
      })
      .then(() => runUpsert(setId))
    chains.set(setId, next)
    return next
  }

  const schedule = (payload: SetPersistPayload) => {
    latest.set(payload.setId, payload)
    const existing = timers.get(payload.setId)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(() => {
      timers.delete(payload.setId)
      void enqueue(payload.setId)
    }, debounceMs)
    timers.set(payload.setId, timer)
  }

  const flush = async (setId: string) => {
    const timer = timers.get(setId)
    if (timer) {
      clearTimeout(timer)
      timers.delete(setId)
    }
    if (latest.has(setId) || chains.has(setId)) {
      await enqueue(setId)
    }
  }

  const flushAll = async () => {
    const ids = new Set<string>([
      ...timers.keys(),
      ...latest.keys(),
      ...chains.keys(),
    ])
    for (const id of ids) {
      const timer = timers.get(id)
      if (timer) {
        clearTimeout(timer)
        timers.delete(id)
      }
    }
    await Promise.allSettled([...ids].map((id) => enqueue(id)))
  }

  const hasPending = () =>
    timers.size > 0 || latest.size > 0 || [...chains.values()].length > 0

  return { schedule, flush, flushAll, hasPending }
}
