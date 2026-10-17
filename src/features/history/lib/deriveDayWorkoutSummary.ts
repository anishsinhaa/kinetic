export type DayWorkoutInput = {
  workout_type?: string | null
  name?: string | null
  started_at?: string | null
  created_at: string
  ended_at: string
}

export type DayWorkoutSummary = {
  typeLabel: string | null
  durationMins: number
  count: number
}

function workoutTypeLabel(w: DayWorkoutInput): string | null {
  const label = (w.workout_type ?? w.name ?? '').trim()
  return label || null
}

function durationMins(w: DayWorkoutInput): number {
  if (!w.ended_at) return 0
  const start = w.started_at ?? w.created_at
  if (!start) return 0
  const mins = Math.round(
    (new Date(w.ended_at).getTime() - new Date(start).getTime()) / 60000,
  )
  return Math.max(0, mins)
}

/**
 * Derive daily-log workout type + duration from all workouts that day.
 * Types are joined in chronological order (unique); duration is the sum.
 */
export function deriveDayWorkoutSummary(workouts: DayWorkoutInput[]): DayWorkoutSummary {
  if (workouts.length === 0) {
    return { typeLabel: null, durationMins: 0, count: 0 }
  }

  const sorted = [...workouts].sort(
    (a, b) => new Date(a.ended_at).getTime() - new Date(b.ended_at).getTime(),
  )

  const types: string[] = []
  for (const w of sorted) {
    const label = workoutTypeLabel(w)
    if (!label) continue
    if (types.some((t) => t.toLowerCase() === label.toLowerCase())) continue
    types.push(label)
  }

  const totalMins = sorted.reduce((sum, w) => sum + durationMins(w), 0)

  return {
    typeLabel: types.length > 0 ? types.join(' + ') : null,
    durationMins: totalMins,
    count: sorted.length,
  }
}
