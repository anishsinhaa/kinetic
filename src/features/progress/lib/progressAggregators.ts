/**
 * Pure aggregation helpers for the Progress page.
 * All functions are stateless and tested independently.
 */

import { bestPersonalRecord, isPersonalRecord } from '../../workout/lib/prDetection'
import type { ExerciseHistory, ExerciseHistorySession } from '../../history/types'
import type { DailyLogEntry } from '../../history/types'

// ─── ISO week helpers ────────────────────────────────────────────────────────

/** Returns "YYYY-Www" ISO week string for a given date string ("YYYY-MM-DD"). */
export function isoWeek(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  const day = d.getUTCDay() === 0 ? 7 : d.getUTCDay() // Mon=1 … Sun=7
  const thursday = new Date(d)
  thursday.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

/** Human-readable label for an ISO week string like "2026-W42" → "W42 '26" */
export function isoWeekLabel(isoW: string): string {
  const [year, w] = isoW.split('-')
  return `${w} '${(year ?? '').slice(2)}`
}

// ─── Per-exercise time series ────────────────────────────────────────────────

export interface ExerciseDataPoint {
  date: string           // "YYYY-MM-DD"
  workoutId: string
  /** Best set weight in kg for the session. */
  bestWeight: number
  /** Reps of the best set. */
  bestReps: number
  /** Total session volume (kg). */
  volume: number
}

/**
 * Produces a chronological series of data points for one exercise.
 * One point per session (workoutId).
 */
export function exerciseTimeSeries(sessions: ExerciseHistorySession[]): ExerciseDataPoint[] {
  const ordered = [...sessions].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  )
  return ordered.map((s) => {
    const best = bestPersonalRecord(s.sets) ?? { weight: 0, reps: 0 }
    return {
      date: s.date,
      workoutId: s.workoutId,
      bestWeight: best.weight,
      bestReps: best.reps,
      volume: s.totalVolume,
    }
  })
}

// ─── PR timeline ─────────────────────────────────────────────────────────────

export interface PrEvent {
  date: string
  weight: number
  reps: number
}

/**
 * Returns the list of sessions where the best set was an all-time PR at that point.
 * Chronological order; each event is the first time that weight/reps was achieved.
 */
export function exercisePrTimeline(sessions: ExerciseHistorySession[]): PrEvent[] {
  const ordered = [...sessions].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  )
  const events: PrEvent[] = []
  let runningBest = null as { weight: number; reps: number } | null

  for (const session of ordered) {
    for (const set of session.sets) {
      if (isPersonalRecord(set, runningBest)) {
        if (set.weight != null && set.reps != null) {
          runningBest = { weight: set.weight, reps: set.reps }
          // Replace if same date (keep only the peak for each date)
          const last = events[events.length - 1]
          if (last && last.date === session.date) {
            events[events.length - 1] = { date: session.date, weight: set.weight, reps: set.reps }
          } else {
            events.push({ date: session.date, weight: set.weight, reps: set.reps })
          }
        }
      }
    }
  }
  return events
}

// ─── Body weight trend ───────────────────────────────────────────────────────

export interface WeightPoint {
  date: string
  weight: number
}

/**
 * Extracts (date, weight) pairs from daily logs, newest first.
 * Filters out null weights.
 */
export function bodyWeightSeries(logs: DailyLogEntry[]): WeightPoint[] {
  return logs
    .filter((l) => l.weight != null)
    .map((l) => ({ date: l.date, weight: l.weight! }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
}

// ─── Weekly volume ───────────────────────────────────────────────────────────

export interface WeeklyVolumePoint {
  week: string   // "YYYY-Www"
  label: string  // "W42 '26"
  volume: number
}

/**
 * Aggregates exercise history sessions into weekly completed-set volume (kg).
 * Returns chronological order, most recent last.
 */
export function weeklyVolumeSeries(histories: ExerciseHistory[]): WeeklyVolumePoint[] {
  const byWeek = new Map<string, number>()

  for (const ex of histories) {
    for (const session of ex.sessions) {
      const week = isoWeek(session.date)
      byWeek.set(week, (byWeek.get(week) ?? 0) + session.totalVolume)
    }
  }

  return Array.from(byWeek.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, volume]) => ({ week, label: isoWeekLabel(week), volume: Math.round(volume) }))
}

// ─── Global PR list ──────────────────────────────────────────────────────────

