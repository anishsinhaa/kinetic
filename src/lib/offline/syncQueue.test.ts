import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  enqueueOfflineOp,
  peekOfflineQueue,
  clearOfflineOp,
  flushOfflineQueue,
} from './syncQueue'

// ─── localStorage mock ────────────────────────────────────────────────────────
let store: Record<string, string> = {}

beforeEach(() => {
  store = {}
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v },
    removeItem: (k: string) => { delete store[k] },
    clear: () => { store = {} },
  })
  vi.stubGlobal('navigator', { onLine: true })
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSetOp(setId: string) {
  return {
    kind: 'upsert_set' as const,
    payload: {
      setId,
      workoutExerciseId: 'we-1',
      reps: 8,
      weight: 80,
      to_failure: false,
      set_index: 0,
      completed_at: null,
    },
  }
}

function makeLogOp(date: string) {
  return {
    kind: 'upsert_daily_log' as const,
    payload: {
      userId: 'u-1',
      date,
      weight: 80,
      calories: 2500,
      protein: 180,
      sleep: 7.5,
      notes: '',
    },
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('enqueueOfflineOp / peekOfflineQueue', () => {
  it('adds an op and returns it', () => {
    enqueueOfflineOp(makeSetOp('s1'))
    const q = peekOfflineQueue()
    expect(q).toHaveLength(1)
    expect(q[0].kind).toBe('upsert_set')
  })

  it('deduplicates set ops by setId — keeps latest', () => {
    enqueueOfflineOp({ ...makeSetOp('s1'), payload: { ...makeSetOp('s1').payload, reps: 8 } })
    enqueueOfflineOp({ ...makeSetOp('s1'), payload: { ...makeSetOp('s1').payload, reps: 10 } })
    const q = peekOfflineQueue()
    expect(q).toHaveLength(1)
    expect((q[0] as Extract<typeof q[0], { kind: 'upsert_set' }>).payload.reps).toBe(10)
  })

  it('deduplicates daily log ops by userId+date', () => {
    enqueueOfflineOp({ ...makeLogOp('2026-10-18'), payload: { ...makeLogOp('2026-10-18').payload, weight: 80 } })
    enqueueOfflineOp({ ...makeLogOp('2026-10-18'), payload: { ...makeLogOp('2026-10-18').payload, weight: 79.5 } })
    const q = peekOfflineQueue()
    expect(q).toHaveLength(1)
    expect((q[0] as Extract<typeof q[0], { kind: 'upsert_daily_log' }>).payload.weight).toBe(79.5)
  })

  it('keeps different dates as separate ops', () => {
    enqueueOfflineOp(makeLogOp('2026-10-17'))
    enqueueOfflineOp(makeLogOp('2026-10-18'))
    expect(peekOfflineQueue()).toHaveLength(2)
  })
})

describe('clearOfflineOp', () => {
  it('removes only the specified op', () => {
    const id1 = enqueueOfflineOp(makeSetOp('s1'))
    const id2 = enqueueOfflineOp(makeSetOp('s2'))
    clearOfflineOp(id1)
    const q = peekOfflineQueue()
    expect(q).toHaveLength(1)
    expect(q[0].id).toBe(id2)
  })
})

describe('flushOfflineQueue', () => {
  it('calls handlers for each op and clears them', async () => {
    enqueueOfflineOp(makeSetOp('s1'))
    enqueueOfflineOp(makeLogOp('2026-10-18'))
    const upsertSet = vi.fn(async () => {})
    const upsertDailyLog = vi.fn(async () => {})
    const synced = await flushOfflineQueue({ upsertSet, upsertDailyLog })
    expect(synced).toBe(2)
    expect(upsertSet).toHaveBeenCalledTimes(1)
    expect(upsertDailyLog).toHaveBeenCalledTimes(1)
    expect(peekOfflineQueue()).toHaveLength(0)
  })

  it('stops on first handler failure and leaves remaining ops', async () => {
    enqueueOfflineOp(makeSetOp('s1'))
    enqueueOfflineOp(makeSetOp('s2'))
    let calls = 0
    const upsertSet = vi.fn(async () => {
      calls++
      if (calls >= 1) throw new Error('network error')
    })
    const upsertDailyLog = vi.fn(async () => {})
    const synced = await flushOfflineQueue({ upsertSet, upsertDailyLog })
    expect(synced).toBe(0)
    expect(peekOfflineQueue()).toHaveLength(2)
  })

  it('returns 0 when offline', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    enqueueOfflineOp(makeSetOp('s1'))
    const synced = await flushOfflineQueue({ upsertSet: vi.fn(), upsertDailyLog: vi.fn() })
    expect(synced).toBe(0)
    expect(peekOfflineQueue()).toHaveLength(1)
  })
})
