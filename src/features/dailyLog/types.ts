/**
 * Domain types for the Daily Log feature.
 * Used by components, hooks, and the service layer.
 */

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
