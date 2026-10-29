import { supabase } from '../../../lib/supabase/client'
import { toServiceError } from '../../../lib/supabase/errors'

export const restDayKeys = {
  all: (userId: string) => ['rest-days', userId] as const,
  range: (userId: string, from?: string, to?: string) =>
    ['rest-days', userId, from ?? null, to ?? null] as const,
}

function isMissingTableError(
  error: { message?: string; code?: string; details?: string } | null,
): boolean {
  if (!error) return false
  const code = error.code ?? ''
  if (code === 'PGRST205' || code === '42P01') return true
  const blob = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase()
  return (
    blob.includes('could not find the table') ||
    blob.includes('does not exist') ||
    blob.includes('schema cache')
  )
}

/** YYYY-MM-DD rest days for a user. Optional inclusive local-date range. Never throws. */
export async function listRestDays(
  userId: string,
  range?: { from?: string; to?: string },
): Promise<string[]> {
  try {
    let query = supabase.from('rest_days').select('date').eq('user_id', userId)
    if (range?.from) query = query.gte('date', range.from)
    if (range?.to) query = query.lte('date', range.to)
    const { data, error } = await query.order('date', { ascending: true })
    if (error) {
      if (!isMissingTableError(error)) console.warn('[rest-days]', error.message)
      return []
    }
    return (data ?? []).map((row) => String((row as { date: string }).date))
  } catch (err) {
    console.warn('[rest-days]', err)
    return []
  }
}

export async function markRestDay(userId: string, date: string): Promise<void> {
  const { error } = await supabase
    .from('rest_days')
    .upsert({ user_id: userId, date }, { onConflict: 'user_id,date', ignoreDuplicates: true })
  if (!error) return
  if (isMissingTableError(error)) throw new Error('Rest days are not available yet')
  throw toServiceError(error)
}

export async function unmarkRestDay(userId: string, date: string): Promise<void> {
  const { error } = await supabase.from('rest_days').delete().eq('user_id', userId).eq('date', date)
  if (!error) return
  if (isMissingTableError(error)) throw new Error('Rest days are not available yet')
  throw toServiceError(error)
}
