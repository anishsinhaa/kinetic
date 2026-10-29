import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCurrentUser } from '../../auth/useAuth'
import { listRestDays, markRestDay, restDayKeys, unmarkRestDay } from '../services/restDayService'

export function useRestDays(range?: { from?: string; to?: string }) {
  const { user } = useCurrentUser()
  const userId = user?.id ?? ''
  const query = useQuery({
    queryKey: restDayKeys.range(userId, range?.from, range?.to),
    queryFn: () => listRestDays(userId, range),
    enabled: Boolean(userId),
  })
  const dates = useMemo(() => new Set(query.data ?? []), [query.data])
  return { ...query, dates }
}

/** Whether one local calendar day is marked, plus an optimistic toggle. */
export function useRestDay(date: string) {
  const { user } = useCurrentUser()
  const userId = user?.id ?? ''
  const queryClient = useQueryClient()
  const { dates, isLoading } = useRestDays()
  const isRestDay = dates.has(date)

  const mutation = useMutation({
    mutationFn: async (next: boolean) => {
      if (!userId) return
      if (next) await markRestDay(userId, date)
      else await unmarkRestDay(userId, date)
    },
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: restDayKeys.all(userId) })
      const snapshots = queryClient.getQueriesData<string[]>({ queryKey: restDayKeys.all(userId) })
      queryClient.setQueriesData<string[]>({ queryKey: restDayKeys.all(userId) }, (old) => {
        const nextDates = new Set(old ?? [])
        if (next) nextDates.add(date)
        else nextDates.delete(date)
        return [...nextDates].sort()
      })
      return { snapshots }
    },
    onError: (err, _next, ctx) => {
      console.warn('[rest-days]', err)
      for (const [key, data] of ctx?.snapshots ?? []) {
        queryClient.setQueryData(key, data)
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: restDayKeys.all(userId) })
      void queryClient.invalidateQueries({ queryKey: ['dashboard', 'stats', userId] })
      void queryClient.invalidateQueries({ queryKey: ['progress', 'calendar', userId] })
    },
  })

  return {
    isRestDay,
    isLoading,
    toggle: () => {
      if (userId) mutation.mutate(!isRestDay)
    },
    isSaving: mutation.isPending,
  }
}
