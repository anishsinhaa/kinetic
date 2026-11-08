type DraftEnvelope<T> = {
  savedAt: number
  value: T
}

export function draftKey(userId: string, page: string, id?: string): string {
  return id
    ? `kinetic-draft:v1:${userId}:${page}:${id}`
    : `kinetic-draft:v1:${userId}:${page}`
}

export function saveDraft(key: string, value: unknown): void {
  try {
    if (typeof window === 'undefined') return
    const envelope: DraftEnvelope<unknown> = { savedAt: Date.now(), value }
    window.localStorage.setItem(key, JSON.stringify(envelope))
  } catch {
    // Storage can be blocked.
  }
}

export function loadDraft<T>(key: string, maxAgeMs = 7 * 24 * 60 * 60 * 1000): T | null {
  try {
    if (typeof window === 'undefined') return null
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as DraftEnvelope<T>
    if (!parsed || typeof parsed.savedAt !== 'number') return null
    if (Date.now() - parsed.savedAt > maxAgeMs) {
      window.localStorage.removeItem(key)
      return null
    }
    return parsed.value ?? null
  } catch {
    return null
  }
}

export function clearDraft(key: string): void {
  try {
    if (typeof window === 'undefined') return
    window.localStorage.removeItem(key)
  } catch {
    // Storage can be blocked.
  }
}
