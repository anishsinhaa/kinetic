/**
 * useDailyLog
 *
 * Wraps the dailyLogService in React Query.
 * Components call this hook — they never know about Supabase.
 *
 * Usage:
 *   const { log, isLoading, isSaving, save } = useDailyLog(userId)          // today
 *   const { log, save, remove } = useDailyLog(userId, '2026-10-18')        // any date
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  deleteDailyLog,
  getLogByDate,
  getTodayLog,
  isEmptyDailyLogPayload,
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
  /** The fetched log, or null if none exists for the date. */
  log: DailyLog | null | undefined
  isLoading: boolean
  isError: boolean
  error: Error | null
  /** True while the save (or delete) mutation is in flight. */
  isSaving: boolean
  /**
   * Insert/update the day's log. When every field is empty the row is deleted
   * instead of storing a blank one (resolves to null in that case).
   */
  save: (payload: DailyLogPayload) => Promise<DailyLog | null>
  /** Delete the day's log row. */
  remove: () => Promise<void>
}

export function useDailyLog(userId: string, date?: string): UseDailyLogReturn {
  const queryClient = useQueryClient()
  const isToday = !date || date === todayDateString()
  const targetDate = date ?? todayDateString()
  const queryKey = isToday ? dailyLogKeys.today(userId) : dailyLogKeys.byDate(userId, targetDate)

  // ── Query ──────────────────────────────────────────────────────────────────
  const {
    data: log,
    isLoading,
    isError,
    error,
  } = useQuery<DailyLog | null, Error>({
    queryKey,
    queryFn: () => (isToday ? getTodayLog(userId) : getLogByDate(userId, targetDate)),
    // Don't fetch if we don't have a real userId yet
    enabled: Boolean(userId),
    staleTime: 1000 * 60 * 5, // 5 min — data doesn't change very often
    gcTime: 1000 * 60 * 30, // Keep in cache for 30 min
    retry: 2,
  })

  // Everything that displays daily-log data must refresh after a write
  const invalidateRelated = () => {
    void queryClient.invalidateQueries({ queryKey: ['daily_logs', userId] })
    void queryClient.invalidateQueries({ queryKey: ['history', 'daily-logs', userId] })
    void queryClient.invalidateQueries({ queryKey: ['progress'] })
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }

  // ── Save mutation ──────────────────────────────────────────────────────────
  const mutation = useMutation<DailyLog | null, Error, DailyLogPayload>({
    mutationFn: async (payload) => {
      if (isEmptyDailyLogPayload(payload)) {
        await deleteDailyLog(userId, targetDate)
        return null
      }
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        const { enqueueOfflineOp } = await import('../../../lib/offline/syncQueue')
        enqueueOfflineOp({
          kind: 'upsert_daily_log',
          payload: {
            userId,
            date: targetDate,
            weight: payload.weight,
            calories: payload.calories,
            protein: payload.protein,
            sleep: payload.sleep,
            notes: payload.notes,
          },
        })
        const now = new Date().toISOString()
        return {
          id: 'offline',
          userId,
          date: targetDate,
          weight: payload.weight,
          calories: payload.calories,
          protein: payload.protein,
          sleep: payload.sleep,
          notes: payload.notes ?? '',
          createdAt: now,
          updatedAt: now,
        }
      }
      return upsertDailyLog(userId, payload, targetDate)
    },

    // Optimistic update: immediately put the form data in the cache so
    // the UI doesn't flicker, then replace with the real server response.
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey })

      const previous = queryClient.getQueryData<DailyLog | null>(queryKey)

      queryClient.setQueryData<DailyLog | null>(queryKey, (old) => {
        if (isEmptyDailyLogPayload(payload)) return null
        const now = new Date().toISOString()
        if (old) {
          return { ...old, ...payload, updatedAt: now }
        }
        const base: Omit<DailyLog, keyof typeof payload> = {
          id: 'optimistic',
          userId,
          date: targetDate,
          createdAt: now,
          updatedAt: now,
        }
        return { ...base, ...payload } as DailyLog
      })

      return { previous }
    },

    // On server success, replace optimistic data with the real row
    onSuccess: (savedLog) => {
      queryClient.setQueryData<DailyLog | null>(queryKey, savedLog)
      invalidateRelated()
    },

    // On error, roll back to the previous cache state
    onError: (_err, _payload, context) => {
      const ctx = context as { previous: DailyLog | null | undefined } | undefined
      if (ctx?.previous !== undefined) {
        queryClient.setQueryData(queryKey, ctx.previous)
      }
    },
  })

  // ── Delete mutation ────────────────────────────────────────────────────────
  const removeMutation = useMutation<void, Error, void>({
    mutationFn: () => deleteDailyLog(userId, targetDate),
    onSuccess: () => {
      queryClient.setQueryData<DailyLog | null>(queryKey, null)
      invalidateRelated()
    },
  })

  const save = (payload: DailyLogPayload): Promise<DailyLog | null> =>
    mutation.mutateAsync(payload)
  const remove = (): Promise<void> => removeMutation.mutateAsync()

  // Surface whichever error happened — fetch error takes priority over save error
  const activeError = error ?? mutation.error ?? removeMutation.error ?? null
  const hasError = isError || mutation.isError || removeMutation.isError

  return {
    log,
    isLoading,
    isError: hasError,
    error: activeError,
    isSaving: mutation.isPending || removeMutation.isPending,
    save,
    remove,
  }
}
