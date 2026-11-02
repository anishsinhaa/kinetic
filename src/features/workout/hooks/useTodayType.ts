import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { localDateString } from '../../../lib/localDate'
import {
  clearTodayType,
  readTodayTypeRaw,
  resolveTodayType,
  subscribeTodayType,
  writeTodayType,
} from '../lib/todayType'

export function useTodayType(userId: string, typeChips: string[]) {
  const date = localDateString()
  const raw = useSyncExternalStore(
    subscribeTodayType,
    () => readTodayTypeRaw(userId, date),
    () => null,
  )
  const override = useMemo(() => resolveTodayType(raw, typeChips), [raw, typeChips])
  const setOverride = useCallback(
    (type: string) => writeTodayType(userId, date, type),
    [userId, date],
  )
  const clearOverride = useCallback(() => clearTodayType(userId, date), [userId, date])
  return { override, setOverride, clearOverride }
}
