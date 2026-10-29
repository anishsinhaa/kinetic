import { localDateString } from '../../../lib/localDate'
import { supabase } from '../../../lib/supabase/client'
import { toServiceError } from '../../../lib/supabase/errors'
import type {
  WorkoutExerciseRow,
  WorkoutExerciseTarget,
  WorkoutRow,
} from '../../../lib/supabase/database.types'
import type { AddSetInput, UpdateWorkoutMetaInput } from '../types'
import { listRestDays } from '../../dailyLog/services/restDayService'
import { onlyExercisesWithCompletedSets } from '../lib/completedExercises'
import { isCompletedSet, totalVolumeKg } from '../lib/volume'

type LastPerformanceSet = { weight: number | null; reps: number | null }
type ExercisePR = { weight: number | null; reps: number | null; date: string | null }

export async function createWorkout(
  userId: string,
  date: string,
  workoutType?: string,
  /** Client-generated id for optimistic start */
  workoutId?: string,
): Promise<{ id: string; startedAt: string }> {
  const startedAt = new Date().toISOString()
  const type = workoutType?.trim() || null
  const id =
    workoutId ??
    (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : undefined)

  const withType = await supabase
    .from('workouts')
    .insert({
      ...(id ? { id } : {}),
      user_id: userId,
      date,
      started_at: startedAt,
      workout_type: type,
      name: type ?? '',
    })
    .select('id, started_at, created_at')
    .single()

  if (!withType.error) {
    const row = withType.data as Pick<WorkoutRow, 'id' | 'started_at' | 'created_at'>
    return {
      id: row.id,
      startedAt: row.started_at ?? row.created_at ?? startedAt,
    }
  }

  // Pre-migration fallback (no workout_type column yet)
  if (isMissingColumnError(withType.error)) {
    const fallback = await supabase
      .from('workouts')
      .insert({
        ...(id ? { id } : {}),
        user_id: userId,
        date,
        started_at: startedAt,
        name: type ?? '',
      })
      .select('id, started_at, created_at')
      .single()
    if (fallback.error) throw toServiceError(fallback.error)
    const row = fallback.data as Pick<WorkoutRow, 'id' | 'started_at' | 'created_at'>
    return {
      id: row.id,
      startedAt: row.started_at ?? row.created_at ?? startedAt,
    }
  }

  throw toServiceError(withType.error)
}

/** @deprecated Prefer updateWorkoutMeta — kept for existing call sites. */
export async function updateWorkoutLabel(
  workoutId: string,
  name: string,
): Promise<void> {
  await updateWorkoutMeta(workoutId, {
    name,
    workout_type: name.trim() || null,
  })
}

export async function updateWorkoutMeta(
  workoutId: string,
  meta: UpdateWorkoutMetaInput,
): Promise<void> {
  const patch: Record<string, unknown> = {}
  if (meta.workout_type !== undefined) {
    patch.workout_type = meta.workout_type
    // Keep legacy name column in sync when type is set
    if (meta.name === undefined) patch.name = meta.workout_type ?? ''
  }
  if (meta.name !== undefined) patch.name = meta.name ?? ''
  if (meta.warmup_started_at !== undefined) patch.warmup_started_at = meta.warmup_started_at
  if (meta.warmup_ended_at !== undefined) patch.warmup_ended_at = meta.warmup_ended_at
  if (meta.warmup_note !== undefined) patch.warmup_note = meta.warmup_note
  if (meta.feel !== undefined) patch.feel = meta.feel
  if (meta.note !== undefined) patch.note = meta.note

  if (Object.keys(patch).length === 0) return

  const { error } = await supabase.from('workouts').update(patch).eq('id', workoutId)
  if (!error) return

  // Pre-migration: drop v2-only columns and retry with name/started fields only
  if (isMissingColumnError(error)) {
    const legacy: Record<string, unknown> = {}
    if (patch.name !== undefined) legacy.name = patch.name
    if (Object.keys(legacy).length === 0) return
    const retry = await supabase.from('workouts').update(legacy).eq('id', workoutId)
    if (retry.error) throw toServiceError(retry.error)
    return
  }

  throw toServiceError(error)
}

/** Fields that can be written together with `ended_at` in a single update. */
export type FinishWorkoutMeta = Pick<
  UpdateWorkoutMetaInput,
  'feel' | 'note' | 'warmup_started_at' | 'warmup_ended_at' | 'warmup_note'
