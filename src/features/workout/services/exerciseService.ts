import { supabase } from '../../../lib/supabase/client'
import { toServiceError } from '../../../lib/supabase/errors'
import type { ExerciseRow } from '../../../lib/supabase/database.types'
import type { Exercise } from '../../exercises/types'

function mapExercise(row: ExerciseRow): Exercise {
  return {
    id: row.id,
    name: row.name,
    muscleGroup: row.muscle_group,
    equipment: row.equipment,
    difficulty: row.difficulty,
    exerciseType: row.exercise_type,
    instructions: row.instructions,
    isCustom: row.is_custom,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }
}

export async function getAllExercises(): Promise<Exercise[]> {
  const { data, error } = await supabase
    .from('exercises')
    .select('*')
    .order('name', { ascending: true })

  if (error) throw toServiceError(error)
  return (data as ExerciseRow[]).map(mapExercise)
}

/**
 * Search exercises stored in Supabase (the local library).
 * Zero API calls — all data is local after import.
 */
export async function searchExercisesFromDb(params: {
  name?: string
  muscleGroup?: string
  limit?: number
}): Promise<Exercise[]> {
  let query = supabase.from('exercises').select('*')

  if (params.name?.trim()) {
    query = query.ilike('name', `%${params.name.trim()}%`)
  }
  if (params.muscleGroup) {
    query = query.ilike('muscle_group', params.muscleGroup)
  }

  query = query.order('name', { ascending: true }).limit(params.limit ?? 40)

  const { data, error } = await query
  if (error) throw toServiceError(error)
  return (data as ExerciseRow[]).map(mapExercise)
}

/**
 * Count of non-custom (imported library) exercises, plus the timestamp of the
 * last import stored in localStorage.
 */
export function getLibraryStats(): { count: number | null; lastImported: string | null } {
  if (typeof window === 'undefined') return { count: null, lastImported: null }
  const raw = localStorage.getItem('kinetic-library-stats')
  if (!raw) return { count: null, lastImported: null }
  try {
    return JSON.parse(raw) as { count: number; lastImported: string }
  } catch {
    return { count: null, lastImported: null }
  }
}

export function saveLibraryStats(count: number): void {
  localStorage.setItem(
    'kinetic-library-stats',
    JSON.stringify({ count, lastImported: new Date().toISOString() }),
  )
}

/** Count all standard (non-custom) exercises in the DB. */
export async function countLibraryExercises(): Promise<number> {
  const { count, error } = await supabase
    .from('exercises')
    .select('*', { count: 'exact', head: true })
    .eq('is_custom', false)

  if (error) throw toServiceError(error)
  return count ?? 0
}

/** Returns only the current user's custom exercises. */
export async function getUserCustomExercises(userId: string): Promise<Exercise[]> {
  const { data, error } = await supabase
    .from('exercises')
    .select('*')
    .eq('is_custom', true)
    .eq('created_by', userId)
    .order('name', { ascending: true })

  if (error) throw toServiceError(error)
  return (data as ExerciseRow[]).map(mapExercise)
}

export type CreateExerciseInput = {
  name: string
  muscleGroup: string
  userId: string
  /** Primary equipment (matches library `equipment` column) */
  equipment?: string | null
  /** API-style: beginner | intermediate | expert */
  difficulty?: string | null
  /** API-style: strength, cardio, etc. */
  exerciseType?: string | null
  instructions?: string | null
}

export async function createExercise(input: CreateExerciseInput): Promise<Exercise> {
  const trimmedName = input.name.trim()
  if (!trimmedName) throw new Error('Exercise name is required')

  const { data, error } = await supabase
    .from('exercises')
    .insert({
      name: trimmedName,
      muscle_group: input.muscleGroup.trim() || 'Other',
      is_custom: true,
      equipment: input.equipment?.trim() || null,
      difficulty: input.difficulty?.trim() || null,
      exercise_type: input.exerciseType?.trim() || null,
      instructions: input.instructions?.trim() || null,
      created_by: input.userId,
    })
    .select('*')
    .single()

  if (error) throw toServiceError(error)
  return mapExercise(data as ExerciseRow)
}

/**
 * Finds an existing exercise by name (case-insensitive) or creates a new
 * standard record. Used when adding an API / imported exercise to a workout.
 */
export async function findOrCreateExerciseByName(
  name: string,
  muscleGroup: string,
  equipment: string | null,
  userId: string,
): Promise<Exercise> {
  const trimmed = name.trim()

  const { data: existing } = await supabase
    .from('exercises')
    .select('*')
    .ilike('name', trimmed)
    .limit(1)
    .maybeSingle()

  if (existing) return mapExercise(existing as ExerciseRow)

  const { data, error } = await supabase
    .from('exercises')
    .insert({
      name: trimmed,
      muscle_group: muscleGroup,
      equipment: equipment ?? null,
      is_custom: false,
      created_by: userId,
    })
    .select('*')
    .single()

  if (error) throw toServiceError(error)
  return mapExercise(data as ExerciseRow)
}
