/**
 * Export helpers — produce JSON, CSV, or Excel (xlsx) from history data.
 */

import * as XLSX from 'xlsx'
import type { ExerciseHistory } from '../../history/types'
import type { DailyLogEntry } from '../../history/types'

// ─── JSON export ─────────────────────────────────────────────────────────────

export function exportJson(histories: ExerciseHistory[], logs: DailyLogEntry[]): void {
  const payload = {
    exportedAt: new Date().toISOString(),
    version: 1,
    exerciseHistory: histories,
    dailyLogs: logs,
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  triggerDownload(blob, `kinetic-export-${today()}.json`)
}

// ─── CSV export ──────────────────────────────────────────────────────────────

export function exportCsv(histories: ExerciseHistory[], logs: DailyLogEntry[]): void {
  // Flatten exercise history into rows
  const rows: Record<string, string | number | null>[] = []

  for (const ex of histories) {
    for (const session of ex.sessions) {
      for (const set of session.sets) {
        rows.push({
          type: 'exercise_set',
          date: session.date,
          workout_id: session.workoutId,
          exercise_id: ex.exerciseId,
          exercise_name: ex.exerciseName,
          muscle_group: ex.muscleGroup,
          weight_kg: set.weight,
          reps: set.reps,
          session_volume_kg: session.totalVolume,
          feel: session.feel,
        })
      }
    }
  }

  for (const log of logs) {
    rows.push({
      type: 'daily_log',
      date: log.date,
      workout_id: null,
      exercise_id: null,
      exercise_name: null,
      muscle_group: null,
      weight_kg: log.weight,
      reps: null,
      session_volume_kg: null,
      feel: null,
    })
  }

  if (rows.length === 0) {
    rows.push({ type: 'no_data', date: today() } as Record<string, string>)
  }

  const ws = XLSX.utils.json_to_sheet(rows)
  const csv = XLSX.utils.sheet_to_csv(ws)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  triggerDownload(blob, `kinetic-export-${today()}.csv`)
}

// ─── Excel export ─────────────────────────────────────────────────────────────

export function exportExcel(histories: ExerciseHistory[], logs: DailyLogEntry[]): void {
  const wb = XLSX.utils.book_new()

  // Sheet 1: Exercise sets
  const setRows: Record<string, string | number | null>[] = []
  for (const ex of histories) {
    for (const session of ex.sessions) {
      for (const set of session.sets) {
        setRows.push({
          Date: session.date,
          Exercise: ex.exerciseName,
          'Muscle Group': ex.muscleGroup,
          'Weight (kg)': set.weight,
          Reps: set.reps,
          'Session Volume (kg)': session.totalVolume,
          Feel: session.feel,
          Note: session.note ?? null,
        })
      }
    }
  }
  if (setRows.length > 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(setRows), 'Workouts')
  }

  // Sheet 2: Daily logs
  const logRows = logs.map((l) => ({
    Date: l.date,
    'Weight (kg)': l.weight,
    Calories: l.calories,
    'Protein (g)': l.protein,
    'Sleep (h)': l.sleep,
    Notes: l.notes,
    'Workout Type': l.workoutType,
    'Workout Duration (min)': l.workoutDurationMins,
  }))
  if (logRows.length > 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(logRows), 'Daily Logs')
  }

  XLSX.writeFile(wb, `kinetic-export-${today()}.xlsx`)
}

// ─── Import ──────────────────────────────────────────────────────────────────

export interface ImportedDailyLogRow {
  date: string
  weight?: number | null
  calories?: number | null
  protein?: number | null
  sleep?: number | null
  notes?: string | null
}

export interface ImportPreview {
  rows: ImportedDailyLogRow[]
  warnings: string[]
}

/**
 * Parse an uploaded Excel or CSV file and return a preview of daily log rows.
 * Expected columns (case-insensitive): date, weight, calories, protein, sleep, notes.
 * Returns up to the first 500 rows.
 */
export async function parseImportFile(file: File): Promise<ImportPreview> {
  const warnings: string[] = []

  const ab = await file.arrayBuffer()
  const wb = XLSX.read(ab, { type: 'array' })
  const firstSheet = wb.Sheets[wb.SheetNames[0]]
  if (!firstSheet) throw new Error('No sheets found in file.')

  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: null })

  const rows: ImportedDailyLogRow[] = []

  for (const [i, r] of raw.entries()) {
    if (rows.length >= 500) {
      warnings.push('Only the first 500 rows were imported.')
      break
    }
    const dateVal = getCol(r, 'date')
    const dateStr = parseDateCol(dateVal)
    if (!dateStr) {
      warnings.push(`Row ${i + 2}: missing or invalid date "${String(dateVal)}" — skipped.`)
      continue
    }
    rows.push({
      date: dateStr,
      weight: parseNum(getCol(r, 'weight')),
      calories: parseNum(getCol(r, 'calories')),
      protein: parseNum(getCol(r, 'protein')),
      sleep: parseNum(getCol(r, 'sleep')),
      notes: parseStr(getCol(r, 'notes')),
    })
  }

  return { rows, warnings }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function today() {
  return new Date().toISOString().slice(0, 10)
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

function getCol(row: Record<string, unknown>, col: string): unknown {
  const key = Object.keys(row).find((k) => k.toLowerCase() === col.toLowerCase())
  return key ? row[key] : null
}

function parseDateCol(val: unknown): string | null {
  if (!val) return null
  const s = String(val).trim()
  // ISO date: 2026-10-18
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  // Excel serial number
  const n = Number(val)
  if (!isNaN(n) && n > 10000) {
    const d = XLSX.SSF.parse_date_code(n)
    if (d) {
      return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
    }
  }
  // MM/DD/YYYY or DD/MM/YYYY (assume MM/DD)
  const slashMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (slashMatch) {
    const [, m, d, y] = slashMatch
    return `${y}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`
  }
  return null
}

function parseNum(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null
  const n = Number(val)
  return isNaN(n) ? null : n
}

function parseStr(val: unknown): string | null {
  if (val === null || val === undefined || val === '') return null
  return String(val).trim() || null
}
