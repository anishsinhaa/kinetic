export const AUTO_FINISH_AFTER_MS = 10 * 60 * 60 * 1000
export const AUTO_FINISH_HOURS = AUTO_FINISH_AFTER_MS / 3_600_000

function parsedMs(value: string | null | undefined): number | null {
  if (!value) return null
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? ms : null
}

export function workoutStartMs(
  startedAt: string | null | undefined,
  createdAt?: string | null,
): number | null {
  return parsedMs(startedAt) ?? parsedMs(createdAt)
}

export function isPastAutoFinishLimit(
  startedAt: string | null | undefined,
  createdAt?: string | null,
  nowMs = Date.now(),
): boolean {
  const start = workoutStartMs(startedAt, createdAt)
  if (start == null) return false
  return nowMs - start >= AUTO_FINISH_AFTER_MS
}

/** Latest completed-set time, never before the workout start and never after now. */
export function autoFinishEndedAt(
  completedAts: Array<string | null | undefined>,
  startMs: number | null,
  nowMs = Date.now(),
): string | null {
  let latest: number | null = null
  for (const value of completedAts) {
    const ms = parsedMs(value)
    if (ms == null) continue
    if (latest == null || ms > latest) latest = ms
  }
  if (latest == null) return null
  const floor = startMs ?? Number.NEGATIVE_INFINITY
  const clamped = Math.min(nowMs, Math.max(floor, latest))
  if (!Number.isFinite(clamped)) return null
  return new Date(clamped).toISOString()
}
