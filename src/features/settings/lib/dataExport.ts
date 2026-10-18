/**
 * Export helpers — produce JSON, CSV, or Excel (.xlsx) from history data.
 */

import type { ExerciseHistory, DailyLogEntry } from '../../history/types'
import { rowsToCsv, writeWorkbookBuffer, type SheetRow } from './excelHelpers'

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
  const rows: SheetRow[] = []

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
    rows.push({ type: 'no_data', date: today() })
  }

  const blob = new Blob([rowsToCsv(rows)], { type: 'text/csv;charset=utf-8;' })
  triggerDownload(blob, `kinetic-export-${today()}.csv`)
}

// ─── Excel export ─────────────────────────────────────────────────────────────

export async function exportExcel(
  histories: ExerciseHistory[],
  logs: DailyLogEntry[],
): Promise<void> {
  const setRows: SheetRow[] = []
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

  const logRows: SheetRow[] = logs.map((l) => ({
    Date: l.date,
    'Weight (kg)': l.weight,
    Calories: l.calories,
    'Protein (g)': l.protein,
    'Sleep (h)': l.sleep,
    Notes: l.notes,
    'Workout Type': l.workoutType,
    'Workout Duration (min)': l.workoutDurationMins,
  }))

  const sheets: Array<{ name: string; rows: SheetRow[] }> = []
  if (setRows.length > 0) sheets.push({ name: 'Workouts', rows: setRows })
  if (logRows.length > 0) sheets.push({ name: 'Daily Logs', rows: logRows })
  if (sheets.length === 0) {
    sheets.push({ name: 'Export', rows: [{ note: 'No data to export', date: today() }] })
  }

  const ab = await writeWorkbookBuffer(sheets)
  const blob = new Blob([ab], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  triggerDownload(blob, `kinetic-export-${today()}.xlsx`)
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
