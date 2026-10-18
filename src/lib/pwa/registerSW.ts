import { registerSW } from 'virtual:pwa-register'
import { flushOfflineQueue, isOnline } from '../offline/syncQueue'
import { upsertSet } from '../../features/workout/services/workoutService'
import { upsertDailyLog } from '../../features/dailyLog/services/dailyLogService'

async function syncPending() {
  if (!isOnline()) return
  await flushOfflineQueue({
    upsertSet: async (op) => {
      await upsertSet(op.payload.setId, op.payload.workoutExerciseId, {
        reps: op.payload.reps,
        weight: op.payload.weight,
        to_failure: op.payload.to_failure,
        set_index: op.payload.set_index,
        completed_at: op.payload.completed_at,
      })
    },
    upsertDailyLog: async (op) => {
      await upsertDailyLog(
        op.payload.userId,
        {
          weight: op.payload.weight,
          calories: op.payload.calories,
          protein: op.payload.protein,
          sleep: op.payload.sleep,
          notes: op.payload.notes ?? '',
        },
        op.payload.date,
      )
    },
  })
}

/**
 * Register the PWA service worker.
 * registerType: autoUpdate + skipWaiting/clientsClaim in sw.ts means a new
 * deploy activates immediately; we reload once so tabs never keep a removed chunk.
 */
export function registerPwa() {
  let refreshing = false

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return
      refreshing = true
      window.location.reload()
    })
  }

  registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return
      // Check for updates on focus + hourly
      const check = () => {
        void registration.update()
      }
      window.addEventListener('focus', check)
      window.setInterval(check, 60 * 60 * 1000)
    },
    onNeedRefresh() {
      // autoUpdate already calls skipWaiting; controllerchange reloads the page
    },
  })

  window.addEventListener('online', () => {
    void syncPending()
  })

  void syncPending()
}