>

/** Single UPDATE: marks the workout ended and writes feel/note/warmup together. */
export async function finishWorkout(
  workoutId: string,
  meta?: FinishWorkoutMeta,
): Promise<void> {
  const { error } = await supabase
    .from('workouts')
    .update({
      ended_at: new Date().toISOString(),
      ...(meta?.feel !== undefined ? { feel: meta.feel } : {}),
      ...(meta?.note !== undefined ? { note: meta.note } : {}),
      ...(meta?.warmup_started_at !== undefined
        ? { warmup_started_at: meta.warmup_started_at }
        : {}),
      ...(meta?.warmup_ended_at !== undefined ? { warmup_ended_at: meta.warmup_ended_at } : {}),
      ...(meta?.warmup_note !== undefined ? { warmup_note: meta.warmup_note } : {}),
    })
    .eq('id', workoutId)

  if (error) throw toServiceError(error)
}

/** Existence / ended state of a workout row (null = row does not exist). */
export async function getWorkoutStatus(
  workoutId: string,
): Promise<{ id: string; endedAt: string | null } | null> {
  const { data, error } = await supabase
    .from('workouts')
    .select('id, ended_at')
    .eq('id', workoutId)
    .maybeSingle()
  if (error) throw toServiceError(error)
  if (!data) return null
  const row = data as { id: string; ended_at: string | null }
  return { id: row.id, endedAt: row.ended_at }
}

/** Discard an in-progress / empty workout (cascades exercises + sets). */
export async function deleteWorkout(workoutId: string): Promise<void> {
  const { error } = await supabase.from('workouts').delete().eq('id', workoutId)
  if (error) throw toServiceError(error)
}

/** Remove a workout_exercise row (cascades its sets). */
export async function deleteWorkoutExercise(workoutExerciseId: string): Promise<void> {
  const { error } = await supabase
    .from('workout_exercises')
    .delete()
    .eq('id', workoutExerciseId)
  if (error) throw toServiceError(error)
}

/** Remove several workout_exercise rows in one round trip (cascades their sets). */
export async function deleteWorkoutExercises(workoutExerciseIds: string[]): Promise<void> {
  if (workoutExerciseIds.length === 0) return
  const { error } = await supabase
    .from('workout_exercises')
    .delete()
    .in('id', workoutExerciseIds)
  if (error) throw toServiceError(error)
}

export async function addExerciseToWorkout(
  workoutId: string,
  exerciseId: string,
  orderIndex: number,
  extras?: { target?: WorkoutExerciseTarget | null; note?: string | null },
): Promise<string> {
  const base = {
    workout_id: workoutId,
    exercise_id: exerciseId,
    order_index: orderIndex,
  }
  const withExtras = {
    ...base,
    target: extras?.target ?? null,
    note: extras?.note ?? null,
  }

  const first = await supabase.from('workout_exercises').insert(withExtras).select('id').single()
  if (!first.error) return (first.data as Pick<WorkoutExerciseRow, 'id'>).id

  if (isMissingColumnError(first.error)) {
    const fallback = await supabase.from('workout_exercises').insert(base).select('id').single()
    if (fallback.error) throw toServiceError(fallback.error)
    return (fallback.data as Pick<WorkoutExerciseRow, 'id'>).id
  }

  throw toServiceError(first.error)
}

export async function updateWorkoutExercise(
  workoutExerciseId: string,
  patch: { target?: WorkoutExerciseTarget | null; note?: string | null; order_index?: number },
): Promise<void> {
  const { error } = await supabase
    .from('workout_exercises')
    .update(patch)
    .eq('id', workoutExerciseId)

  if (error) throw toServiceError(error)
}

function finiteOrNull(n: number | null | undefined): number | null {
  if (n == null) return null
  return Number.isFinite(n) ? n : null
}

function isMissingColumnError(error: { message?: string; code?: string; details?: string } | null): boolean {
  if (!error?.message && !error?.details) return false
  const blob = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase()
  return (
    blob.includes('schema cache') ||
    blob.includes('column') ||
    blob.includes('could not find') ||
    error.code === 'PGRST204'
  )
}

/** Columns written by the sets upsert — must match public.sets (+ v2 migration). */
export const SETS_UPSERT_COLUMNS = [
  'id',
  'workout_exercise_id',
  'reps',
  'weight',
  'to_failure',
  'failed',
  'completed_at',
  'set_index',
] as const

