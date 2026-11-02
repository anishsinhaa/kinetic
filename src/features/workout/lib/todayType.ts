const listeners = new Set<() => void>()

function notifyTodayType(): void {
  for (const listener of listeners) listener()
}

export function todayTypeKey(userId: string, date: string): string {
  return `kinetic-today-type:v1:${userId}:${date}`
}

export function subscribeTodayType(cb: () => void): () => void {
  listeners.add(cb)
  const onStorage = () => cb()
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(cb)
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage)
  }
}

export function readTodayTypeRaw(userId: string, date: string): string | null {
  try {
    if (typeof window === 'undefined') return null
    return window.localStorage.getItem(todayTypeKey(userId, date))
  } catch {
    return null
  }
}

export function clearTodayType(userId: string, date: string): void {
  try {
    if (typeof window !== 'undefined') window.localStorage.removeItem(todayTypeKey(userId, date))
  } catch {
    // Storage can be blocked; listeners still refresh.
  }
  notifyTodayType()
}

export function writeTodayType(userId: string, date: string, type: string): void {
  const trimmed = type.trim().slice(0, 40)
  if (!trimmed) {
    clearTodayType(userId, date)
    return
  }
  try {
    if (typeof window === 'undefined') return
    const key = todayTypeKey(userId, date)
    window.localStorage.setItem(key, trimmed)
    const prefix = `kinetic-today-type:v1:${userId}:`
    const stale: string[] = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const stored = window.localStorage.key(i)
      if (stored && stored.startsWith(prefix) && stored !== key) stale.push(stored)
    }
    for (const stored of stale) window.localStorage.removeItem(stored)
  } catch {
    return
  }
  notifyTodayType()
}

/** Chip spelling when the stored value matches one of the user's types. */
export function resolveTodayType(raw: string | null, typeChips: string[]): string | null {
  const needle = raw?.trim().toLowerCase()
  if (!needle) return null
  return typeChips.find((chip) => chip.trim().toLowerCase() === needle) ?? null
}
