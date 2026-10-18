/**
 * Excel / CSV import — Daily Log sheets → daily_logs;
 * Exercises Log sheets → exercises + best-set history entries.
 */

import { upsertDailyLog } from '../../dailyLog/services/dailyLogService'
import { readCsvText, readWorkbookSheets } from './excelHelpers'
import { findOrCreateExerciseByName } from '../../workout/services/exerciseService'
import {
  addExerciseToWorkout,
  createWorkout,
  finishWorkout,
  upsertSet,
} from '../../workout/services/workoutService'
import { supabase } from '../../../lib/supabase/client'
import type { WorkoutExerciseTarget } from '../../../lib/supabase/database.types'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ImportedDailyLogRow {
  date: string
  weight?: number | null
  calories?: number | null
  protein?: number | null
  sleep?: number | null
  notes?: string | null
  workoutType?: string | null
}

export interface ImportedExerciseLogRow {
  exerciseName: string
  muscleGroup: string
  weight: number
  reps: number
  date: string
  notes?: string | null
  target?: WorkoutExerciseTarget | null
}

export interface ImportPreview {
  dailyLogs: ImportedDailyLogRow[]
  exerciseLogs: ImportedExerciseLogRow[]
  warnings: string[]
}

export interface ImportSummary {
  dailyLogsImported: number
  dailyLogsSkipped: number
  exercisesCreated: number
  historySetsImported: number
  historySetsSkipped: number
  errors: string[]
}

// ─── Public parse API ────────────────────────────────────────────────────────

/** Parse an uploaded Excel/CSV File into a preview (no DB writes). */
export async function parseImportFile(file: File): Promise<ImportPreview> {
  const ab = await file.arrayBuffer()
  return parseImportWorkbook(ab, file.name)
}

/**
 * Workbook / CSV parser — used by tests and parseImportFile.
 * Accepts ArrayBuffer / Uint8Array from .xlsx or .csv.
 */
export async function parseImportWorkbook(
  data: ArrayBuffer | Uint8Array,
  filename = 'import.xlsx',
): Promise<ImportPreview> {
  const warnings: string[] = []
  const isCsv = /\.csv$/i.test(filename)
  const sheets = isCsv
    ? readCsvText(new TextDecoder('utf-8').decode(data instanceof Uint8Array ? data : new Uint8Array(data)))
    : await readWorkbookSheets(data)

  if (!sheets.length) {
    throw new Error('No sheets found in file.')
  }

  const dailyLogs: ImportedDailyLogRow[] = []
  const exerciseLogs: ImportedExerciseLogRow[] = []

  for (const { name: sheetName, rows: raw } of sheets) {
    if (raw.length === 0) continue

    const kind = classifySheet(sheetName, raw[0]!, isCsv)
    if (kind === 'daily') {
      parseDailySheet(raw, sheetName, dailyLogs, warnings)
    } else if (kind === 'exercise') {
      parseExerciseSheet(raw, sheetName, exerciseLogs, warnings)
    } else if (isCsv || sheets.length === 1) {
      const beforeDaily = dailyLogs.length
      parseDailySheet(raw, sheetName, dailyLogs, warnings)
      if (dailyLogs.length === beforeDaily) {
        parseExerciseSheet(raw, sheetName, exerciseLogs, warnings)
      }
    } else {
      warnings.push(`Sheet "${sheetName}": unrecognized columns — skipped.`)
    }
  }

  return { dailyLogs, exerciseLogs, warnings }
}

// ─── Apply ───────────────────────────────────────────────────────────────────

