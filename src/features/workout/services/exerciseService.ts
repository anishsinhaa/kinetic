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

/**
 * Search exercises stored in Supabase (the local library).
 * Zero API calls — all data is local after import.
 */
export async function searchExercisesFromDb(params: {
  name?: string
  muscleGroup?: string
  limit?: number
}): Promise<Exercise[]> {
  const run = async (matchSearchTerms: boolean) => {
    let query = supabase.from('exercises').select('*').eq('is_hidden', false)

    const q = escapeFilterValue(params.name ?? '')
    if (q) {
      query = matchSearchTerms
        ? query.or(`name.ilike.%${q}%,search_terms.ilike.%${q}%`)
        : query.ilike('name', `%${q}%`)
    }
    if (params.muscleGroup) {
      query = query.ilike('muscle_group', params.muscleGroup)
    }

    return query.order('name', { ascending: true }).limit(params.limit ?? 40)
  }

  let { data, error } = await run(true)
  // search_terms is added by a migration — fall back to name-only until it exists
  if (error && /search_terms|column|schema cache/i.test(error.message ?? '')) {
    ;({ data, error } = await run(false))
  }
  if (error) throw toServiceError(error)
  return (data as ExerciseRow[]).map(mapExercise)
}

/**
 * Make free text safe inside a PostgREST `or()` filter: commas and parentheses
 * are filter syntax, `%` / `\` are LIKE metacharacters.
 */
export function escapeFilterValue(raw: string): string {
  return raw.replace(/[,()%\\]/g, ' ').replace(/\s+/g, ' ').trim()
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
