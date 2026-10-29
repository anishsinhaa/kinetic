import { useQuery } from '@tanstack/react-query'
import { useCurrentUser } from '../../auth/useAuth'
import { localDateString } from '../../../lib/localDate'
import { getMonthOverview } from '../services/calendarService'

/** `month` is 0–11, matching `Date#getMonth`. */
export function useMonthOverview(year: number, month: number) {
  const { user } = useCurrentUser()
  const userId = user?.id ?? ''
  const from = localDateString(new Date(year, month, 1))
  const to = localDateString(new Date(year, month + 1, 0))
  return useQuery({
    queryKey: ['progress', 'calendar', userId, from],
    queryFn: () => getMonthOverview(userId, from, to),
    enabled: Boolean(userId),
  })
}
