import { useQuery } from '@tanstack/react-query'
import { getUserSettings } from '../services/settingsService'
import { useAppStore } from '../../../store/useAppStore'
import type { WeightUnits } from '../../../lib/supabase/database.types'

export function useWeightUnits(): WeightUnits {
  const userId = useAppStore((s) => s.user?.id ?? null)
  const { data } = useQuery({
    queryKey: ['user-settings', userId],
    queryFn: () => getUserSettings(userId!),
    enabled: Boolean(userId),
    staleTime: 1000 * 60 * 5,
  })
  return data?.units ?? 'kg'
}
