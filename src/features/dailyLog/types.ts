/**
 * Domain types for the Daily Log feature.
 * Used by components, hooks, and the service layer.
 */

import type { WeightUnits } from '../../lib/supabase/database.types'
import { roundBodyWeight, toStoredKg } from '../settings/lib/units'

export interface DailyLog {
  id: string
  userId: string
  date: string           // "YYYY-MM-DD"
  weight: number | null
  calories: number | null
  protein: number | null
  sleep: number | null
  notes: string
  createdAt: string
  updatedAt: string
}

/**
 * Fields the user can write. id, userId, timestamps are server-managed.
 */
export type DailyLogPayload = Pick<
  DailyLog,
  'weight' | 'calories' | 'protein' | 'sleep' | 'notes'
>

/**
 * Local form state — all strings so number inputs stay controlled.
 */
export interface DailyLogFormState {
  weight: string
  calories: string
  protein: string
  sleep: string
  notes: string
}

export const emptyFormState = (): DailyLogFormState => ({
  weight: '',
  calories: '',
  protein: '',
  sleep: '',
  notes: '',
})

export const logToFormState = (log: DailyLog): DailyLogFormState => ({
  weight: log.weight != null ? String(log.weight) : '',
  calories: log.calories != null ? String(log.calories) : '',
  protein: log.protein != null ? String(log.protein) : '',
  sleep: log.sleep != null ? String(log.sleep) : '',
  notes: log.notes ?? '',
})

export const formStateToPayload = (form: DailyLogFormState): DailyLogPayload => ({
  weight: form.weight !== '' ? parseFloat(form.weight) : null,
  calories: form.calories !== '' ? parseInt(form.calories, 10) : null,
  protein: form.protein !== '' ? parseInt(form.protein, 10) : null,
  sleep: form.sleep !== '' ? parseFloat(form.sleep) : null,
  notes: form.notes,
})

/** Form state for a stored log. Body weight is 0.1 precision, not the lifting step. */
export const logToDisplayForm = (
  log: DailyLog | null | undefined,
  units: WeightUnits,
): DailyLogFormState => {
  if (!log) return emptyFormState()
  const base = logToFormState(log)
  if (log.weight == null) return base
  return {
    ...base,
    weight: String(roundBodyWeight(log.weight, units)),
  }
}

/** Payload for a form entered in the user's units; weight is stored as kg. */
export const displayFormToPayload = (
  form: DailyLogFormState,
  units: WeightUnits,
): DailyLogPayload => {
  const payload = formStateToPayload(form)
  if (payload.weight == null || !Number.isFinite(payload.weight)) {
    return { ...payload, weight: null }
  }
  return { ...payload, weight: toStoredKg(payload.weight, units) }
}
