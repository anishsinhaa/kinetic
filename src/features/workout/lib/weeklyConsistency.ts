import { localDateString } from '../../../lib/localDate'

export const DEFAULT_WEEKLY_GOAL = 3
export const MIN_WEEKLY_GOAL = 2
export const MAX_WEEKLY_GOAL = 6

export function clampWeeklyGoal(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_WEEKLY_GOAL
  const rounded = Math.round(n)
  return Math.min(MAX_WEEKLY_GOAL, Math.max(MIN_WEEKLY_GOAL, rounded))
}

function localMidnight(date: string): Date {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function weekStartKey(date: string): string {
  const midnight = localMidnight(date)
  const day = midnight.getDay()
  const monday = new Date(
    midnight.getFullYear(),
    midnight.getMonth(),
    midnight.getDate() - (day === 0 ? 6 : day - 1),
  )
  return localDateString(monday)
}

export function daysBetween(a: string, b: string): number {
  return Math.round((localMidnight(b).getTime() - localMidnight(a).getTime()) / 86_400_000)
}

export function addDays(date: string, n: number): string {
  const midnight = localMidnight(date)
  midnight.setDate(midnight.getDate() + n)
  return localDateString(midnight)
}

export function computeWeeklyStreak(
  trainingDates: string[],
  goal: number,
  today: string,
): { streak: number; thisWeekDays: number; goalHit: boolean } {
  const byWeek = new Map<string, Set<string>>()
  for (const date of trainingDates) {
    if (date > today) continue
    const week = weekStartKey(date)
    const days = byWeek.get(week) ?? new Set<string>()
    days.add(date)
    byWeek.set(week, days)
  }

  const thisWeek = weekStartKey(today)
  const thisWeekDays = byWeek.get(thisWeek)?.size ?? 0
  const goalHit = thisWeekDays >= goal
  let streak = goalHit ? 1 : 0
  const lastWeek = addDays(thisWeek, -7)
  for (let i = 0; i < 104; i++) {
    const count = byWeek.get(addDays(lastWeek, -7 * i))?.size ?? 0
    if (count < goal) break
    streak += 1
  }
  return { streak, thisWeekDays, goalHit }
}

export type OnTrackStatus = 'none' | 'trained_today' | 'rest_today' | 'on_track' | 'time_to_train'

export function computeOnTrack(
  trainingDates: string[],
  restDates: string[],
  today: string,
): { status: OnTrackStatus; daysSince: number | null } {
  const dates = trainingDates.filter((date) => date <= today)
  if (dates.length === 0) return { status: 'none', daysSince: null }
  const last = dates.reduce((latest, date) => (date > latest ? date : latest))
  const daysSince = daysBetween(last, today)
  if (last === today) return { status: 'trained_today', daysSince }
  if (restDates.includes(today)) return { status: 'rest_today', daysSince }

  const rest = new Set(restDates)
  let gap = 0
  for (let i = 1; i < daysSince; i++) {
    if (!rest.has(addDays(last, i))) gap += 1
  }
  return { status: gap <= 2 ? 'on_track' : 'time_to_train', daysSince }
}