export type SetUpsertPayload = {
  id: string
  workout_exercise_id: string
  reps: number | null
  weight: number | null
  to_failure: boolean
  failed: boolean
  completed_at: string | null
  set_index: number
}

/** Full sets row payload — never strip fields on failure. */
export function buildSetUpsertPayload(
  setId: string,
  workoutExerciseId: string,
  setData: AddSetInput,
): SetUpsertPayload {
  const failed = Boolean(setData.failed ?? setData.to_failure)
  return {
    id: setId,
    workout_exercise_id: workoutExerciseId,
    reps: finiteOrNull(setData.reps),
    weight: finiteOrNull(setData.weight),
    to_failure: failed,
    failed,
    completed_at: setData.completed_at !== undefined ? setData.completed_at : null,
    set_index: setData.set_index ?? 1,
  }
}

function logSetUpsertError(
  error: { message?: string; code?: string; details?: string; hint?: string },
  payload: SetUpsertPayload,
) {
  console.error('[upsertSet] failed', {
    message: error.message,
    code: error.code,
    details: error.details,
    hint: error.hint,
    body: error,
    payload,
  })
}

/**
 * Single write path for a set: one full-payload upsert by primary key.
 * No stripped-column fallback — v2 columns (`failed`, `completed_at`) are required.
 * Offline retries go through the app sync queue (not Workbox BackgroundSync).
 */
export async function upsertSet(
  setId: string,
  workoutExerciseId: string,
  setData: AddSetInput,
): Promise<string> {
  if (!setId || !workoutExerciseId) {
    throw new Error('upsertSet requires setId and workoutExerciseId')
  }
  const row = buildSetUpsertPayload(setId, workoutExerciseId, setData)
  // PK conflict target; avoid .select().single() (RLS can hide the row → false 406)
  const { error } = await supabase.from('sets').upsert(row, { onConflict: 'id' })
  if (!error) return setId

  logSetUpsertError(error, row)
  throw toServiceError(error)
}

export async function deleteSet(setId: string): Promise<void> {
  const { error } = await supabase.from('sets').delete().eq('id', setId)
  if (error) throw toServiceError(error)
}

/** Delete many sets in one round trip (ids that don't exist are ignored). */
export async function deleteSets(setIds: string[]): Promise<void> {
  if (setIds.length === 0) return
  const { error } = await supabase.from('sets').delete().in('id', setIds)
  if (error) throw toServiceError(error)
}

/** @deprecated Prefer upsertSet */
export async function addSet(
  workoutExerciseId: string,
  setData: AddSetInput,
): Promise<string> {
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  return upsertSet(id, workoutExerciseId, setData)
}

/** @deprecated Prefer upsertSet */
export async function updateSet(
  setId: string,
  setData: AddSetInput,
  workoutExerciseId?: string,
): Promise<void> {
  if (workoutExerciseId) {
    await upsertSet(setId, workoutExerciseId, setData)
    return
  }
  const failed = Boolean(setData.failed ?? setData.to_failure)
  const patch = {
    reps: finiteOrNull(setData.reps),
    weight: finiteOrNull(setData.weight),
    to_failure: failed,
    set_index: setData.set_index ?? 1,
    ...(setData.completed_at !== undefined ? { completed_at: setData.completed_at } : {}),
  }
  const { error } = await supabase.from('sets').update(patch).eq('id', setId)
  if (error) throw toServiceError(error)
}


/**
 * Last completed session for an exercise — one indexed sets query (not a full WE scan).
 * Returns completed sets only, ordered by set_index.
 */