export async function applyImport(userId: string, preview: ImportPreview): Promise<ImportSummary> {
  const summary: ImportSummary = {
    dailyLogsImported: 0,
    dailyLogsSkipped: 0,
    exercisesCreated: 0,
    historySetsImported: 0,
    historySetsSkipped: 0,
    errors: [],
  }

  // ── Daily logs (upsert = idempotent) ──
  for (const row of preview.dailyLogs) {
    const hasAny =
      row.weight != null ||
      row.calories != null ||
      row.protein != null ||
      row.sleep != null ||
      (row.notes != null && row.notes !== '')
    if (!hasAny) {
      summary.dailyLogsSkipped++
      continue
    }
    try {
      await upsertDailyLog(
        userId,
        {
          weight: row.weight ?? null,
          calories: row.calories ?? null,
          protein: row.protein ?? null,
          sleep: row.sleep ?? null,
          notes: row.notes ?? '',
        },
        row.date,
      )
      summary.dailyLogsImported++
    } catch (err) {
      summary.errors.push(`Daily ${row.date}: ${(err as Error).message}`)
      summary.dailyLogsSkipped++
    }
  }

  // ── Exercise history: group by date so one imported workout per day ──
  const byDate = new Map<string, ImportedExerciseLogRow[]>()
  for (const row of preview.exerciseLogs) {
    const list = byDate.get(row.date) ?? []
    list.push(row)
    byDate.set(row.date, list)
  }

  for (const [date, rows] of byDate) {
    let workoutId: string | null = null
    let orderIndex = 0

    for (const row of rows) {
      try {
        const already = await hasMatchingHistorySet(userId, row)
        if (already) {
          summary.historySetsSkipped++
          continue
        }

        const beforeId = await findExerciseIdByName(row.exerciseName)
        const exercise = await findOrCreateExerciseByName(
          row.exerciseName,
          row.muscleGroup,
          null,
          userId,
        )
        if (!beforeId) summary.exercisesCreated++

        if (!workoutId) {
          const created = await createWorkout(userId, date, 'Imported')
          workoutId = created.id
        }

        const weId = await addExerciseToWorkout(workoutId, exercise.id, orderIndex++, {
          target: row.target ?? null,
          note: row.notes ?? null,
        })

        const setId = crypto.randomUUID()
        const completedAt = `${date}T12:00:00.000Z`
        await upsertSet(setId, weId, {
          weight: row.weight,
          reps: row.reps,
          set_index: 1,
          failed: false,
          to_failure: false,
          completed_at: completedAt,
        })
        summary.historySetsImported++
      } catch (err) {
        summary.errors.push(
          `Exercise ${row.exerciseName} @ ${row.date}: ${(err as Error).message}`,
        )
        summary.historySetsSkipped++
      }
    }

    if (workoutId) {
      try {
        await finishWorkout(workoutId, { note: 'Imported from Excel' })
      } catch (err) {
        summary.errors.push(`Finish workout ${date}: ${(err as Error).message}`)
      }
    }
  }

  return summary
}

export function formatImportSummary(s: ImportSummary): string {
  const parts = [
    `Daily logs: ${s.dailyLogsImported} imported, ${s.dailyLogsSkipped} skipped`,
    `History sets: ${s.historySetsImported} imported, ${s.historySetsSkipped} skipped`,
    `Exercises created: ${s.exercisesCreated}`,
  ]
  if (s.errors.length) {
    parts.push(`Errors (${s.errors.length}): ${s.errors.slice(0, 5).join('; ')}`)
  }
  return parts.join(' · ')
}

// ─── Sheet classification ────────────────────────────────────────────────────

type SheetKind = 'daily' | 'exercise' | 'unknown'

function classifySheet(
  sheetName: string,
  sample: Record<string, unknown>,
  isCsv: boolean,
): SheetKind {
  const name = sheetName.toLowerCase()
  // Exercises Log before Daily Log — "Exercises Log" contains "log"
  if (/exercise/.test(name) || /workout/.test(name)) return 'exercise'
  if (/daily/.test(name)) return 'daily'

  const keys = Object.keys(sample).map((k) => k.toLowerCase())
  const hasExercise = keys.some((k) => /exercise|movement|name/.test(k))
  const hasBestSet = keys.some((k) => /best\s*set|weight|reps/.test(k))
  const hasCalories = keys.some((k) => /calorie|protein|sleep/.test(k))
  const hasDate = keys.some((k) => /date|updated/.test(k))

  if (hasCalories && hasDate) return 'daily'
  if (hasExercise && hasBestSet) return 'exercise'
  if (isCsv && hasDate && !hasExercise) return 'daily'
  return 'unknown'
}

// ─── Daily sheet ─────────────────────────────────────────────────────────────

