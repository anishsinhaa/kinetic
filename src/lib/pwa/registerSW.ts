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

export function registerPwa() {
  registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (registration) {
        // Periodic update check
        window.setInterval(() => {
          void registration.update()
        }, 60 * 60 * 1000)
      }
    },
  })

  window.addEventListener('online', () => {
    void syncPending()
  })

  void syncPending()
}