export async function getLastPerformance(
  userId: string,
  exerciseId: string,
): Promise<LastPerformanceSet[]> {
  // Latest ended workout that includes this exercise
  const { data: weRows, error: weError } = await supabase
    .from('workout_exercises')
    .select(
      `
      id,
      workouts!inner ( user_id, ended_at )
    `,
    )
    .eq('exercise_id', exerciseId)
    .eq('workouts.user_id', userId)
    .not('workouts.ended_at', 'is', null)
    .order('workouts(ended_at)', { ascending: false })
    .limit(5)

  if (weError) throw toServiceError(weError)
  const ids = ((weRows ?? []) as unknown as Array<{ id: string }>).map((row) => row.id)
  if (ids.length === 0) return []

  const { data: sets, error: setsError } = await supabase
    .from('sets')
    .select('workout_exercise_id, weight, reps, set_index, completed_at')
    .in('workout_exercise_id', ids)

  if (setsError) throw toServiceError(setsError)

  const byExercise = new Map<
    string,
    Array<{
      weight: number | null
      reps: number | null
      set_index: number | null
      completed_at: string | null
    }>
  >()
  for (const row of (sets ?? []) as Array<{
    workout_exercise_id: string
    weight: number | null
    reps: number | null
    set_index: number | null
    completed_at: string | null
  }>) {
    const list = byExercise.get(row.workout_exercise_id) ?? []
    list.push(row)
    byExercise.set(row.workout_exercise_id, list)
  }

  for (const id of ids) {
    const completed = (byExercise.get(id) ?? [])
      .filter((s) => isCompletedSet(s))
      .sort((a, b) => (a.set_index ?? 0) - (b.set_index ?? 0))
    if (completed.length > 0) {
      return completed.map((s) => ({ weight: s.weight, reps: s.reps }))
    }
  }
  return []
}

type PRSetRow = {
  weight: number | null
  reps: number | null
  completed_at?: string | null
  workout_exercises: {
    workout_id?: string
    workouts:
      | { id?: string; date: string; ended_at?: string | null }
      | { id?: string; date: string; ended_at?: string | null }[]
      | null
  } | null
}

export async function getExercisePersonalRecord(
  userId: string,
  exerciseId: string,
  /** Exclude the in-progress workout so finish summary can detect new PRs */
  excludeWorkoutId?: string | null,
): Promise<ExercisePR | null> {
  // Pull a small top-weight slice; filter incomplete / excluded workouts client-side
  const { data, error } = await supabase
    .from('sets')
    .select(`
      weight,
      reps,
      completed_at,
      workout_exercises!inner (
        workout_id,
        workouts!inner ( id, date, user_id, ended_at ),
        exercise_id
      )
    `)
    .eq('workout_exercises.exercise_id', exerciseId)
    .eq('workout_exercises.workouts.user_id', userId)
    .not('workout_exercises.workouts.ended_at', 'is', null)
    .not('weight', 'is', null)
    .not('reps', 'is', null)
    .order('weight', { ascending: false })
    .order('reps', { ascending: false })
    .limit(12)

  if (error) throw toServiceError(error)

  const rows = (data ?? []) as unknown as PRSetRow[]
  let best: { weight: number; reps: number; date: string | null } | null = null
  for (const row of rows) {
    if (row.weight == null || row.reps == null) continue
    if (row.completed_at === null) continue
    const we = row.workout_exercises
    const workouts = we?.workouts
    const workout = Array.isArray(workouts) ? workouts[0] : workouts
    const workoutId = we?.workout_id ?? workout?.id
    if (excludeWorkoutId && workoutId === excludeWorkoutId) continue
    const date = workout?.date ?? null
    if (
      !best ||
      row.weight > best.weight ||
      (row.weight === best.weight && row.reps > best.reps)
    ) {
      best = { weight: row.weight, reps: row.reps, date }
    }
  }

  return best
}

/** Parallel last-session + PR fetch for exercise cards (avoids waterfall). */
export async function getExercisePrefillContext(
  userId: string,
  exerciseId: string,
  excludeWorkoutId?: string | null,
): Promise<{ lastSets: LastPerformanceSet[]; pr: ExercisePR | null }> {
  const [lastSets, pr] = await Promise.all([
    getLastPerformance(userId, exerciseId),
    getExercisePersonalRecord(userId, exerciseId, excludeWorkoutId),
  ])
  return { lastSets, pr }
}

/** Recent completed workout types (most recent first). */
export async function getRecentWorkoutTypes(
  userId: string,
  limit = 8,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('workouts')
    .select('workout_type, name, ended_at')
    .eq('user_id', userId)
    .not('ended_at', 'is', null)
    .order('ended_at', { ascending: false })
    .limit(limit)

  if (error) {
    const legacy = await supabase
      .from('workouts')
      .select('name, ended_at')
      .eq('user_id', userId)
      .not('ended_at', 'is', null)
      .order('ended_at', { ascending: false })
      .limit(limit)
    if (legacy.error) throw toServiceError(legacy.error)
    return (legacy.data ?? [])
      .map((r) => ((r as { name: string | null }).name ?? '').trim())
      .filter(Boolean)
  }

  return (data ?? [])
    .map((r) => {
      const row = r as { workout_type: string | null; name: string | null }
      return (row.workout_type || row.name || '').trim()
    })
    .filter(Boolean)
}

