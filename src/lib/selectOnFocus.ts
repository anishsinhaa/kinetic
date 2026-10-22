import type { FocusEvent } from 'react'

/**
 * Select existing value so typing replaces prefilled weight/reps instead of appending.
 * If a character lands before the deferred select (sheet just opened, fast typing),
 * skip it — otherwise that first digit is highlighted and the next key replaces it
 * ("160" becomes "60").
 */
export function selectOnFocus(e: FocusEvent<HTMLInputElement>) {
  const el = e.currentTarget
  const valueAtFocus = el.value
  requestAnimationFrame(() => {
    if (el.value !== valueAtFocus) return
    el.select()
  })
}
