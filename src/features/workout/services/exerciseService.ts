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
    category: row.category ?? null,
    searchTerms: row.search_terms ?? null,
    isHidden: Boolean(row.is_hidden),
    isCustom: row.is_custom,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }
}

export async function getAllExercises(): Promise<Exercise[]> {
  const { data, error } = await supabase
    .from('exercises')
    .select('*')
    .eq('is_hidden', false)
    .order('name', { ascending: true })

  if (error) throw toServiceError(error)
  return (data as ExerciseRow[]).map(mapExercise)
}

/** Shared catalogue plus the current user's custom rows (RLS), excluding hidden legacy rows. */
export async function getExerciseCatalog(): Promise<Exercise[]> {
  const { data, error } = await supabase
    .from('exercises')
    .select('*')
    .eq('is_hidden', false)
    .order('name')

  if (error) throw toServiceError(error)
  return (data as ExerciseRow[]).map(mapExercise)
}

/** Fetch specific exercises (e.g. the user's recents) preserving the given id order. */
export async function getExercisesByIds(ids: string[]): Promise<Exercise[]> {
  if (ids.length === 0) return []
  const { data, error } = await supabase.from('exercises').select('*').in('id', ids)
  if (error) throw toServiceError(error)
  const byId = new Map((data as ExerciseRow[]).map((r) => [r.id, r]))
  return ids.flatMap((id) => {
    const row = byId.get(id)
    return row ? [mapExercise(row)] : []
  })
}

export async function updateCustomExercise(
  id: string,
  input: { name: string; muscleGroup: string; category: string },
): Promise<Exercise> {
  const { data, error } = await supabase
    .from('exercises')
    .update({
      name: input.name.trim(),
      muscle_group: input.muscleGroup,
      category: input.category,
    })
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw toServiceError(error)
  return mapExercise(data as ExerciseRow)
}

/** Delete a custom exercise. If a logged workout still references it, hide it instead. */
export async function deleteCustomExercise(id: string): Promise<'deleted' | 'hidden'> {
  const { error } = await supabase.from('exercises').delete().eq('id', id)
  if (!error) return 'deleted'
  if (error.code === '23503') {
    const { error: hideError } = await supabase
      .from('exercises')
      .update({ is_hidden: true })
      .eq('id', id)
    if (hideError) throw toServiceError(hideError)
    return 'hidden'
  }
  throw toServiceError(error)
}

export type CreateExerciseInput = {
  name: string
  muscleGroup: string
  userId: string
  /** Primary equipment (matches library `equipment` column) */
  equipment?: string | null
  category?: string | null
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
      category: input.category ?? null,
      source: 'custom',
      equipment: input.equipment?.trim() || null,
      difficulty: input.difficulty?.trim() || null,
      exercise_type: input.exerciseType?.trim() || null,
      instructions: input.instructions?.trim() || null,
      created_by: input.userId,
    })
    .select('*')
    .single()

  if (error?.code === '23505') {
    const { data: existing, error: lookupError } = await supabase
      .from('exercises')
      .select('*')
      .eq('is_custom', true)
      .eq('created_by', input.userId)
      .ilike('name', trimmedName)
      .limit(1)
      .maybeSingle()

    if (lookupError) throw toServiceError(lookupError)
    if (existing) return mapExercise(existing as ExerciseRow)
  }

  if (error) throw toServiceError(error)
  return mapExercise(data as ExerciseRow)
}

/**
 * Finds a visible exercise by name (case-insensitive) or creates a private
 * custom row. Used by the Excel data import.
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
    .eq('is_hidden', false)
    .limit(1)
    .maybeSingle()

  if (existing) return mapExercise(existing as ExerciseRow)

  return createExercise({ name: trimmed, muscleGroup, userId, equipment })
}
