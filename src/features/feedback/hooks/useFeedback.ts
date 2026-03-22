import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getTodayFeedback,
  getFeedbackHistory,
  saveFeedback,
} from '../services/feedbackService'
import { useAppStore } from '../../../store/useAppStore'
import type { SorenessEntry } from '../types'

function useUserId(): string | null {
  return useAppStore((s) => s.user?.id ?? null)
}

// Today's feedback (with soreness)
export function useTodayFeedback() {
  const userId = useUserId()
  return useQuery({
    queryKey: ['feedback', 'today', userId],
    queryFn: () => getTodayFeedback(userId!),
    enabled: Boolean(userId),
    staleTime: 1000 * 60 * 5,
  })
}

// Feedback history for trend display
export function useFeedbackHistory() {
  const userId = useUserId()
  return useQuery({
    queryKey: ['feedback', 'history', userId],
    queryFn: () => getFeedbackHistory(userId!),
    enabled: Boolean(userId),
    staleTime: 1000 * 60 * 5,
  })
}

// Save (upsert) feedback + soreness in one call
export function useSaveFeedback() {
  const userId = useUserId()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: {
      fatigue: number
      sleepQuality: number
      painFlag: boolean
      soreness: SorenessEntry[]
    }) => {
      if (!userId) throw new Error('Not authenticated')
      return saveFeedback(userId, payload)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['feedback', 'today', userId] })
      void queryClient.invalidateQueries({ queryKey: ['feedback', 'history', userId] })
    },
  })
}
