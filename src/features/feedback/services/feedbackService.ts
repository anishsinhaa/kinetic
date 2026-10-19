import { supabase } from '../../../lib/supabase/client'
import { toServiceError } from '../../../lib/supabase/errors'
import { todayDateString } from '../../dailyLog/services/dailyLogService'
import type { BodyFeedback, SorenessEntry } from '../types'

function isMissingColumn(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false
  const m = (error.message ?? '').toLowerCase()
  return error.code === 'PGRST204' || m.includes('column') || m.includes('schema cache')
}

type RawFeedbackRow = {
  id: string
  date: string
  fatigue: number | null
  sleep_quality: number | null
  pain_flag: boolean
  created_at?: string | null
  updated_at?: string | null
  muscle_soreness: Array<{ muscle_group: string; level: number | null }> | null
}

function mapFeedbackRow(row: RawFeedbackRow): BodyFeedback {
  return {
    id: row.id,
    date: row.date,
    fatigue: row.fatigue,
    sleep_quality: row.sleep_quality,
    pain_flag: row.pain_flag ?? false,
    soreness: (row.muscle_soreness ?? []).map((s) => ({
      muscle_group: s.muscle_group,
      level: s.level ?? 1,
    })),
    savedAt: row.updated_at ?? row.created_at ?? null,
  }
}

export async function getTodayFeedback(userId: string): Promise<BodyFeedback | null> {
  return getFeedbackByDate(userId, todayDateString())
}

/** Deletes the day's check-in (muscle_soreness rows cascade). */
export async function deleteFeedback(userId: string, date: string): Promise<void> {
  const { error } = await supabase
    .from('body_feedback')
    .delete()
    .eq('user_id', userId)
    .eq('date', date)
  if (error) throw toServiceError(error)
}

export async function getFeedbackByDate(
  userId: string,
  date: string,
): Promise<BodyFeedback | null> {
  const today = date

  const withUpdated = await supabase
    .from('body_feedback')
    .select(`
      id,
      date,
      fatigue,
      sleep_quality,
      pain_flag,
      created_at,
      updated_at,
      muscle_soreness ( muscle_group, level )
    `)
    .eq('user_id', userId)
    .eq('date', today)
    .maybeSingle()

  if (!withUpdated.error) {
    if (!withUpdated.data) return null
    return mapFeedbackRow(withUpdated.data as unknown as RawFeedbackRow)
  }

  // Pre-migration fallback (no updated_at)
  const legacy = await supabase
    .from('body_feedback')
    .select(`
      id,
      date,
      fatigue,
      sleep_quality,
      pain_flag,
      created_at,
      muscle_soreness ( muscle_group, level )
    `)
    .eq('user_id', userId)
    .eq('date', today)
    .maybeSingle()

  if (legacy.error) throw toServiceError(legacy.error)
  if (!legacy.data) return null
  return mapFeedbackRow(legacy.data as unknown as RawFeedbackRow)
}

export async function upsertFeedback(
  userId: string,
  payload: { fatigue: number; sleepQuality: number | null; painFlag: boolean },
  date: string = todayDateString(),
): Promise<{ id: string; savedAt: string }> {
  const today = date
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('body_feedback')
    .upsert(
      {
        user_id: userId,
        date: today,
        fatigue: payload.fatigue,
        sleep_quality: payload.sleepQuality,
        pain_flag: payload.painFlag,
        updated_at: now,
      },
      { onConflict: 'user_id,date' },
    )
    .select('id, updated_at, created_at')
    .single()

  if (!error && data) {
    const row = data as { id: string; updated_at?: string; created_at?: string }
    return { id: row.id, savedAt: row.updated_at ?? row.created_at ?? now }
  }

  // Only a missing-column error justifies the legacy retry (saves a round trip otherwise)
  if (error && !isMissingColumn(error)) throw toServiceError(error)

  // Fallback without updated_at column
  const legacy = await supabase
    .from('body_feedback')
    .upsert(
      {
        user_id: userId,
        date: today,
        fatigue: payload.fatigue,
        sleep_quality: payload.sleepQuality,
        pain_flag: payload.painFlag,
      },
      { onConflict: 'user_id,date' },
    )
    .select('id, created_at')
    .single()

  if (legacy.error) throw toServiceError(error ?? legacy.error)
  const row = legacy.data as { id: string; created_at?: string }
  return { id: row.id, savedAt: now }
}

async function clearMuscleSoreness(feedbackId: string): Promise<void> {
  const { error } = await supabase.from('muscle_soreness').delete().eq('feedback_id', feedbackId)
  if (error) throw toServiceError(error)
}

export async function saveMuscleSoreness(
  feedbackId: string,
  sorenessList: SorenessEntry[],
): Promise<void> {
  await clearMuscleSoreness(feedbackId)
  await insertMuscleSoreness(feedbackId, sorenessList)
}

async function insertMuscleSoreness(
  feedbackId: string,
  sorenessList: SorenessEntry[],
): Promise<void> {
  if (sorenessList.length === 0) return

  const { error: insertError } = await supabase
    .from('muscle_soreness')
    .insert(
      sorenessList.map((s) => ({
        feedback_id: feedbackId,
        muscle_group: s.muscle_group,
        level: s.level,
      })),
    )

  if (insertError) throw toServiceError(insertError)
}

export async function saveFeedback(
  userId: string,
  payload: {
    fatigue: number
    sleepQuality: number | null
    painFlag: boolean
    soreness: SorenessEntry[]
  },
  opts: {
    /** Local date (YYYY-MM-DD) to write; defaults to today. */
    date?: string
    /** Known feedback id for that date: lets the soreness clear run in parallel with the upsert. */
    existingId?: string | null
  } = {},
): Promise<{ id: string; savedAt: string }> {
  const date = opts.date ?? todayDateString()
  if (opts.existingId) {
    const [result] = await Promise.all([
      upsertFeedback(userId, payload, date),
      clearMuscleSoreness(opts.existingId),
    ])
    await insertMuscleSoreness(result.id, payload.soreness)
    return result
  }
  const result = await upsertFeedback(userId, payload, date)
  await insertMuscleSoreness(result.id, payload.soreness)
  return result
}

export async function getFeedbackHistory(userId: string): Promise<BodyFeedback[]> {
  const { data, error } = await supabase
    .from('body_feedback')
    .select(`
      id,
      date,
      fatigue,
      sleep_quality,
      pain_flag,
      created_at,
      muscle_soreness ( muscle_group, level )
    `)
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(30)

  if (error) throw toServiceError(error)

  return (data ?? []).map((row) => mapFeedbackRow(row as unknown as RawFeedbackRow))
}