export type DashboardStats = {
  weightTrend: Array<{ date: string; weight: number }>
  workoutsThisWeek: number
  streakDays: number
}

/** Monday of this week as YYYY-MM-DD in the local timezone (not a rolling 7 days, not UTC). */
export function startOfLocalWeekMonday(now = new Date()): string {
  const day = now.getDay()
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (day === 0 ? 6 : day - 1))
  return localDateString(monday)
}

export async function getDashboardStats(userId: string): Promise<DashboardStats> {
  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 6)
  const weekAgoStr = localDateString(weekAgo)
  const weekStart = startOfLocalWeekMonday()

  const streakFrom = new Date()
  streakFrom.setDate(streakFrom.getDate() - 59)

  const [weights, workouts, restDayDates] = await Promise.all([
    supabase
      .from('daily_logs')
      .select('date, weight')
      .eq('user_id', userId)
      .not('weight', 'is', null)
      .gte('date', weekAgoStr)
      .order('date', { ascending: true }),
    supabase
      .from('workouts')
      .select('date, ended_at')
      .eq('user_id', userId)
      .not('ended_at', 'is', null)
      .order('ended_at', { ascending: false })
      .limit(60),
    listRestDays(userId, { from: localDateString(streakFrom) }),
  ])

  if (weights.error) throw toServiceError(weights.error)
  if (workouts.error) throw toServiceError(workouts.error)

  const weightTrend = (weights.data ?? [])
    .filter((r) => r.weight != null)
    .map((r) => ({ date: r.date as string, weight: Number(r.weight) }))

  const workoutRows = workouts.data ?? []
  const workoutDates = new Set(workoutRows.map((r) => r.date as string))
  const restDates = new Set(restDayDates)
  // Completed sessions in the current local calendar week (Monday through today).
  const workoutsThisWeek = workoutRows.filter((r) => (r.date as string) >= weekStart).length

  // Streak: consecutive calendar days with a completed workout ending today/yesterday
  let streakDays = 0
  const cursor = new Date()
  for (let i = 0; i < 60; i++) {
    const key = localDateString(cursor)
    if (workoutDates.has(key)) {
      streakDays += 1
      cursor.setDate(cursor.getDate() - 1)
      continue
    }
    if (i === 0) {
      // allow missing today — start from yesterday
      cursor.setDate(cursor.getDate() - 1)
      continue
    }
    if (restDates.has(key)) {
      // Marked rest days bridge the streak without counting.
      cursor.setDate(cursor.getDate() - 1)
      continue
    }
    break
  }

  return { weightTrend, workoutsThisWeek, streakDays }
}

/** Exercise IDs the user has logged recently (most recent first). */
export async function getRecentExerciseIds(
  userId: string,
  limit = 80,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('workout_exercises')
    .select(`
      exercise_id,
      workouts!inner ( user_id, ended_at )
    `)
    .eq('workouts.user_id', userId)
    .not('workouts.ended_at', 'is', null)
    .order('workouts(ended_at)', { ascending: false })
    .limit(limit)

  if (error) throw toServiceError(error)

  const seen = new Set<string>()
  const ordered: string[] = []
  for (const row of data ?? []) {
    const id = (row as { exercise_id: string }).exercise_id
    if (!seen.has(id)) {
      seen.add(id)
      ordered.push(id)
    }
  }
  return ordered
}

export type LatestWorkoutExercise = {
  exerciseId: string
  name: string
  muscleGroup: string
  orderIndex: number
  sets: Array<{ weight: number | null; reps: number | null; setIndex: number }>
}

export type LatestCompletedWorkout = {
  label: string
  date: string
  durationText: string
  exerciseCount: number
  setCount: number
  totalVolumeKg: number
  exerciseNames: string[]
  exercises: LatestWorkoutExercise[]
}

