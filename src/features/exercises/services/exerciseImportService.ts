/**
 * One-time bulk import of the API Ninjas exercise library into Supabase.
 *
 * Free-tier constraint: `offset` is premium-only, so each call returns at most
 * 5 results. To maximise coverage we iterate every (muscle × type) combination.
 *
 *   16 muscles × 7 types = 112 API calls → ~400–500 unique exercises
 *
 * That is well within the 3 000 calls/month free quota even after several runs.
 * After import all browsing/searching hits Supabase directly — 0 API calls.
 */

import { supabase } from '../../../lib/supabase/client'
import { searchExercises, formatMuscle } from './exercisesApiService'
import { saveLibraryStats } from '../../workout/services/exerciseService'

const ALL_MUSCLES = [
  'abdominals',
  'abductors',
  'adductors',
  'biceps',
  'calves',
  'chest',
  'forearms',
  'glutes',
  'hamstrings',
  'lats',
  'lower_back',
  'middle_back',
  'neck',
  'quadriceps',
  'traps',
  'triceps',
] as const

// All exercise types supported by the API
const ALL_TYPES = [
  'cardio',
  'olympic_weightlifting',
  'plyometrics',
  'powerlifting',
  'strength',
  'stretching',
  'strongman',
] as const

export type ImportProgress = {
  stage: 'running' | 'done' | 'error'
  currentLabel: string   // e.g. "Biceps · strength"
  completedSteps: number
  totalSteps: number
  importedSoFar: number
  error?: string
}

const TOTAL_STEPS = ALL_MUSCLES.length * ALL_TYPES.length // 112

/**
 * Imports exercises for every (muscle × type) combination and upserts them
 * into the local `exercises` table.  Safe to re-run — duplicates are ignored.
 *
 * @param userId      Authenticated user id (required by RLS INSERT policy)
 * @param onProgress  UI callback, called after every API request
 */
export async function importExerciseLibrary(
  userId: string,
  onProgress: (p: ImportProgress) => void,
): Promise<number> {
  let totalImported = 0
  let completedSteps = 0

  for (const muscle of ALL_MUSCLES) {
    for (const type of ALL_TYPES) {
      completedSteps++

      onProgress({
        stage: 'running',
        currentLabel: `${formatMuscle(muscle)} · ${type}`,
        completedSteps,
        totalSteps: TOTAL_STEPS,
        importedSoFar: totalImported,
      })

      let results
      try {
        results = await searchExercises({ muscle, type })
      } catch (err) {
        // Non-fatal — log and move on to the next combination
        console.warn(`Import: skipped muscle=${muscle} type=${type}`, err)
        await new Promise((r) => setTimeout(r, 80))
        continue
      }

      if (!results || results.length === 0) {
        await new Promise((r) => setTimeout(r, 60))
        continue
      }

      const rows = results.map((ex) => ({
        name: ex.name,
        muscle_group: formatMuscle(ex.muscle),
        equipment: ex.equipments?.filter((e) => e !== '...')[0] ?? null,
        difficulty: ex.difficulty || null,
        exercise_type: ex.type || null,
        instructions: ex.instructions || null,
        is_custom: false,
        created_by: userId,
      }))

      const { data: inserted, error: upsertError } = await supabase
        .from('exercises')
        .upsert(rows, { onConflict: 'name', ignoreDuplicates: true })
        .select('id')

      if (upsertError) {
        console.warn(`Import: upsert error muscle=${muscle} type=${type}`, upsertError)
      } else {
        // Only count rows that were actually inserted (not skipped duplicates)
        totalImported += inserted?.length ?? 0
      }

      // Courtesy delay — keeps us well below API rate limits
      await new Promise((r) => setTimeout(r, 80))
    }
  }

  saveLibraryStats(totalImported)

  onProgress({
    stage: 'done',
    currentLabel: '',
    completedSteps: TOTAL_STEPS,
    totalSteps: TOTAL_STEPS,
    importedSoFar: totalImported,
  })

  return totalImported
}
