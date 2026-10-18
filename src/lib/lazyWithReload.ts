import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

const RELOAD_KEY = 'kinetic_chunk_reload'

/**
 * React.lazy wrapper: on dynamic-import failure (stale SW / missing chunk after
 * deploy), reload once. Clears the flag after a successful import.
 */
export function lazyWithReload<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      const mod = await factory()
      try {
        sessionStorage.removeItem(RELOAD_KEY)
      } catch {
        /* ignore */
      }
      return mod
    } catch (err) {
      try {
        const already = sessionStorage.getItem(RELOAD_KEY)
        if (!already) {
          sessionStorage.setItem(RELOAD_KEY, '1')
          window.location.reload()
          // Suspend forever until the reload completes
          return await new Promise<{ default: T }>(() => {})
        }
        sessionStorage.removeItem(RELOAD_KEY)
      } catch {
        /* ignore storage errors */
      }
      throw err
    }
  })
}
