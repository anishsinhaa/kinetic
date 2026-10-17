import type { UserSettingsRow, WeightUnits } from '../../lib/supabase/database.types'
import { DEFAULT_WORKOUT_TYPES } from '../workout/constants'

export type { WeightUnits }

export interface UserSettings {
  userId: string
  workoutTypes: string[]
  reminderMorningWeightEnabled: boolean
  reminderMorningWeightTime: string | null
  reminderNightRecoveryEnabled: boolean
  reminderNightRecoveryTime: string | null
  reminderWorkoutEnabled: boolean
  reminderWorkoutTime: string | null
  reminderWorkoutDays: number[]
  restTimerSeconds: number
  weightStep: number
  units: WeightUnits
  createdAt: string
  updatedAt: string
}

export type UserSettingsUpdate = Partial<
  Omit<UserSettings, 'userId' | 'createdAt' | 'updatedAt'>
>

export interface PushSubscriptionInput {
  endpoint: string
  p256dh: string
  auth: string
  userAgent?: string | null
}

export function defaultUserSettings(userId: string): UserSettings {
  const now = new Date().toISOString()
  return {
    userId,
    workoutTypes: [...DEFAULT_WORKOUT_TYPES],
    reminderMorningWeightEnabled: false,
    reminderMorningWeightTime: null,
    reminderNightRecoveryEnabled: false,
    reminderNightRecoveryTime: null,
    reminderWorkoutEnabled: false,
    reminderWorkoutTime: null,
    reminderWorkoutDays: [],
    restTimerSeconds: 90,
    weightStep: 2.5,
    units: 'kg',
    createdAt: now,
    updatedAt: now,
  }
}

export function mapUserSettingsRow(row: UserSettingsRow): UserSettings {
  const types = Array.isArray(row.workout_types)
    ? row.workout_types.filter((t): t is string => typeof t === 'string')
    : [...DEFAULT_WORKOUT_TYPES]

  return {
    userId: row.user_id,
    workoutTypes: types.length > 0 ? types : [...DEFAULT_WORKOUT_TYPES],
    reminderMorningWeightEnabled: row.reminder_morning_weight_enabled,
    reminderMorningWeightTime: row.reminder_morning_weight_time,
    reminderNightRecoveryEnabled: row.reminder_night_recovery_enabled,
    reminderNightRecoveryTime: row.reminder_night_recovery_time,
    reminderWorkoutEnabled: row.reminder_workout_enabled,
    reminderWorkoutTime: row.reminder_workout_time,
    reminderWorkoutDays: row.reminder_workout_days ?? [],
    restTimerSeconds: row.rest_timer_seconds,
    weightStep: Number(row.weight_step),
    units: row.units,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
