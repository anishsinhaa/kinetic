import type { FocusEvent } from 'react'

/** Select existing value so typing replaces prefilled weight/reps instead of appending. */
export function selectOnFocus(e: FocusEvent<HTMLInputElement>) {
  // Defer so mobile browsers finish focusing before select()
  requestAnimationFrame(() => {
    e.target.select()
  })
}