export interface ExercisePrSummary {
  exerciseId: string
  exerciseName: string
  weight: number
  reps: number
  /** Date of when this PR was last achieved. */
  achievedDate: string | null
}

/**
 * Returns the all-time best per exercise as a flat sortable list.
 */
export function allTimePrList(histories: ExerciseHistory[]): ExercisePrSummary[] {
  return histories
    .filter((ex) => ex.allTimeBest != null)
    .map((ex) => {
      // Find the most recent session that matches the all-time best
      const sorted = [...ex.sessions].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      )
      let achievedDate: string | null = null
      for (const s of sorted) {
        const best = bestPersonalRecord(s.sets)
        if (
          best &&
          best.weight === ex.allTimeBest &&
          best.reps === ex.allTimeBestReps
        ) {
          achievedDate = s.date
          break
        }
      }
      return {
        exerciseId: ex.exerciseId,
        exerciseName: ex.exerciseName,
        weight: ex.allTimeBest!,
        reps: ex.allTimeBestReps ?? 0,
        achievedDate,
      }
    })
    .sort((a, b) => b.weight - a.weight)
}

// --- Daily metrics (calories / protein / sleep / body weight) ---------------

export type DailyMetricKey = 'weight' | 'calories' | 'protein' | 'sleep'

export interface MetricPoint {
  date: string
  value: number
}

function shiftDate(dateStr: string, deltaDays: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + deltaDays)
  return d.toISOString().slice(0, 10)
}

/**
 * One metric from the daily logs, restricted to the last `days` days
 * (inclusive of `today`), chronological. Missing values are skipped.
 */
export function dailyMetricSeries(
  logs: DailyLogEntry[],
  key: DailyMetricKey,
  days: number,
  today: string,
): MetricPoint[] {
  const cutoff = shiftDate(today, -(days - 1))
  return logs
    .filter((l) => l[key] != null && l.date >= cutoff && l.date <= today)
    .map((l) => ({ date: l.date, value: l[key] as number }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

const NICE_FACTORS = [1, 2, 2.5, 5, 10]

function niceStep(span: number, targetCount: number): number {
  const raw = Math.max(span, 1e-9) / targetCount
  const pow = 10 ** Math.floor(Math.log10(raw))
  const f = raw / pow
  const factor = NICE_FACTORS.find((c) => c >= f - 1e-9) ?? 10
  return factor * pow
}

/**
 * Y-axis ticks on a 1 / 2 / 2.5 / 5 / 10 × 10ⁿ step. The domain is padded
 * around the data (one step of headroom when a point sits on the edge) so a
 * squat chart near 220 is not drawn from 0 and not as 220.2 / 220.4.
 */
export function niceTicks(
  values: number[],
  targetCount = 4,
): { domain: [number, number]; ticks: number[]; step: number } {
  const finite = values.filter((v) => Number.isFinite(v))
  if (finite.length === 0) return { domain: [0, 1], ticks: [0, 1], step: 1 }
  const dataLo = Math.min(...finite)
  const dataHi = Math.max(...finite)
  const span = dataHi - dataLo
  const mag = Math.max(Math.abs(dataLo), Math.abs(dataHi), 1)
  const pad = Math.max(span * 0.12, mag * 0.025)
  const step = niceStep(Math.max(span + pad * 2, mag * 0.05), targetCount)
  let start = Math.floor(dataLo / step) * step
  let end = Math.ceil(dataHi / step) * step
  if (dataLo - start < step * 0.3) start -= step
  if (end - dataHi < step * 0.3) end += step
  if (start === end) end = start + step
  const ticks: number[] = []
  for (let v = start; v <= end + step / 1e6; v += step) {
    ticks.push(Number(v.toFixed(6)))
  }
  return { domain: [ticks[0], ticks[ticks.length - 1]], ticks, step }
}

/** Axis label: whole numbers as integers, thousands as "1.5k" / "2k". */
export function formatChartTick(value: number): string {
  if (!Number.isFinite(value)) return ''
  const abs = Math.abs(value)
  if (abs >= 1000) {
    const scaled = Math.round((value / 1000) * 10) / 10
    return `${Number.isInteger(scaled) ? scaled.toFixed(0) : scaled}k`
  }
  if (Math.abs(value - Math.round(value)) < 1e-6) return String(Math.round(value))
  return String(Math.round(value * 100) / 100)
}
