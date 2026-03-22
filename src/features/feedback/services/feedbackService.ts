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
  }
}

// ---------------------------------------------------------------------------
// Get today's feedback (with soreness)
// ---------------------------------------------------------------------------

export async function getTodayFeedback(userId: string): Promise<BodyFeedback | null> {
  const today = todayDateString()

  const { data, error } = await supabase
    .from('body_feedback')
    .select(`
      id,
      date,
      fatigue,
      sleep_quality,
      pain_flag,
      muscle_soreness ( muscle_group, level )
    `)
    .eq('user_id', userId)
    .eq('date', today)
    .maybeSingle()

  if (error) throw toServiceError(error)
  if (!data) return null

  return mapFeedbackRow(data as unknown as RawFeedbackRow)
}

// ---------------------------------------------------------------------------
// Upsert feedback (insert or update by user_id + date)
// Returns the feedback row id
// ---------------------------------------------------------------------------

export async function upsertFeedback(
  userId: string,
  payload: { fatigue: number; sleepQuality: number; painFlag: boolean },
): Promise<string> {
  const today = todayDateString()

  const { data, error } = await supabase
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
    .select('id')
    .single()

  if (error) throw toServiceError(error)
  return (data as { id: string }).id
}

// ---------------------------------------------------------------------------
// Save muscle soreness — full replace strategy
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Full save — upsert feedback + replace soreness (atomic from UI's perspective)
// ---------------------------------------------------------------------------

export async function saveFeedback(
  userId: string,
  payload: { fatigue: number; sleepQuality: number; painFlag: boolean; soreness: SorenessEntry[] },
): Promise<string> {
  const feedbackId = await upsertFeedback(userId, payload)
  await saveMuscleSoreness(feedbackId, payload.soreness)
  return feedbackId
}

// ---------------------------------------------------------------------------
// Feedback history (last 30 days)
// ---------------------------------------------------------------------------

export async function getFeedbackHistory(userId: string): Promise<BodyFeedback[]> {
  const { data, error } = await supabase
    .from('body_feedback')
    .select(`
      id,
      date,
      fatigue,
      sleep_quality,
      pain_flag,
      muscle_soreness ( muscle_group, level )
    `)
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(30)

  if (error) throw toServiceError(error)

  return (data ?? []).map((row) => mapFeedbackRow(row as unknown as RawFeedbackRow))
}
