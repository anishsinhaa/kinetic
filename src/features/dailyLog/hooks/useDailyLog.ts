/**
 * useDailyLog
 *
 * Wraps the dailyLogService in React Query.
 * Components call this hook — they never know about Supabase.
 *
 * Usage:
 *   const { log, isLoading, isSaving, save } = useDailyLog(userId)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getTodayLog,
  upsertDailyLog,
  todayDateString,
} from '../services/dailyLogService'
import type { DailyLog, DailyLogPayload } from '../types'

// Stable query key factory — centralises cache key strings
export const dailyLogKeys = {
  all: ['daily_logs'] as const,
  today: (userId: string) => ['daily_logs', userId, 'today', todayDateString()] as const,
  byDate: (userId: string, date: string) => ['daily_logs', userId, date] as const,
}

// ─────────────────────────────────────────────────────────────────────────────

interface UseDailyLogReturn {
  /** The fetched log, or null if none exists for today. */
  log: DailyLog | null | undefined
  isLoading: boolean
  isError: boolean
  error: Error | null
  /** True while the upsert mutation is in flight. */
  isSaving: boolean
  /** Call with the current form payload; handles insert + update. */
  save: (payload: DailyLogPayload) => Promise<DailyLog>
}

export function useDailyLog(userId: string): UseDailyLogReturn {
  const queryClient = useQueryClient()
  const queryKey = dailyLogKeys.today(userId)

  // ── Query ──────────────────────────────────────────────────────────────────
  const {
    data: log,
    isLoading,
    isError,
    error,
  } = useQuery<DailyLog | null, Error>({
    queryKey,
    queryFn: () => getTodayLog(userId),
    // Don't fetch if we don't have a real userId yet
    enabled: Boolean(userId),
    staleTime: 1000 * 60 * 5,    // 5 min — data doesn't change very often
    gcTime: 1000 * 60 * 30,      // Keep in cache for 30 min
    retry: 2,
  })

  // ── Mutation ───────────────────────────────────────────────────────────────
  const mutation = useMutation<DailyLog, Error, DailyLogPayload>({
    mutationFn: (payload) => upsertDailyLog(userId, payload),

    // Optimistic update: immediately put the form data in the cache so
    // the UI doesn't flicker, then replace with the real server response.
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey })

      const previous = queryClient.getQueryData<DailyLog | null>(queryKey)

      queryClient.setQueryData<DailyLog | null>(queryKey, (old) => {
        const now = new Date().toISOString()
        if (old) {
          return { ...old, ...payload, updatedAt: now }
        }
        const base: Omit<DailyLog, keyof typeof payload> = {
          id: 'optimistic',
          userId,
          date: todayDateString(),
          createdAt: now,
          updatedAt: now,
        }
        return { ...base, ...payload } as DailyLog
      })

      return { previous }
    },

    // On server success, replace optimistic data with real row
    // and invalidate the History page cache so it reflects the update immediately.
    onSuccess: (savedLog) => {
      queryClient.setQueryData<DailyLog | null>(queryKey, savedLog)
      void queryClient.invalidateQueries({ queryKey: ['history', 'daily-logs', userId] })
    },

    // On error, roll back to the previous cache state
    onError: (_err, _payload, context) => {
      const ctx = context as { previous: DailyLog | null | undefined } | undefined
      if (ctx?.previous !== undefined) {
        queryClient.setQueryData(queryKey, ctx.previous)
      }
    },
  })

  const save = (payload: DailyLogPayload): Promise<DailyLog> =>
    mutation.mutateAsync(payload)

  // Surface whichever error happened — fetch error takes priority over save error
  const activeError = error ?? mutation.error ?? null
  const hasError = isError || mutation.isError

  return {
    log,
    isLoading,
    isError: hasError,
    error: activeError,
    isSaving: mutation.isPending,
    save,
  }
}
