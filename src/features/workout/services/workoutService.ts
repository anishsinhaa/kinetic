import { supabase } from '../../../lib/supabase/client'
import { toServiceError } from '../../../lib/supabase/errors'
import type {
  SetRow,
  WorkoutExerciseRow,
  WorkoutRow,
} from '../../../lib/supabase/database.types'
import type { AddSetInput } from '../types'

type LastPerformanceSet = { weight: number | null; reps: number | null }
type ExercisePR = { weight: number | null; reps: number | null; date: string | null }

export async function createWorkout(
  userId: string,
  date: string,
): Promise<{ id: string; createdAt: string }> {
  const { data, error } = await supabase
    .from('workouts')
    .insert({
      user_id: userId,
      date,
    })
    .select('id, created_at')
    .single()

  if (error) throw toServiceError(error)
  const row = data as Pick<WorkoutRow, 'id' | 'created_at'>
  return { id: row.id, createdAt: row.created_at }
}

export async function updateWorkoutLabel(
  workoutId: string,
  name: string,
): Promise<void> {
  const { error } = await supabase
    .from('workouts')
    .update({ name })
    .eq('id', workoutId)

  if (error) throw toServiceError(error)
}

export async function finishWorkout(workoutId: string): Promise<void> {
  const { error } = await supabase
    .from('workouts')
    .update({ ended_at: new Date().toISOString() })
    .eq('id', workoutId)

  if (error) throw toServiceError(error)
}

export async function addExerciseToWorkout(
  workoutId: string,
  exerciseId: string,
  orderIndex: number,
): Promise<string> {
  const { data, error } = await supabase
    .from('workout_exercises')
    .insert({
      workout_id: workoutId,
      exercise_id: exerciseId,
      order_index: orderIndex,
    })
    .select('id')
    .single()

  if (error) throw toServiceError(error)
  return (data as Pick<WorkoutExerciseRow, 'id'>).id
}

export async function addSet(
  workoutExerciseId: string,
  setData: AddSetInput,
): Promise<string> {
  const { data, error } = await supabase
    .from('sets')
    .insert({
      workout_exercise_id: workoutExerciseId,
      reps: setData.reps,
      weight: setData.weight,
      to_failure: setData.to_failure,
      set_index: setData.set_index ?? 1,
    })
    .select('id')
    .single()

  if (error) throw toServiceError(error)
  return (data as Pick<SetRow, 'id'>).id
}

export async function updateSet(
  setId: string,
  setData: AddSetInput,
): Promise<void> {
  const { error } = await supabase
    .from('sets')
    .update({
      reps: setData.reps,
      weight: setData.weight,
      to_failure: setData.to_failure,
      set_index: setData.set_index,
    })
    .eq('id', setId)

  if (error) throw toServiceError(error)
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
  date: string
  created_at: string
  ended_at: string
  workout_exercises: Array<{
    exercise_id: string
    order_index: number
    exercises: { name: string; muscle_group: string } | { name: string; muscle_group: string }[] | null
    sets: Array<{ weight: number | null; reps: number | null }> | null
  }> | null
}

export async function getLatestCompletedWorkout(userId: string): Promise<LatestCompletedWorkout | null> {
  const { data, error } = await supabase
    .from('workouts')
    .select(`
      name,
      date,
      created_at,
      ended_at,
      workout_exercises (
        exercise_id,
        order_index,
        exercises ( name, muscle_group ),
        sets ( weight, reps )
      )
    `)
    .eq('user_id', userId)
    .not('ended_at', 'is', null)
    .order('ended_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw toServiceError(error)
  if (!data) return null
  const row = data as unknown as LatestWorkoutRow

  const createdAt = new Date(row.created_at)
  const endedAt = new Date(row.ended_at)
  const minutes = Math.max(1, Math.round((endedAt.getTime() - createdAt.getTime()) / 60000))
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

  let setCount = 0
  let totalVolumeKg = 0
  for (const we of exerciseRows) {
    for (const set of we.sets ?? []) {
      setCount += 1
      totalVolumeKg += (set.weight ?? 0) * (set.reps ?? 0)
    }
  }

  return {
    label: row.name || 'Workout Session',
    date: row.date,
    durationText,
    exerciseCount: exercises.length,
    setCount,
    totalVolumeKg: Math.round(totalVolumeKg),
    exerciseNames,
    exercises,
  }
}
