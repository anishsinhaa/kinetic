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
 * autoUpdate + skipWaiting/clientsClaim: a new deploy activates on first visit;
 * controllerchange reloads so the tab never keeps a removed hashed chunk.
 */
export function registerPwa() {
  let refreshing = false
  // Distinguish first install (no prior controller) from an update after deploy
  const hadControllerOnLoad =
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    Boolean(navigator.serviceWorker.controller)

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return
      // First-ever install: page already has current assets — no reload.
      // After deploy: old controller was present → reload onto the new precache.
      if (!hadControllerOnLoad) return
      refreshing = true
      window.location.reload()
    })
  }

  const updateSW = registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return
      // Immediate update check on this load (not only on next focus)
      void registration.update()
      const check = () => {
        void registration.update()
      }
      window.addEventListener('focus', check)
      window.setInterval(check, 60 * 60 * 1000)
    },
    onNeedRefresh() {
      // autoUpdate: tell waiting worker to activate; controllerchange reloads
      void updateSW(true)
    },
  })

  window.addEventListener('online', () => {
    void syncPending()
  })

  void syncPending()
}
