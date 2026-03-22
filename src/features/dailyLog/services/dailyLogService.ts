/**
 * dailyLogService
 *
 * All Supabase I/O for the daily_logs table lives here.
 * Components and hooks must NEVER import `supabase` directly —
 * they call these functions only.
 */

import { supabase } from '../../../lib/supabase/client'
import { toServiceError } from '../../../lib/supabase/errors'
import type { DailyLogRow } from '../../../lib/supabase/database.types'
import type { DailyLog, DailyLogPayload } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// Mappers  (DB row ↔ domain type)
// ─────────────────────────────────────────────────────────────────────────────

function rowToDomain(row: DailyLogRow): DailyLog {
  return {
    id: row.id,
    userId: row.user_id,
    date: row.date,
    weight: row.weight,
    calories: row.calories,
    protein: row.protein,
    sleep: row.sleep,
    notes: row.notes ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Returns today's date as "YYYY-MM-DD" in the local timezone. */
export function todayDateString(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

// ─────────────────────────────────────────────────────────────────────────────
// getTodayLog
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches the current user's daily log for today.
 * Returns null if no row exists yet — the caller should show empty inputs.
 */
export async function getTodayLog(userId: string): Promise<DailyLog | null> {
  const { data, error } = await supabase
    .from('daily_logs')
    .select('*')
    .eq('user_id', userId)
    .eq('date', todayDateString())
    .maybeSingle()

  if (error) throw toServiceError(error)

  return data ? rowToDomain(data as DailyLogRow) : null
}

// ─────────────────────────────────────────────────────────────────────────────
// getLogByDate
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches the log for a specific date ("YYYY-MM-DD").
 * Returns null if no row exists.
 */
export async function getLogByDate(
  userId: string,
  date: string,
): Promise<DailyLog | null> {
  const { data, error } = await supabase
    .from('daily_logs')
    .select('*')
    .eq('user_id', userId)
    .eq('date', date)
    .maybeSingle()

  if (error) throw toServiceError(error)

  return data ? rowToDomain(data as DailyLogRow) : null
}

// ─────────────────────────────────────────────────────────────────────────────
// getRecentLogs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the most recent `limit` logs ordered newest first.
 * Used by the History page.
 */
export async function getRecentLogs(
  userId: string,
  limit = 30,
): Promise<DailyLog[]> {
  const { data, error } = await supabase
    .from('daily_logs')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(limit)

  if (error) throw toServiceError(error)

  return (data as DailyLogRow[]).map(rowToDomain)
}

// ─────────────────────────────────────────────────────────────────────────────
// upsertDailyLog
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates or updates today's daily log using Supabase upsert.
 * The unique constraint on (user_id, date) means this is safe to call
 * on every blur/autosave without creating duplicates.
 *
 * Returns the saved log (with server-generated id + timestamps).
 */
export async function upsertDailyLog(
  userId: string,
  payload: DailyLogPayload,
  date: string = todayDateString(),
): Promise<DailyLog> {
  const { data, error } = await supabase
    .from('daily_logs')
    .upsert(
      {
        user_id: userId,
        date,
        weight: payload.weight,
        calories: payload.calories,
        protein: payload.protein,
        sleep: payload.sleep,
        notes: payload.notes || null,
      },
      { onConflict: 'user_id,date' },
    )
    .select()
    .single()

  if (error) throw toServiceError(error)

  return rowToDomain(data as DailyLogRow)
}
