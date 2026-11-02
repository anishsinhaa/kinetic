import { supabase } from '../../../lib/supabase/client'
import { toServiceError } from '../../../lib/supabase/errors'
import { isCompletedSet } from '../lib/volume'
import {
  deleteSets,
  deleteWorkoutExercises,
  updateWorkoutMeta,
  upsertSet,
} from './workoutService'

export type EditableSet = {
  id: string
  weight: number | null
  reps: number | null
  toFailure: boolean
  failed: boolean
  completedAt: string | null
  setIndex: number
}

export type EditableExercise = {
  id: string
  exerciseId: string
  name: string
  muscleGroup: string
  orderIndex: number
  maxSetIndex: number
  sets: EditableSet[]
}

export type EditableWorkout = {
  id: string
  type: string
  date: string
  startedAt: string | null
  endedAt: string
  maxOrderIndex: number
  exercises: EditableExercise[]
}

export type WorkoutEditDraft = {
  type: string
  removedSetIds: string[]
  removedExerciseIds: string[]
  changedSets: Array<{
    exerciseRowId: string
    set: { id: string; weight: number | null; reps: number | null; setIndex: number }
  }>
  newExercises: Array<{
    rowId: string
    exerciseId: string
    sets: Array<{ id: string; weight: number | null; reps: number | null }>
  }>
  addedSets: Array<{
    exerciseRowId: string
    set: { id: string; weight: number | null; reps: number | null }
  }>
}

type JoinedExercise = { name: string; muscle_group: string }

type RawSet = {
  id: string
  weight: number | string | null
  reps: number | string | null
  to_failure: boolean | null
  failed: boolean | null
  completed_at: string | null
  set_index: number | string | null
}

type RawExercise = {
  id: string
  exercise_id: string
  order_index: number | string | null
  exercises: JoinedExercise | JoinedExercise[] | null
  sets: RawSet[] | null
}

type RawWorkout = {
  id: string
  name: string | null
  workout_type: string | null
  date: string
  started_at: string | null
  ended_at: string | null
  workout_exercises: RawExercise[] | null
}

function asNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function joinedExercise(value: RawExercise['exercises']): JoinedExercise | null {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

function mapExercise(raw: RawExercise): EditableExercise {
  const joined = joinedExercise(raw.exercises)
  const allSets = raw.sets ?? []
  let maxSetIndex = 0
  for (const set of allSets) {
    const index = asNumber(set.set_index) ?? 0
    if (index > maxSetIndex) maxSetIndex = index
  }
  const sets = allSets
    .flatMap((set): EditableSet[] => {
      const weight = asNumber(set.weight)
      const reps = asNumber(set.reps)
      if (!isCompletedSet({ weight, reps, completed_at: set.completed_at })) return []
      return [
        {
          id: set.id,
          weight,
          reps,
          toFailure: Boolean(set.to_failure),
          failed: Boolean(set.failed),
          completedAt: set.completed_at,
          setIndex: asNumber(set.set_index) ?? 0,
        },
      ]
    })
    .sort(
      (a, b) =>
        a.setIndex - b.setIndex || (a.completedAt ?? '').localeCompare(b.completedAt ?? ''),
    )
  return {
    id: raw.id,
    exerciseId: raw.exercise_id,
    name: joined?.name?.trim() || 'Exercise',
    muscleGroup: joined?.muscle_group?.trim() || '',
    orderIndex: asNumber(raw.order_index) ?? 0,
    maxSetIndex,
    sets,
  }
}

export async function getWorkoutForEdit(
  userId: string,
  workoutId: string,
): Promise<EditableWorkout | null> {
  const { data, error } = await supabase
    .from('workouts')
    .select(
      'id, name, workout_type, date, started_at, ended_at, workout_exercises ( id, exercise_id, order_index, exercises ( name, muscle_group ), sets ( id, weight, reps, to_failure, failed, completed_at, set_index ) )',
    )
    .eq('id', workoutId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw toServiceError(error)
  if (!data) return null

  const row = data as RawWorkout
  if (row.ended_at == null) return null

  const exercises = (row.workout_exercises ?? [])
    .map(mapExercise)
    .sort((a, b) => a.orderIndex - b.orderIndex)
  const maxOrderIndex = exercises.reduce((max, exercise) => Math.max(max, exercise.orderIndex), 0)
  const type = row.workout_type?.trim() || row.name?.trim() || ''

  return {
    id: row.id,
    type,
    date: row.date,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    maxOrderIndex,
    exercises,
  }
}

function originalSet(original: EditableWorkout, setId: string): EditableSet | undefined {
  for (const exercise of original.exercises) {
    const found = exercise.sets.find((set) => set.id === setId)
    if (found) return found
  }
  return undefined
}

export async function saveWorkoutEdits(
  userId: string,
  original: EditableWorkout,
  draft: WorkoutEditDraft,
): Promise<void> {
  const { data, error } = await supabase
    .from('workouts')
    .select('id')
    .eq('id', original.id)
    .eq('user_id', userId)
    .not('ended_at', 'is', null)
    .maybeSingle()
  if (error) throw toServiceError(error)
  if (!data) throw new Error('This workout no longer exists')
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error("You're offline — reconnect and try again.")
  }

  for (let index = 0; index < draft.newExercises.length; index++) {
    const entry = draft.newExercises[index]
    if (!entry) continue
    const inserted = await supabase.from('workout_exercises').upsert(
      {
        id: entry.rowId,
        workout_id: original.id,
        exercise_id: entry.exerciseId,
        order_index: original.maxOrderIndex + 1 + index,
      },
      { onConflict: 'id', ignoreDuplicates: true },
    )
    if (inserted.error) throw toServiceError(inserted.error)
    for (let setIndex = 0; setIndex < entry.sets.length; setIndex++) {
      const set = entry.sets[setIndex]
      if (!set) continue
      await upsertSet(set.id, entry.rowId, {
        weight: set.weight,
        reps: set.reps,
        to_failure: false,
        failed: false,
        set_index: setIndex + 1,
        completed_at: original.endedAt,
      })
    }
  }

  const addedByExercise = new Map<string, WorkoutEditDraft['addedSets']>()
  for (const entry of draft.addedSets) {
    if (draft.removedExerciseIds.includes(entry.exerciseRowId)) continue
    const exercise = original.exercises.find((row) => row.id === entry.exerciseRowId)
    if (!exercise) continue
    const list = addedByExercise.get(entry.exerciseRowId) ?? []
    list.push(entry)
    addedByExercise.set(entry.exerciseRowId, list)
  }
  for (const [exerciseRowId, entries] of addedByExercise) {
    const exercise = original.exercises.find((row) => row.id === exerciseRowId)
    if (!exercise) continue
    for (let index = 0; index < entries.length; index++) {
      const set = entries[index]?.set
      if (!set) continue
      await upsertSet(set.id, exerciseRowId, {
        weight: set.weight,
        reps: set.reps,
        to_failure: false,
        failed: false,
        set_index: exercise.maxSetIndex + 1 + index,
        completed_at: original.endedAt,
      })
    }
  }

  for (const change of draft.changedSets) {
    const orig = originalSet(original, change.set.id)
    if (!orig) continue
    await upsertSet(change.set.id, change.exerciseRowId, {
      weight: change.set.weight,
      reps: change.set.reps,
      to_failure: orig.toFailure,
      failed: orig.failed,
      set_index: orig.setIndex,
      completed_at: orig.completedAt,
    })
  }

  const originalSetIds = new Set(original.exercises.flatMap((exercise) => exercise.sets.map((set) => set.id)))
  await deleteSets(draft.removedSetIds.filter((id) => originalSetIds.has(id)))

  const originalExerciseIds = new Set(original.exercises.map((exercise) => exercise.id))
  await deleteWorkoutExercises(draft.removedExerciseIds.filter((id) => originalExerciseIds.has(id)))

  const nextType = draft.type.trim()
  if (nextType !== original.type.trim() && nextType !== '') {
    await updateWorkoutMeta(original.id, { workout_type: nextType })
  }
}

export async function deleteFinishedWorkout(userId: string, workoutId: string): Promise<void> {
  const { error } = await supabase
    .from('workouts')
    .delete()
    .eq('id', workoutId)
    .eq('user_id', userId)
    .not('ended_at', 'is', null)
  if (error) throw toServiceError(error)
}
