import { supabase } from '../../../lib/supabase/client'
import { toServiceError } from '../../../lib/supabase/errors'
import type { PushSubscriptionRow, UserSettingsRow } from '../../../lib/supabase/database.types'
import { DEFAULT_WORKOUT_TYPES } from '../../workout/constants'
import {
  defaultUserSettings,
  mapUserSettingsRow,
  type PushSubscriptionInput,
  type UserSettings,
  type UserSettingsUpdate,
} from '../types'

function toRowPatch(update: UserSettingsUpdate): Partial<UserSettingsRow> {
  const patch: Partial<UserSettingsRow> = {}
  if (update.workoutTypes !== undefined) patch.workout_types = update.workoutTypes
  if (update.reminderMorningWeightEnabled !== undefined) {
    patch.reminder_morning_weight_enabled = update.reminderMorningWeightEnabled
  }
  if (update.reminderMorningWeightTime !== undefined) {
    patch.reminder_morning_weight_time = update.reminderMorningWeightTime
  }
  if (update.reminderNightRecoveryEnabled !== undefined) {
    patch.reminder_night_recovery_enabled = update.reminderNightRecoveryEnabled
  }
  if (update.reminderNightRecoveryTime !== undefined) {
    patch.reminder_night_recovery_time = update.reminderNightRecoveryTime
  }
  if (update.reminderWorkoutEnabled !== undefined) {
    patch.reminder_workout_enabled = update.reminderWorkoutEnabled
  }
  if (update.reminderWorkoutTime !== undefined) {
    patch.reminder_workout_time = update.reminderWorkoutTime
  }
  if (update.reminderWorkoutDays !== undefined) {
    patch.reminder_workout_days = update.reminderWorkoutDays
  }
  if (update.restTimerSeconds !== undefined) patch.rest_timer_seconds = update.restTimerSeconds
  if (update.weightStep !== undefined) patch.weight_step = update.weightStep
  if (update.units !== undefined) patch.units = update.units
  return patch
}

/** Fetch settings for a user, creating a default row if none exists. */
export async function getUserSettings(userId: string): Promise<UserSettings> {
  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw toServiceError(error)

  if (data) {
    const row = data as UserSettingsRow
    const rawTypes = Array.isArray(row.workout_types) ? row.workout_types : null
    // Seed defaults when the stored list is missing/empty
    if (!rawTypes || rawTypes.length === 0) {
      const { data: seeded, error: seedError } = await supabase
        .from('user_settings')
        .update({ workout_types: [...DEFAULT_WORKOUT_TYPES] })
        .eq('user_id', userId)
        .select('*')
        .single()
      if (seedError) throw toServiceError(seedError)
      return mapUserSettingsRow(seeded as UserSettingsRow)
    }
    return mapUserSettingsRow(row)
  }

  const defaults = defaultUserSettings(userId)
  const { data: created, error: insertError } = await supabase
    .from('user_settings')
    .insert({
      user_id: userId,
      workout_types: defaults.workoutTypes,
      rest_timer_seconds: defaults.restTimerSeconds,
      weight_step: defaults.weightStep,
      units: defaults.units,
    })
    .select('*')
    .single()

  if (insertError) throw toServiceError(insertError)
  return mapUserSettingsRow(created as UserSettingsRow)
}

export async function updateUserSettings(
  userId: string,
  update: UserSettingsUpdate,
): Promise<UserSettings> {
  // Ensure a row exists first
  await getUserSettings(userId)

  const { data, error } = await supabase
    .from('user_settings')
    .update(toRowPatch(update))
    .eq('user_id', userId)
    .select('*')
    .single()

  if (error) throw toServiceError(error)
  return mapUserSettingsRow(data as UserSettingsRow)
}

export async function upsertPushSubscription(
  userId: string,
  input: PushSubscriptionInput,
): Promise<string> {
  const { data, error } = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        user_id: userId,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
        user_agent: input.userAgent ?? null,
      },
      { onConflict: 'user_id,endpoint' },
    )
    .select('id')
    .single()

  if (error) throw toServiceError(error)
  return (data as Pick<PushSubscriptionRow, 'id'>).id
}

export async function deletePushSubscription(
  userId: string,
  endpoint: string,
): Promise<void> {
  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('user_id', userId)
    .eq('endpoint', endpoint)

  if (error) throw toServiceError(error)
}

export async function listPushSubscriptions(
  userId: string,
): Promise<PushSubscriptionRow[]> {
  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw toServiceError(error)
  return (data ?? []) as PushSubscriptionRow[]
}
