import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getUserSettings } from '../../settings/services/settingsService'
import { suggestNextType } from '../lib/suggestNextType'
import { resolveWorkoutTypes } from '../lib/workoutTypes'
import { getRecentWorkoutTypes } from '../services/workoutService'

/** Shared suggestion for Home and the Workout tab. Same query keys as before. */
export function useSuggestedType(userId: string, availableTypes?: string[]) {
  const recentTypesQuery = useQuery({
    queryKey: ['workout', 'recent-types', userId],
    queryFn: () => getRecentWorkoutTypes(userId),
  })

  const settingsQuery = useQuery({
    queryKey: ['user-settings', userId],
    queryFn: () => getUserSettings(userId),
    staleTime: 5 * 60 * 1000,
  })
  const settings = settingsQuery.data

  const typeChips = useMemo(
    () => availableTypes ?? resolveWorkoutTypes(settings?.workoutTypes),
    [availableTypes, settings?.workoutTypes],
  )

  const suggestedType = useMemo(
    () =>
      suggestNextType(recentTypesQuery.data ?? [], typeChips, settings?.split) ??
      typeChips[0] ??
      '',
    [recentTypesQuery.data, typeChips, settings?.split],
  )

  const suggestionsReady =
    (settingsQuery.isSuccess || settingsQuery.isError) &&
    (recentTypesQuery.isSuccess || recentTypesQuery.isError)

  return { typeChips, suggestedType, suggestionsReady, settings }
}
