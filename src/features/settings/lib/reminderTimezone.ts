/**
 * Reminder times are stored as local wall-clock (HH:MM[:SS]) in the user's
 * IANA timezone. The cron sender compares "now" in that zone to the stored time.
 */

export function detectBrowserTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    return tz && tz.trim() ? tz : 'UTC'
  } catch {
    return 'UTC'
  }
}

/** Normalize DB/time input to HH:MM (24h). */
export function toHhmm(time: string | null | undefined): string | null {
  if (!time) return null
  const trimmed = time.trim()
  if (!trimmed) return null
  const m = trimmed.match(/^(\d{1,2}):(\d{2})/)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

/**
 * Current local HH:MM in an IANA timezone for a given instant (UTC).
 */
export function localHhmmInZone(timeZone: string, at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timeZone || 'UTC',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(at)
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '00'
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00'
  // en-GB can yield "24" for midnight in some engines — normalize
  const h = hour === '24' ? '00' : hour.padStart(2, '0')
  return `${h}:${minute.padStart(2, '0')}`
}

/**
 * Local weekday in zone: 0 = Sunday … 6 = Saturday (matches JS Date.getDay).
 */
export function localWeekdayInZone(timeZone: string, at: Date = new Date()): number {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: timeZone || 'UTC',
    weekday: 'short',
  }).format(at)
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  }
  return map[weekday] ?? 0
}

/**
 * True when the stored local reminder time matches "now" in the user's zone.
 * Equivalent to converting that local wall time to UTC for the current local
 * calendar day and comparing to the cron tick.
 */
export function isReminderDueAt(
  reminderTime: string | null | undefined,
  timeZone: string,
  at: Date = new Date(),
): boolean {
  const want = toHhmm(reminderTime)
  if (!want) return false
  return localHhmmInZone(timeZone || 'UTC', at) === want
}

export type ReminderDueInput = {
  timezone: string
  reminderMorningWeightEnabled: boolean
  reminderMorningWeightTime: string | null
  reminderNightRecoveryEnabled: boolean
  reminderNightRecoveryTime: string | null
  reminderWorkoutEnabled: boolean
  reminderWorkoutTime: string | null
  reminderWorkoutDays: number[]
}

export type ReminderKind = 'morning_weight' | 'night_recovery' | 'workout'

/** Which reminder kinds are due for this user at `at` (UTC instant). */
export function dueReminderKinds(settings: ReminderDueInput, at: Date = new Date()): ReminderKind[] {
  const tz = settings.timezone || 'UTC'
  const due: ReminderKind[] = []

  if (
    settings.reminderMorningWeightEnabled &&
    isReminderDueAt(settings.reminderMorningWeightTime, tz, at)
  ) {
    due.push('morning_weight')
  }
  if (
    settings.reminderNightRecoveryEnabled &&
    isReminderDueAt(settings.reminderNightRecoveryTime, tz, at)
  ) {
    due.push('night_recovery')
  }
  if (
    settings.reminderWorkoutEnabled &&
    isReminderDueAt(settings.reminderWorkoutTime, tz, at) &&
    settings.reminderWorkoutDays.includes(localWeekdayInZone(tz, at))
  ) {
    due.push('workout')
  }

  return due
}
