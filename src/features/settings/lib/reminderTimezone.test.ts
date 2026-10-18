import { describe, expect, it } from 'vitest'
import {
  dueReminderKinds,
  isReminderDueAt,
  localHhmmInZone,
  localWeekdayInZone,
  toHhmm,
} from './reminderTimezone'

describe('reminderTimezone', () => {
  it('normalizes time strings to HH:MM', () => {
    expect(toHhmm('8:05:00')).toBe('08:05')
    expect(toHhmm('21:00')).toBe('21:00')
    expect(toHhmm(null)).toBeNull()
  })

  it('reads local HH:MM in Asia/Kolkata from a UTC instant', () => {
    // 2026-10-18 02:30 UTC = 08:00 IST (UTC+5:30)
    const at = new Date('2026-10-18T02:30:00.000Z')
    expect(localHhmmInZone('Asia/Kolkata', at)).toBe('08:00')
    expect(localHhmmInZone('UTC', at)).toBe('02:30')
  })

  it('matches a local reminder against UTC now via the user timezone', () => {
    const at = new Date('2026-10-18T02:30:00.000Z')
    expect(isReminderDueAt('08:00:00', 'Asia/Kolkata', at)).toBe(true)
    expect(isReminderDueAt('08:00:00', 'UTC', at)).toBe(false)
    expect(isReminderDueAt('02:30:00', 'UTC', at)).toBe(true)
  })

  it('uses the local weekday in the user timezone for workout days', () => {
    // Saturday 2026-10-17 20:00 UTC = Sunday 01:30 Asia/Kolkata
    const at = new Date('2026-10-17T20:00:00.000Z')
    expect(localWeekdayInZone('UTC', at)).toBe(6) // Sat
    expect(localWeekdayInZone('Asia/Kolkata', at)).toBe(0) // Sun

    const kinds = dueReminderKinds(
      {
        timezone: 'Asia/Kolkata',
        reminderMorningWeightEnabled: false,
        reminderMorningWeightTime: null,
        reminderNightRecoveryEnabled: false,
        reminderNightRecoveryTime: null,
        reminderWorkoutEnabled: true,
        reminderWorkoutTime: '01:30:00',
        reminderWorkoutDays: [0], // Sunday local
      },
      at,
    )
    expect(kinds).toEqual(['workout'])
  })
})
