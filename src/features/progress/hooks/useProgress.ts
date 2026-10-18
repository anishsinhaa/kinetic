import { useDailyLogs, useExerciseHistory } from '../../history/hooks/useHistory'
import { useMemo } from 'react'
import {
  exerciseTimeSeries,
  exercisePrTimeline,
  bodyWeightSeries,
  weeklyVolumeSeries,
  allTimePrList,
} from '../lib/progressAggregators'

export function useProgressData(selectedExerciseId: string | null) {
  const { data: histories = [], isLoading: histLoading } = useExerciseHistory()
  const { data: dailyLogs = [], isLoading: logsLoading } = useDailyLogs()

  const weightSeries = useMemo(() => bodyWeightSeries(dailyLogs), [dailyLogs])
  const weeklyVolume = useMemo(() => weeklyVolumeSeries(histories), [histories])
  const prList = useMemo(() => allTimePrList(histories), [histories])

  const selectedHistory = useMemo(
    () => histories.find((h) => h.exerciseId === selectedExerciseId) ?? null,
    [histories, selectedExerciseId],
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
    selectedHistory,
    exerciseSeries,
    prTimeline,
  }
}
