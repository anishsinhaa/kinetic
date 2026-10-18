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
