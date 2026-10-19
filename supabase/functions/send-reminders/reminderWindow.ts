/**
 * Pure, import-free reminder timing helpers (works in Deno and in the app).
 *
 * Reminder times are local wall-clock HH:MM in the user's IANA timezone. The
 * cron job fires every 5 minutes, so a reminder is "due" for a short window
 * after its time rather than on one exact minute.
 */

/** A reminder is due when its local time is in (now − 6 min, now]. */
export const REMINDER_WINDOW_MINUTES = 6

/** Normalise DB/time input to HH:MM (24h), or null. */
export function toHhmm(time: string | null | undefined): string | null {
  if (!time) return null
  const m = time.trim().match(/^(\d{1,2}):(\d{2})/)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

function partsInZone(timeZone: string, at: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timeZone || 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(at)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
  const hour = get('hour')
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    // some engines emit "24" for midnight
    hour: hour === '24' ? 0 : Number(hour),
    minute: Number(get('minute')),
  }
}

/** Minutes since local midnight in the zone (0–1439). */
export function localMinutesInZone(timeZone: string, at: Date): number {
  const p = partsInZone(timeZone, at)
  return p.hour * 60 + p.minute
}

/** Local calendar date "YYYY-MM-DD" in the zone. */
export function localDateInZone(timeZone: string, at: Date): string {
  const p = partsInZone(timeZone, at)
  return `${p.year}-${p.month}-${p.day}`
}

/** Local weekday in the zone: 0 = Sunday … 6 = Saturday. */
export function localWeekdayInZone(timeZone: string, at: Date): number {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: timeZone || 'UTC',
    weekday: 'short',
  }).format(at)
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return map[weekday] ?? 0
}

/**
 * Minutes elapsed since the reminder's local time (0 = this minute), handling
 * the midnight wrap. Returns null if the reminder time is invalid.
 */
export function minutesSinceReminder(
  reminderTime: string | null | undefined,
  timeZone: string,
  at: Date,
): number | null {
  const want = toHhmm(reminderTime)
  if (!want) return null
  const [h, m] = want.split(':').map(Number)
  const now = localMinutesInZone(timeZone, at)
  return (((now - (h * 60 + m)) % 1440) + 1440) % 1440
}

export type ReminderDue = {
  /** Local date the reminder belongs to (dedupe key; correct across midnight). */
  localDate: string
  /** Local weekday of that date (0 = Sunday). */
  weekday: number
}

/** Window check: due if the reminder time is in (now − 6 min, now] locally. */
export function reminderDue(
  reminderTime: string | null | undefined,
  timeZone: string,
  at: Date,
  windowMinutes: number = REMINDER_WINDOW_MINUTES,
): ReminderDue | null {
  const since = minutesSinceReminder(reminderTime, timeZone, at)
  if (since == null || since >= windowMinutes) return null
  // Date of the reminder moment itself — after a midnight wrap that is "yesterday"
  const reminderMoment = new Date(at.getTime() - since * 60_000)
  return {
    localDate: localDateInZone(timeZone, reminderMoment),
    weekday: localWeekdayInZone(timeZone, reminderMoment),
  }
}
