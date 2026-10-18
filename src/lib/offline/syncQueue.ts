/**
 * Offline mutation queue — persists pending writes and flushes when online.
 */

export type OfflineOp =
  | {
      id: string
      kind: 'upsert_set'
      createdAt: string
      payload: {
        setId: string
        workoutExerciseId: string
        reps: number | null
        weight: number | null
        to_failure: boolean
        set_index: number
        completed_at: string | null
      }
    }
  | {
      id: string
      kind: 'upsert_daily_log'
      createdAt: string
      payload: {
        userId: string
        date: string
        weight: number | null
        calories: number | null
        protein: number | null
        sleep: number | null
        notes: string
      }
    }

const STORAGE_KEY = 'kinetic_offline_queue_v1'

function readQueue(): OfflineOp[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as OfflineOp[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeQueue(ops: OfflineOp[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ops))
}

export function enqueueOfflineOp(op: Omit<OfflineOp, 'id' | 'createdAt'> & { id?: string }): string {
  const id = op.id ?? crypto.randomUUID()
  const full = { ...op, id, createdAt: new Date().toISOString() } as OfflineOp
  const q = readQueue().filter((o) => {
    // Dedupe set upserts by setId — keep latest
    if (full.kind === 'upsert_set' && o.kind === 'upsert_set') {
      return o.payload.setId !== full.payload.setId
    }
    if (full.kind === 'upsert_daily_log' && o.kind === 'upsert_daily_log') {
      return !(o.payload.userId === full.payload.userId && o.payload.date === full.payload.date)
    }
    return true
  })
  q.push(full)
  writeQueue(q)
  return id
}

export function peekOfflineQueue(): OfflineOp[] {
  return readQueue()
}

export function clearOfflineOp(id: string) {
  writeQueue(readQueue().filter((o) => o.id !== id))
}

export function isOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine
}

type FlushHandlers = {
  upsertSet: (op: Extract<OfflineOp, { kind: 'upsert_set' }>) => Promise<void>
  upsertDailyLog: (op: Extract<OfflineOp, { kind: 'upsert_daily_log' }>) => Promise<void>
}

let flushing = false

export async function flushOfflineQueue(handlers: FlushHandlers): Promise<number> {
  if (flushing || !isOnline()) return 0
  flushing = true
  let synced = 0
  try {
    const ops = readQueue()
    for (const op of ops) {
      try {
        if (op.kind === 'upsert_set') await handlers.upsertSet(op)
        else if (op.kind === 'upsert_daily_log') await handlers.upsertDailyLog(op)
        clearOfflineOp(op.id)
        synced += 1
      } catch (err) {
        console.error('[offlineSync] failed', op.kind, err)
        break // stop on first failure — retry later
      }
    }
  } finally {
    flushing = false
  }
  return synced
}
