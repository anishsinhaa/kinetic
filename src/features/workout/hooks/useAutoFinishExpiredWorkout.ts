import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useToast } from '../../../components/ui/toastContext'
import { peekOfflineQueue } from '../../../lib/offline/syncQueue'
import { AUTO_FINISH_AFTER_MS, AUTO_FINISH_HOURS, isPastAutoFinishLimit } from '../lib/autoFinish'
import { cancelPendingSetWrites, flushPendingSetWrites } from '../lib/setWriteRegistry'
import { getWorkoutStatus, resolveExpiredWorkout } from '../services/workoutService'
import { useWorkoutStore } from '../store/useWorkoutStore'
import { useWorkoutStoreHydrated } from './useWorkoutStoreHydrated'

let inFlight = false
const handledIds = new Set<string>()

function invalidateAfterAutoFinish(
  queryClient: ReturnType<typeof useQueryClient>,
  userId: string,
  workoutId: string,
  exerciseIds: string[],
) {
  void queryClient.invalidateQueries({
    queryKey: ['dashboard', 'stats', userId],
    refetchType: 'all',
  })
  void queryClient.invalidateQueries({
    queryKey: ['workout', 'latest-completed', userId],
    refetchType: 'all',
  })
  void queryClient.invalidateQueries({
    queryKey: ['workout', 'recent-list', userId],
    refetchType: 'all',
  })
  void queryClient.invalidateQueries({ queryKey: ['workout', 'recent-types', userId] })
  void queryClient.invalidateQueries({ queryKey: ['exercises', 'recent-ids', userId] })
  void queryClient.invalidateQueries({ queryKey: ['history'], refetchType: 'all' })
  void queryClient.invalidateQueries({ queryKey: ['progress'], refetchType: 'all' })
  for (const exerciseId of exerciseIds) {
    void queryClient.invalidateQueries({
      queryKey: ['exercise-prefill', userId, exerciseId],
      refetchType: 'all',
    })
  }
  void queryClient.invalidateQueries({ queryKey: ['workout', 'status', workoutId] })
}

export function useAutoFinishExpiredWorkout(userId: string | undefined) {
  const hydrated = useWorkoutStoreHydrated()
  const queryClient = useQueryClient()
  const toast = useToast()
  const pathname = useLocation().pathname
  const checkRef = useRef<() => Promise<void>>(async () => {})

  checkRef.current = async () => {
    if (!userId || !hydrated) return
    if (typeof navigator !== 'undefined' && !navigator.onLine) return
    if (inFlight) return

    const state = useWorkoutStore.getState()
    const id = state.currentWorkoutId
    if (!id || state.phase === 'summary' || handledIds.has(id)) return
    if (state.workoutStartedAt != null && !isPastAutoFinishLimit(state.workoutStartedAt, null)) return

    inFlight = true
    try {
      let status: { id: string; endedAt: string | null } | null
      try {
        status = await getWorkoutStatus(id)
      } catch {
        return
      }
      if (!status || status.endedAt) return

      await flushPendingSetWrites()
      if (peekOfflineQueue().some((op) => op.kind === 'upsert_set')) return

      const fresh = useWorkoutStore.getState()
      if (fresh.currentWorkoutId !== id || fresh.phase === 'summary') return

      const label = fresh.workoutLabel.trim()
      const exerciseIds = fresh.exercises.map((exercise) => exercise.exerciseId)
      const requiredSetIds = fresh.exercises.flatMap((exercise) =>
        exercise.sets.filter((set) => set.completed).map((set) => set.id),
      )
      const meta = {
        feel: fresh.feel,
        note: fresh.note.trim() || null,
        warmup_started_at: fresh.warmupStartedAt,
        warmup_ended_at: fresh.warmupEndedAt,
        warmup_note: fresh.warmupNote.trim() || null,
      }

      let result: Awaited<ReturnType<typeof resolveExpiredWorkout>>
      try {
        result = await resolveExpiredWorkout(userId, id, {
          limitMs: AUTO_FINISH_AFTER_MS,
          requiredSetIds,
          meta,
        })
      } catch (err) {
        console.warn('[auto-finish]', err)
        return
      }

      if (result.kind === 'skipped') return

      handledIds.add(id)
      cancelPendingSetWrites()
      if (useWorkoutStore.getState().currentWorkoutId === id) {
        useWorkoutStore.getState().finishWorkout()
      }
      invalidateAfterAutoFinish(queryClient, userId, id, exerciseIds)

      if (result.kind === 'finished') {
        const n = result.setCount
        const sets = `${n} set${n === 1 ? '' : 's'} saved`
        const message = label
          ? `Your ${label} workout was auto-finished after ${AUTO_FINISH_HOURS} hours — ${sets}`
          : `Your workout was auto-finished after ${AUTO_FINISH_HOURS} hours — ${sets}`
        toast.show(message, { durationMs: 10000 })
      } else {
        toast.show(
          `An empty workout open for ${AUTO_FINISH_HOURS} hours was discarded`,
          { durationMs: 10000 },
        )
      }
    } finally {
      inFlight = false
    }
  }

  useEffect(() => {
    const run = () => {
      void checkRef.current()
    }
    run()
    const onVisible = () => {
      if (document.visibilityState === 'visible') run()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', run)
    const interval = window.setInterval(run, 60_000)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', run)
      window.clearInterval(interval)
    }
  }, [hydrated, userId, pathname])
}
