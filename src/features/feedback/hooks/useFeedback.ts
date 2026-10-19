import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  deleteFeedback,
  getFeedbackByDate,
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

// Feedback for any local date (YYYY-MM-DD) — used when editing a past day
export function useFeedbackForDate(date: string, enabled = true) {
  const userId = useUserId()
  return useQuery({
    queryKey: ['feedback', 'date', userId, date],
    queryFn: () => getFeedbackByDate(userId!, date),
    enabled: Boolean(userId) && enabled,
    staleTime: 1000 * 60 * 5,
  })
}

// Delete a day's check-in (soreness cascades)
export function useDeleteFeedback() {
  const userId = useUserId()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (date: string) => {
      if (!userId) throw new Error('Not authenticated')
      return deleteFeedback(userId, date)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['feedback'] })
      void queryClient.invalidateQueries({ queryKey: ['history'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
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
      sleepQuality: number | null
      painFlag: boolean
      soreness: SorenessEntry[]
      /** Local date to write (YYYY-MM-DD); defaults to today. */
      date?: string
      /** Existing feedback id for that date (speeds up the save). */
      existingId?: string | null
    }) => {
      if (!userId) throw new Error('Not authenticated')
      const { date, existingId, ...data } = payload
      return saveFeedback(userId, data, { date, existingId })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['feedback'] })
      void queryClient.invalidateQueries({ queryKey: ['history'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}
