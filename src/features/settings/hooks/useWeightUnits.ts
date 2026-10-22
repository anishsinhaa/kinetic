import { useQuery } from '@tanstack/react-query'
import { getUserSettings } from '../services/settingsService'
import { useAppStore } from '../../../store/useAppStore'
import type { WeightUnits } from '../../../lib/supabase/database.types'

export function useWeightUnits(): WeightUnits {
  return useWeightDisplay().units
}

/** Units plus the weight step (display units). `ready` is false until settings load. */
export function useWeightDisplay(): { units: WeightUnits; step: number; ready: boolean } {
  const userId = useAppStore((s) => s.user?.id ?? null)
  const { data } = useQuery({
    queryKey: ['user-settings', userId],
    queryFn: () => getUserSettings(userId!),
    enabled: Boolean(userId),
    staleTime: 1000 * 60 * 5,
  })
  return {
    units: data?.units ?? 'kg',
    step: data?.weightStep && data.weightStep > 0 ? data.weightStep : 2.5,
    ready: data != null,
  }
}
