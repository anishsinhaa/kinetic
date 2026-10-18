/**
 * Export helpers — produce JSON, CSV, or Excel (.xlsx) from history data.
 * Weights are converted to the user's display unit and labeled accordingly.
 */

import type { ExerciseHistory, DailyLogEntry } from '../../history/types'
import type { WeightUnits } from '../../../lib/supabase/database.types'
import { kgToDisplay, roundDisplayWeight } from './units'
import { rowsToCsv, writeWorkbookBuffer, type SheetRow } from './excelHelpers'

function toDisplay(kg: number | null | undefined, units: WeightUnits): number | null {
  if (kg == null || !Number.isFinite(kg)) return null
  return roundDisplayWeight(kgToDisplay(kg, units), units)
}

// ─── JSON export ─────────────────────────────────────────────────────────────

export function exportJson(
  histories: ExerciseHistory[],
  logs: DailyLogEntry[],
  units: WeightUnits = 'kg',
): void {
  const payload = {
    exportedAt: new Date().toISOString(),
    version: 2,
    units,
    note: 'Weights are in the user display unit. Canonical storage in Kinetic is kg.',
    exerciseHistory: histories.map((ex) => ({
      ...ex,
      allTimeBest: toDisplay(ex.allTimeBest, units),
      sessions: ex.sessions.map((s) => ({
        ...s,
        totalVolume: toDisplay(s.totalVolume, units),
        sets: s.sets.map((set) => ({
          ...set,
          weight: toDisplay(set.weight, units),
        })),
      })),
    })),
    dailyLogs: logs.map((l) => ({
      ...l,
      weight: toDisplay(l.weight, units),
    })),
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  triggerDownload(blob, `kinetic-export-${today()}.json`)
}

// ─── CSV export ──────────────────────────────────────────────────────────────

export function exportCsv(
  histories: ExerciseHistory[],
  logs: DailyLogEntry[],
  units: WeightUnits = 'kg',
): void {
  const weightKey = `weight_${units}`
  const volumeKey = `session_volume_${units}`
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
          [weightKey]: toDisplay(set.weight, units),
          reps: set.reps,
          [volumeKey]: toDisplay(session.totalVolume, units),
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
      [weightKey]: toDisplay(log.weight, units),
      reps: null,
      [volumeKey]: null,
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
  units: WeightUnits = 'kg',
): Promise<void> {
  const weightCol = `Weight (${units})`
  const volumeCol = `Session Volume (${units})`
  const bodyCol = `Weight (${units})`

  const setRows: SheetRow[] = []
  for (const ex of histories) {
    for (const session of ex.sessions) {
      for (const set of session.sets) {
        setRows.push({
          Date: session.date,
          Exercise: ex.exerciseName,
          'Muscle Group': ex.muscleGroup,
          [weightCol]: toDisplay(set.weight, units),
          Reps: set.reps,
          [volumeCol]: toDisplay(session.totalVolume, units),
          Feel: session.feel,
          Note: session.note ?? null,
        })
      }
    }
  }

  const logRows: SheetRow[] = logs.map((l) => ({
    Date: l.date,
    [bodyCol]: toDisplay(l.weight, units),
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
