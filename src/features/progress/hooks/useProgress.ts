import { useDailyLogs, useExerciseHistory } from '../../history/hooks/useHistory'
import { useMemo } from 'react'
import {
  exerciseTimeSeries,
  exercisePrTimeline,
  bodyWeightSeries,
  weeklyVolumeSeries,
  allTimePrList,
} from '../lib/progressAggregators'

/**
 * @param selectedExerciseId — user pick, or null to default to the first exercise
 */
export function useProgressData(selectedExerciseId: string | null) {
  const { data: histories = [], isLoading: histLoading } = useExerciseHistory()
  const { data: dailyLogs = [], isLoading: logsLoading } = useDailyLogs()

  const weightSeries = useMemo(() => bodyWeightSeries(dailyLogs), [dailyLogs])
  const weeklyVolume = useMemo(() => weeklyVolumeSeries(histories), [histories])
  const prList = useMemo(() => allTimePrList(histories), [histories])

  const resolvedId = selectedExerciseId ?? histories[0]?.exerciseId ?? null

  const selectedHistory = useMemo(
    () => histories.find((h) => h.exerciseId === resolvedId) ?? null,
    [histories, resolvedId],
  )
  const exerciseSeries = useMemo(
    () => (selectedHistory ? exerciseTimeSeries(selectedHistory.sessions) : []),
    [selectedHistory],
  )
  const prTimeline = useMemo(
    () => (selectedHistory ? exercisePrTimeline(selectedHistory.sessions) : []),
    [selectedHistory],
  )

  return {
    histories,
    isLoading: histLoading || logsLoading,
    weightSeries,
    weeklyVolume,
    prList,
    selectedExerciseId: resolvedId,
    selectedHistory,
    exerciseSeries,
    prTimeline,
  }
}
