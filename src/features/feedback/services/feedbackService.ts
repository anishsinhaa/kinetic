import { supabase } from '../../../lib/supabase/client'
import { toServiceError } from '../../../lib/supabase/errors'
import type { BodyFeedback, SorenessEntry } from '../types'

function todayDateString(): string {
  return new Date().toISOString().split('T')[0]
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
  const today = todayDateString()

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
  payload: { fatigue: number; sleepQuality: number; painFlag: boolean },
): Promise<{ id: string; savedAt: string }> {
  const today = todayDateString()
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

export async function saveMuscleSoreness(
  feedbackId: string,
  sorenessList: SorenessEntry[],
): Promise<void> {
  const { error: deleteError } = await supabase
    .from('muscle_soreness')
    .delete()
    .eq('feedback_id', feedbackId)

  if (deleteError) throw toServiceError(deleteError)
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
  payload: { fatigue: number; sleepQuality: number; painFlag: boolean; soreness: SorenessEntry[] },
): Promise<{ id: string; savedAt: string }> {
  const result = await upsertFeedback(userId, payload)
  await saveMuscleSoreness(result.id, payload.soreness)
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