function parseDailySheet(
  raw: Record<string, unknown>[],
  sheetName: string,
  out: ImportedDailyLogRow[],
  warnings: string[],
) {
  for (const [i, r] of raw.entries()) {
    if (out.length >= 500) {
      warnings.push(`Sheet "${sheetName}": only first 500 daily rows kept.`)
      break
    }
    const dateStr = parseDateCol(getCol(r, 'date') ?? getCol(r, 'day'))
    if (!dateStr) {
      warnings.push(`Sheet "${sheetName}" row ${i + 2}: invalid date — skipped.`)
      continue
    }
    out.push({
      date: dateStr,
      weight: parseNum(getCol(r, 'weight') ?? getCol(r, 'weight (kg)') ?? getCol(r, 'weight_kg')),
      calories: parseNum(getCol(r, 'calories') ?? getCol(r, 'kcal')),
      protein: parseNum(getCol(r, 'protein') ?? getCol(r, 'protein (g)') ?? getCol(r, 'protein_g')),
      sleep: parseNum(getCol(r, 'sleep') ?? getCol(r, 'sleep (h)') ?? getCol(r, 'sleep_hours')),
      notes: parseStr(getCol(r, 'notes') ?? getCol(r, 'journal notes') ?? getCol(r, 'journal')),
      workoutType: parseStr(getCol(r, 'workout type') ?? getCol(r, 'workout_type') ?? getCol(r, 'type')),
    })
  }
}

// ─── Exercise sheet ──────────────────────────────────────────────────────────

function parseExerciseSheet(
  raw: Record<string, unknown>[],
  sheetName: string,
  out: ImportedExerciseLogRow[],
  warnings: string[],
) {
  for (const [i, r] of raw.entries()) {
    if (out.length >= 500) {
      warnings.push(`Sheet "${sheetName}": only first 500 exercise rows kept.`)
      break
    }

    const exerciseName = parseStr(
      getCol(r, 'exercise') ??
        getCol(r, 'exercise name') ??
        getCol(r, 'name') ??
        getCol(r, 'movement'),
    )
    if (!exerciseName) {
      warnings.push(`Sheet "${sheetName}" row ${i + 2}: missing exercise name — skipped.`)
      continue
    }

    const groupRaw =
      parseStr(
        getCol(r, 'muscle group') ??
          getCol(r, 'muscle_group') ??
          getCol(r, 'group') ??
          getCol(r, 'category'),
      ) ?? 'Other'
    const muscleGroup = mapMuscleGroup(groupRaw)

    const bestRaw =
      getCol(r, 'best set') ??
      getCol(r, 'best_set') ??
      getCol(r, 'pr') ??
      getCol(r, 'best')
    let weight = parseNum(getCol(r, 'weight') ?? getCol(r, 'weight (kg)') ?? getCol(r, 'weight_kg'))
    let reps = parseNum(getCol(r, 'reps') ?? getCol(r, 'rep'))

    if ((weight == null || reps == null) && bestRaw != null) {
      const parsed = parseBestSet(bestRaw)
      if (parsed) {
        weight = weight ?? parsed.weight
        reps = reps ?? parsed.reps
      }
    }

    if (weight == null || reps == null || weight <= 0 || reps <= 0) {
      warnings.push(
        `Sheet "${sheetName}" row ${i + 2}: "${exerciseName}" missing best set — skipped.`,
      )
      continue
    }

    const dateStr =
      parseDateCol(
        getCol(r, 'updated') ??
          getCol(r, 'updated date') ??
          getCol(r, 'date') ??
          getCol(r, 'last updated'),
      ) ?? today()

    const target = parseTarget(
      getCol(r, 'next session') ??
        getCol(r, 'target') ??
        getCol(r, 'next') ??
        getCol(r, 'next session target'),
    )

    out.push({
      exerciseName,
      muscleGroup,
      weight,
      reps,
      date: dateStr,
      notes: parseStr(getCol(r, 'notes') ?? getCol(r, 'note')),
      target,
    })
  }
}

// ─── DB helpers ──────────────────────────────────────────────────────────────

