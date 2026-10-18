import { describe, expect, it } from 'vitest'
import {
  parseBestSet,
  parseDateCol,
  parseImportWorkbook,
  parseTarget,
  mapMuscleGroup,
  formatImportSummary,
  type ImportSummary,
} from './dataImport'
import { writeWorkbookBuffer } from './excelHelpers'

describe('parseBestSet', () => {
  it('parses weight x reps variants', () => {
    expect(parseBestSet('100x5')).toEqual({ weight: 100, reps: 5 })
    expect(parseBestSet('102.5 × 8')).toEqual({ weight: 102.5, reps: 8 })
    expect(parseBestSet('80 x 10')).toEqual({ weight: 80, reps: 10 })
  })
  it('returns null for garbage', () => {
    expect(parseBestSet('')).toBeNull()
    expect(parseBestSet('PR')).toBeNull()
    expect(parseBestSet('0x5')).toBeNull()
  })
})

describe('parseDateCol', () => {
  it('accepts ISO and slash dates', () => {
    expect(parseDateCol('2026-10-18')).toBe('2026-10-18')
    expect(parseDateCol('10/18/2026')).toBe('2026-10-18')
  })
  it('accepts Excel serials', () => {
    // 2026-10-18 = serial 46313 (Excel 1900 date system)
    expect(parseDateCol(46313)).toBe('2026-10-18')
  })
})

describe('parseTarget / mapMuscleGroup', () => {
  it('maps next-session targets', () => {
    expect(parseTarget('Maintain')).toBe('maintain')
    expect(parseTarget('Increase weight')).toBe('increase_weight')
    expect(parseTarget('Increase reps')).toBe('increase_reps')
    expect(parseTarget('')).toBeNull()
  })
  it('maps PUSH/PULL/LEGS groups', () => {
    expect(mapMuscleGroup('PUSH')).toBe('chest')
    expect(mapMuscleGroup('PULL')).toBe('back')
    expect(mapMuscleGroup('LEGS')).toBe('legs')
    expect(mapMuscleGroup('Quadriceps')).toBe('Quadriceps')
  })
})

describe('parseImportWorkbook', () => {
  it('parses Daily Log and Exercises Log sheets together', async () => {
    const ab = await writeWorkbookBuffer([
      {
        name: 'Daily Log',
        rows: [
          { Date: '2026-10-17', Weight: 78.5, Calories: 2400, Protein: 180, Sleep: 7.5, Notes: 'good' },
          { Date: '2026-10-18', Weight: 78.0, Calories: null, Protein: null, Sleep: null, Notes: null },
        ],
      },
      {
        name: 'Exercises Log',
        rows: [
          {
            Exercise: 'Barbell Bench Press',
            Group: 'PUSH',
            'Best Set': '102.5x5',
            'Next Session': 'Increase weight',
            Notes: 'pause reps',
            Updated: '2026-10-18',
          },
          {
            Exercise: 'Barbell Deadlift',
            Group: 'PULL',
            Weight: 100,
            Reps: 5,
            Updated: '2026-10-17',
          },
          {
            Exercise: 'Missing set',
            Group: 'LEGS',
            Updated: '2026-10-17',
          },
        ],
      },
    ])

    const preview = await parseImportWorkbook(ab, 'gym.xlsx')
    expect(preview.dailyLogs).toHaveLength(2)
    expect(preview.dailyLogs[0]).toMatchObject({ date: '2026-10-17', weight: 78.5, calories: 2400 })
    expect(preview.exerciseLogs).toHaveLength(2)
    expect(preview.exerciseLogs[0]).toMatchObject({
      exerciseName: 'Barbell Bench Press',
      muscleGroup: 'chest',
      weight: 102.5,
      reps: 5,
      date: '2026-10-18',
      target: 'increase_weight',
    })
    expect(preview.exerciseLogs[1]).toMatchObject({
      exerciseName: 'Barbell Deadlift',
      muscleGroup: 'back',
      weight: 100,
      reps: 5,
    })
    expect(preview.warnings.some((w) => /Missing set/.test(w))).toBe(true)
  })

  it('parses a single CSV-style daily sheet', async () => {
    const csv = 'date,weight,calories\n2026-01-01,80,2000\n'
    const bytes = new TextEncoder().encode(csv)
    const preview = await parseImportWorkbook(bytes, 'logs.csv')
    expect(preview.dailyLogs).toHaveLength(1)
    expect(preview.exerciseLogs).toHaveLength(0)
  })
})

describe('formatImportSummary', () => {
  it('summarizes imported/skipped counts', () => {
    const s: ImportSummary = {
      dailyLogsImported: 3,
      dailyLogsSkipped: 1,
      exercisesCreated: 2,
      historySetsImported: 4,
      historySetsSkipped: 1,
      errors: [],
    }
    expect(formatImportSummary(s)).toContain('Daily logs: 3 imported, 1 skipped')
    expect(formatImportSummary(s)).toContain('History sets: 4 imported, 1 skipped')
    expect(formatImportSummary(s)).toContain('Exercises created: 2')
  })
})