type LatestWorkoutRow = {
  name: string | null
  workout_type: string | null
  date: string
  created_at: string
  started_at: string | null
  ended_at: string
  workout_exercises: Array<{
    exercise_id: string
    order_index: number
    exercises: { name: string; muscle_group: string } | { name: string; muscle_group: string }[] | null
    sets: Array<{
      weight: number | null
      reps: number | null
      set_index?: number | null
      completed_at: string | null
    }> | null
  }> | null
}

export async function getLatestCompletedWorkout(userId: string): Promise<LatestCompletedWorkout | null> {
  const v2Select = `
      name,
      workout_type,
      date,
      created_at,
      started_at,
      ended_at,
      workout_exercises (
        exercise_id,
        order_index,
        exercises ( name, muscle_group ),
        sets ( weight, reps, set_index, completed_at )
      )
    `
  const legacySelect = `
      name,
      date,
      created_at,
      started_at,
      ended_at,
      workout_exercises (
        exercise_id,
        order_index,
        exercises ( name, muscle_group ),
        sets ( weight, reps, set_index )
      )
    `

  let data: unknown = null
  const first = await supabase
    .from('workouts')
    .select(v2Select)
    .eq('user_id', userId)
    .not('ended_at', 'is', null)
    .order('ended_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (first.error && isMissingColumnError(first.error)) {
    const fallback = await supabase
      .from('workouts')
      .select(legacySelect)
      .eq('user_id', userId)
      .not('ended_at', 'is', null)
      .order('ended_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (fallback.error) throw toServiceError(fallback.error)
    data = fallback.data
  } else if (first.error) {
    throw toServiceError(first.error)
  } else {
    data = first.data
  }

  if (!data) return null
  const row = data as unknown as LatestWorkoutRow

  const startMs = new Date(row.started_at ?? row.created_at).getTime()
  const endMs = new Date(row.ended_at).getTime()
  const minutes = Math.max(1, Math.round((endMs - startMs) / 60000))
  const durationText = endMs <= startMs ? '' : `${minutes}m`

  const exerciseRows = (row.workout_exercises ?? []).sort(
    (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0),
  )

  const exercises: LatestWorkoutExercise[] = onlyExercisesWithCompletedSets(
    exerciseRows
      .map((we) => {
        const ex = Array.isArray(we.exercises) ? we.exercises[0] : we.exercises
        if (!ex) return null
        const sets = (we.sets ?? [])
          .filter((s) => isCompletedSet(s))
          .sort((a, b) => (a.set_index ?? 0) - (b.set_index ?? 0))
          .map((s) => ({ weight: s.weight, reps: s.reps, setIndex: s.set_index ?? 0 }))
        return {
          exerciseId: we.exercise_id,
          name: ex.name,
          muscleGroup: ex.muscle_group,
          orderIndex: we.order_index ?? 0,
          sets,
        }
      })
      .filter((e): e is LatestWorkoutExercise => e !== null),
  )

  const exerciseNames = exercises.map((e) => e.name)

  const completed = exercises.flatMap((e) => e.sets)
  const setCount = completed.length
  const volume = Math.round(totalVolumeKg(completed) * 10) / 10

  return {
    label: row.workout_type || row.name || 'Workout Session',
    date: row.date,
    durationText,
    exerciseCount: exercises.length,
    setCount,
    totalVolumeKg: volume,
    exerciseNames,
    exercises,
  }
}

export type RecentWorkout = {
  id: string
  label: string
  date: string
  exerciseCount: number
  setCount: number
  durationMins: number | null
}

type RecentWorkoutRow = {
  id: string
  name: string | null
  workout_type?: string | null
  date: string
  started_at: string | null
  ended_at: string
  workout_exercises: Array<{
    exercise_id: string
    sets: Array<{
      weight: number | null
      reps: number | null
      completed_at?: string | null
    }> | null
  }> | null
}

/** Finished workouts only, newest first. Read-only. */
export async function getRecentWorkouts(userId: string, limit = 8): Promise<RecentWorkout[]> {
  const v2Select = `
      id,
      name,
      workout_type,
      date,
      created_at,
      started_at,
      ended_at,
      workout_exercises (
        exercise_id,
        sets ( weight, reps, completed_at )
      )
    `
  const legacySelect = `
      id,
      name,
      date,
      created_at,
      started_at,
      ended_at,
      workout_exercises (
        exercise_id,
        sets ( weight, reps )
      )
    `

  let data: unknown[] | null = null
  const first = await supabase
    .from('workouts')
    .select(v2Select)
    .eq('user_id', userId)
    .not('ended_at', 'is', null)
    .order('ended_at', { ascending: false })
    .limit(limit)

  if (first.error && isMissingColumnError(first.error)) {
    const fallback = await supabase
      .from('workouts')
      .select(legacySelect)
      .eq('user_id', userId)
      .not('ended_at', 'is', null)
      .order('ended_at', { ascending: false })
      .limit(limit)
    if (fallback.error) throw toServiceError(fallback.error)
    data = fallback.data
  } else if (first.error) {
    throw toServiceError(first.error)
  } else {
    data = first.data
  }

  return ((data ?? []) as unknown as RecentWorkoutRow[]).map((row) => {
    let exerciseCount = 0
    let setCount = 0
    for (const exercise of row.workout_exercises ?? []) {
      const completed = (exercise.sets ?? []).filter((set) => isCompletedSet(set))
      if (completed.length === 0) continue
      exerciseCount += 1
      setCount += completed.length
    }

    let durationMins: number | null = null
    if (row.started_at != null) {
      const minutes = Math.round(
        (new Date(row.ended_at).getTime() - new Date(row.started_at).getTime()) / 60000,
      )
      durationMins = minutes < 1 ? null : minutes
    }

    return {
      id: row.id,
      label: row.workout_type || row.name || 'Workout',
      date: row.date,
      exerciseCount,
      setCount,
      durationMins,
    }
  })
}

export type PastWorkoutInput = {
  /** Local calendar day, YYYY-MM-DD. */
  date: string
  workoutType: string
  /** ISO timestamp for started_at, ended_at, and each set's completed_at. */
  endedAt: string
  exercises: Array<{
    exerciseId: string
    sets: Array<{ weight: number | null; reps: number | null; toFailure: boolean }>
  }>
}

function newPastRowId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

/** Insert one finished workout for a past (or today) date. Never touches an existing row. */
export async function logPastWorkout(
  userId: string,
  input: PastWorkoutInput,
): Promise<{ id: string }> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('You are offline — reconnect and try again.')
  }

  const id = newPastRowId()
  const workoutType = input.workoutType.trim()

  try {
    const withType = await supabase.from('workouts').insert({
      id,
      user_id: userId,
      date: input.date,
      started_at: input.endedAt,
      workout_type: workoutType,
      name: workoutType,
    })

    if (withType.error && isMissingColumnError(withType.error)) {
      const fallback = await supabase.from('workouts').insert({
        id,
        user_id: userId,
        date: input.date,
        started_at: input.endedAt,
        name: workoutType,
      })
      if (fallback.error) throw fallback.error
    } else if (withType.error) {
      throw withType.error
    }

    const exerciseRows: Array<{
      id: string
      workout_id: string
      exercise_id: string
      order_index: number
    }> = []
    const setRows: SetUpsertPayload[] = []

    for (const exercise of input.exercises) {
      if (exercise.sets.length === 0) continue
      const workoutExerciseId = newPastRowId()
      exerciseRows.push({
        id: workoutExerciseId,
        workout_id: id,
        exercise_id: exercise.exerciseId,
        order_index: exerciseRows.length,
      })
      exercise.sets.forEach((set, setIndex) => {
        setRows.push(
          buildSetUpsertPayload(newPastRowId(), workoutExerciseId, {
            reps: set.reps,
            weight: set.weight,
            to_failure: set.toFailure,
            set_index: setIndex + 1,
            completed_at: input.endedAt,
          }),
        )
      })
    }

    if (exerciseRows.length > 0) {
      const exercisesInsert = await supabase.from('workout_exercises').insert(exerciseRows)
      if (exercisesInsert.error) throw exercisesInsert.error
    }
    if (setRows.length > 0) {
      const setsInsert = await supabase.from('sets').insert(setRows)
      if (setsInsert.error) throw setsInsert.error
    }

    const finished = await supabase
      .from('workouts')
      .update({ ended_at: input.endedAt })
      .eq('id', id)
      .eq('user_id', userId)
    if (finished.error) throw finished.error

    return { id }
  } catch (err) {
    try {
      await supabase.from('workouts').delete().eq('id', id).eq('user_id', userId).is('ended_at', null)
    } catch {
      // The leftover row is unfinished and invisible to history and stats.
    }
    throw toServiceError(err)
  }
}
