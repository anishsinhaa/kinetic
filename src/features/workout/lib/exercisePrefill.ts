/**
 * Last-session set prefill — applied once, only to an untouched exercise card.
 * Prevents the race where async prefill overwrites typed weight/reps or adds sets.
 */

export type PrefillSetSource = {
  weight: number | null
  reps: number | null
  displayWeight: number | null
}

export type PrefillDraftSet = {
  id: string
  weight: string
  reps: string
  completed: boolean
}

/** True when the card still has only the optimistic empty starter row. */
export function isExerciseUntouched(sets: PrefillDraftSet[]): boolean {
  if (sets.length !== 1) return false
  const only = sets[0]
  if (!only) return false
  if (only.completed) return false
  return only.weight === '' && only.reps === ''
}

/**
 * Apply last-session sets only when the card is still untouched and we have data.
 * Once the user types, adds a set, or completes a set, prefill must not touch rows.
 */
export function shouldApplySetPrefill(opts: {
  untouched: boolean
  hasPrefillRows: boolean
  /** When true, caller already applied prefill once for this card. */
  alreadyApplied?: boolean
}): boolean {
  if (opts.alreadyApplied) return false
  if (!opts.untouched) return false
  return opts.hasPrefillRows
}

export function buildPrefillDraftSets(
  sources: PrefillSetSource[],
  newId: () => string,
): Array<{
  id: string
  dbSetId: string
  weight: string
  reps: string
  toFailure: false
  completed: false
  completedAt: null
}> {
  return sources.map((s) => {
    const id = newId()
    return {
      id,
      dbSetId: id,
      weight: s.displayWeight != null ? String(s.displayWeight) : '',
      reps: s.reps != null ? String(s.reps) : '',
      toFailure: false as const,
      completed: false as const,
      completedAt: null,
    }
  })
}