async function findExerciseIdByName(name: string): Promise<string | null> {
  const { data } = await supabase
    .from('exercises')
    .select('id')
    .ilike('name', name.trim())
    .limit(1)
    .maybeSingle()
  return data?.id ?? null
}

async function hasMatchingHistorySet(
  userId: string,
  row: ImportedExerciseLogRow,
): Promise<boolean> {
  const { data: exercise } = await supabase
    .from('exercises')
    .select('id')
    .ilike('name', row.exerciseName.trim())
    .limit(1)
    .maybeSingle()
  if (!exercise) return false

  const { data: weRows } = await supabase
    .from('workout_exercises')
    .select(
      `
      id,
      workouts!inner ( user_id, date, ended_at ),
      sets ( weight, reps, completed_at )
    `,
    )
    .eq('exercise_id', exercise.id)

  if (!weRows?.length) return false

  for (const we of weRows as Array<{
    workouts: { user_id: string; date: string; ended_at: string | null } | { user_id: string; date: string; ended_at: string | null }[]
    sets: Array<{ weight: number | null; reps: number | null; completed_at: string | null }>
  }>) {
    const w = Array.isArray(we.workouts) ? we.workouts[0] : we.workouts
    if (!w || w.user_id !== userId || w.date !== row.date || !w.ended_at) continue
    for (const s of we.sets ?? []) {
      if (s.weight === row.weight && s.reps === row.reps && s.completed_at != null) {
        return true
      }
    }
  }
  return false
}

// ─── Column / value helpers (exported for tests) ─────────────────────────────

export function parseBestSet(val: unknown): { weight: number; reps: number } | null {
  if (val == null || val === '') return null
  const s = String(val).trim().toLowerCase().replace(/×/g, 'x').replace(/\s+/g, '')
  const m = s.match(/^(\d+(?:\.\d+)?)x(\d+)$/)
  if (!m) return null
  const weight = Number(m[1])
  const reps = Number(m[2])
  if (!Number.isFinite(weight) || !Number.isFinite(reps) || weight <= 0 || reps <= 0) return null
  return { weight, reps }
}

export function parseTarget(val: unknown): WorkoutExerciseTarget | null {
  if (val == null || val === '') return null
  const s = String(val).trim().toLowerCase()
  if (/maintain/.test(s)) return 'maintain'
  if (/increase\s*weight|heavier|weight/.test(s)) return 'increase_weight'
  if (/increase\s*reps|more\s*reps|reps/.test(s)) return 'increase_reps'
  return null
}

export function mapMuscleGroup(group: string): string {
  const g = group.trim().toLowerCase()
  if (g === 'push') return 'chest'
  if (g === 'pull') return 'back'
  if (g === 'legs' || g === 'leg') return 'legs'
  if (g === 'upper') return 'chest'
  if (g === 'lower') return 'legs'
  return group.trim() || 'Other'
}

export function parseDateCol(val: unknown): string | null {
  if (val == null || val === '') return null
  if (val instanceof Date && !isNaN(val.getTime())) {
    return val.toISOString().slice(0, 10)
  }
  const s = String(val).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)

  // Excel serial (1900 date system; day 0 = 1899-12-30)
  const n = Number(val)
  if (!isNaN(n) && n > 10000 && n < 100000) {
    const ms = Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000
    return new Date(ms).toISOString().slice(0, 10)
  }

  const slashMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (slashMatch) {
    const [, m, d, y] = slashMatch
    return `${y}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`
  }

  const parsed = Date.parse(s)
  if (!isNaN(parsed)) {
    return new Date(parsed).toISOString().slice(0, 10)
  }
  return null
}

function getCol(row: Record<string, unknown>, col: string): unknown {
  const want = col.toLowerCase()
  const key = Object.keys(row).find((k) => k.toLowerCase().trim() === want)
  return key ? row[key] : null
}

function parseNum(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null
  const n = Number(String(val).replace(/,/g, ''))
  return isNaN(n) ? null : n
}

function parseStr(val: unknown): string | null {
  if (val === null || val === undefined || val === '') return null
  return String(val).trim() || null
}

function today() {
  return new Date().toISOString().slice(0, 10)
}
