import { useQuery } from '@tanstack/react-query'
import { getDailyLogs, getExerciseHistory } from '../services/historyService'
import { useAppStore } from '../../../store/useAppStore'

function useUserId(): string | null {
  return useAppStore((s) => s.user?.id ?? null)
}

export function useDailyLogs() {
  const userId = useUserId()
  return useQuery({
    queryKey: ['history', 'daily-logs', userId],
    queryFn: () => getDailyLogs(userId!),
    enabled: Boolean(userId),
    staleTime: 1000 * 60 * 5,
  })
}

export function useExerciseHistory() {
  const userId = useUserId()
  return useQuery({
    queryKey: ['history', 'exercise-history', userId],
    queryFn: () => getExerciseHistory(userId!),
    enabled: Boolean(userId),
    staleTime: 1000 * 60 * 5,
  })
}
