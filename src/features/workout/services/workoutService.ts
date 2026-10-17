import { supabase } from '../../../lib/supabase/client'
import { toServiceError } from '../../../lib/supabase/errors'
import type {
  SetRow,
  WorkoutExerciseRow,
  WorkoutExerciseTarget,
  WorkoutRow,
} from '../../../lib/supabase/database.types'
import type { AddSetInput, UpdateWorkoutMetaInput } from '../types'
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

export async function finishWorkout(
  workoutId: string,
  meta?: Pick<UpdateWorkoutMetaInput, 'feel' | 'note'>,
): Promise<void> {
  const { error } = await supabase
    .from('workouts')
    .update({
      ended_at: new Date().toISOString(),
      ...(meta?.feel !== undefined ? { feel: meta.feel } : {}),
      ...(meta?.note !== undefined ? { note: meta.note } : {}),
    })
    .eq('id', workoutId)

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

function setWritePayload(setData: AddSetInput, includeV2Fields: boolean) {
  const failed = setData.failed ?? setData.to_failure
  const hasData = setData.reps != null || setData.weight != null
  const base = {
    reps: setData.reps,
    weight: setData.weight,
    to_failure: failed,
    set_index: setData.set_index ?? 1,
  }
  if (!includeV2Fields) return base
  return {
    ...base,
    failed,
    completed_at:
      setData.completed_at !== undefined
        ? setData.completed_at
        : hasData
          ? new Date().toISOString()
          : null,
  }
}

function isMissingColumnError(error: { message?: string; code?: string } | null): boolean {
  if (!error?.message) return false
  return (
    error.message.includes('schema cache') ||
    error.message.includes('column') ||
    error.code === 'PGRST204'
  )
}

/**
 * Single write path for a set: upsert by primary key so rapid edits never duplicate rows.
 */
export async function upsertSet(
  setId: string,
  workoutExerciseId: string,
  setData: AddSetInput,
): Promise<string> {
  const withV2 = {
    id: setId,
    workout_exercise_id: workoutExerciseId,
    ...setWritePayload(setData, true),
  }
  const first = await supabase.from('sets').upsert(withV2, { onConflict: 'id' }).select('id').single()

  if (!first.error) return (first.data as Pick<SetRow, 'id'>).id

  if (isMissingColumnError(first.error)) {
    const fallback = await supabase
      .from('sets')
      .upsert(
        {
          id: setId,
          workout_exercise_id: workoutExerciseId,
          ...setWritePayload(setData, false),
        },
        { onConflict: 'id' },
      )
      .select('id')
      .single()
    if (fallback.error) throw toServiceError(fallback.error)
    return (fallback.data as Pick<SetRow, 'id'>).id
  }

  throw toServiceError(first.error)
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
): Promise<void> {
  // Update-only path kept for callers that already have a row; still safe via upsert when weid known
  const first = await supabase
    .from('sets')
    .update(setWritePayload(setData, true))
    .eq('id', setId)

  if (!first.error) return

  if (isMissingColumnError(first.error)) {
    const fallback = await supabase
      .from('sets')
      .update(setWritePayload(setData, false))
      .eq('id', setId)
    if (fallback.error) throw toServiceError(fallback.error)
    return
  }

  throw toServiceError(first.error)
}

type LastWorkoutExerciseWithSets = {
  id: string
  sets: Array<Pick<SetRow, 'weight' | 'reps' | 'set_index'>>
}

export async function getLastPerformance(
  userId: string,
  exerciseId: string,
): Promise<LastPerformanceSet[]> {
  const { data: workoutExercises, error } = await supabase
    .from('workout_exercises')
    .select(`
      id,
      sets ( weight, reps, set_index ),
      workouts!inner ( user_id, date )
    `)
    .eq('exercise_id', exerciseId)
    .eq('workouts.user_id', userId)
    .order('date', { ascending: false, foreignTable: 'workouts' })
    .limit(1)

  if (error) throw toServiceError(error)
  const first = (workoutExercises as unknown as LastWorkoutExerciseWithSets[])[0]
  if (!first) return []

  return (first.sets ?? [])
    .sort((a, b) => (a.set_index ?? 0) - (b.set_index ?? 0))
    .map((s) => ({ weight: s.weight, reps: s.reps }))
}

type PRSetRow = {
  weight: number | null
  reps: number | null
  workout_exercises: {
    workouts: { date: string } | { date: string }[] | null
  } | null
}

export async function getExercisePersonalRecord(
  userId: string,
  exerciseId: string,
): Promise<ExercisePR | null> {
  const { data, error } = await supabase
    .from('sets')
    .select(`
      weight,
      reps,
      workout_exercises!inner (
        workouts!inner ( date, user_id ),
        exercise_id
      )
    `)
    .eq('workout_exercises.exercise_id', exerciseId)
    .eq('workout_exercises.workouts.user_id', userId)
    .not('weight', 'is', null)
    .order('weight', { ascending: false })
    .order('reps', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw toServiceError(error)
  if (!data) return null

  const row = data as unknown as PRSetRow
  const workouts = row.workout_exercises?.workouts
  const date = Array.isArray(workouts) ? workouts[0]?.date ?? null : workouts?.date ?? null

  return {
    weight: row.weight,
    reps: row.reps,
    date,
  }
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
    .order('ended_at', { ascending: false, foreignTable: 'workouts' })
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
        sets ( weight, reps, completed_at )
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
        sets ( weight, reps )
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
  const durationText = `${minutes}m`

  const exerciseRows = (row.workout_exercises ?? []).sort(
    (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0),
  )

  const exercises: LatestWorkoutExercise[] = exerciseRows
    .map((we) => {
      const ex = Array.isArray(we.exercises) ? we.exercises[0] : we.exercises
      if (!ex) return null
      return {
        exerciseId: we.exercise_id,
        name: ex.name,
        muscleGroup: ex.muscle_group,
        orderIndex: we.order_index ?? 0,
      }
    })
    .filter((e): e is LatestWorkoutExercise => e !== null)

  const exerciseNames = exercises.map((e) => e.name)

  const allSets = exerciseRows.flatMap((we) => we.sets ?? [])
  // Volume = sum(weight × reps) of completed sets only
  const completed = allSets.filter(isCompletedSet)
  const setCount = completed.length
  const volume = Math.round(totalVolumeKg(completed))

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
