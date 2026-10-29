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
import { detectBrowserTimezone } from '../lib/reminderTimezone'

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
  if (update.restTimerEnabled !== undefined) patch.rest_timer_enabled = update.restTimerEnabled
  if (update.weightStep !== undefined) patch.weight_step = update.weightStep
  if (update.units !== undefined) patch.units = update.units
  if (update.timezone !== undefined) patch.timezone = update.timezone
  if (update.split !== undefined) patch.split = update.split
  return patch
}

/** Persist browser IANA zone when DB value is missing or still the UTC default. */
async function ensureBrowserTimezone(row: UserSettingsRow): Promise<UserSettingsRow> {
  const browserTz = detectBrowserTimezone()
  const stored = (row.timezone ?? '').trim()

  if (stored && stored !== 'UTC') {
    return { ...row, timezone: stored }
  }

  // Missing or UTC — write browser timezone (even if that is also UTC, persist explicitly)
  const nextTz = browserTz || 'UTC'
  const { error } = await supabase
    .from('user_settings')
    .update({ timezone: nextTz })
    .eq('user_id', row.user_id)

  if (error) {
    console.warn('[user_settings] failed to persist timezone', error.message, {
      userId: row.user_id,
      nextTz,
    })
    // Column may not be migrated yet — still surface browser zone in the app
    return { ...row, timezone: nextTz }
  }

  return { ...row, timezone: nextTz }
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
    let row = data as UserSettingsRow
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
      row = seeded as UserSettingsRow
    }
    row = await ensureBrowserTimezone(row)
    return mapUserSettingsRow(row)
  }

  const defaults = defaultUserSettings(userId)
  const withTz = await supabase
    .from('user_settings')
    .insert({
      user_id: userId,
      workout_types: defaults.workoutTypes,
      rest_timer_seconds: defaults.restTimerSeconds,
      weight_step: defaults.weightStep,
      units: defaults.units,
      timezone: defaults.timezone,
    })
    .select('*')
    .single()

  if (!withTz.error && withTz.data) {
    return mapUserSettingsRow(withTz.data as UserSettingsRow)
  }

  // Pre-migration: timezone column missing
  const legacy = await supabase
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

  if (legacy.error) throw toServiceError(withTz.error ?? legacy.error)
  return mapUserSettingsRow({
    ...(legacy.data as UserSettingsRow),
    timezone: defaults.timezone,
  })
}

function isMissingColumnError(error: { message?: string; code?: string; details?: string } | null): boolean {
  if (!error?.message && !error?.details) return false
  const blob = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase()
  return (
    blob.includes('schema cache') ||
    blob.includes('column') ||
    blob.includes('could not find') ||
    error.code === 'PGRST204'
  )
}

export async function updateUserSettings(
  userId: string,
  update: UserSettingsUpdate,
): Promise<UserSettings> {
  // Ensure a row exists first
  await getUserSettings(userId)

  const patch = toRowPatch(update)
  const { data, error } = await supabase
    .from('user_settings')
    .update(patch)
    .eq('user_id', userId)
    .select('*')
    .single()

  if (error && patch.rest_timer_enabled !== undefined && isMissingColumnError(error)) {
    const withoutFlag = { ...patch }
    delete withoutFlag.rest_timer_enabled
    const retry =
      Object.keys(withoutFlag).length === 0
        ? await supabase.from('user_settings').select('*').eq('user_id', userId).single()
        : await supabase
            .from('user_settings')
            .update(withoutFlag)
            .eq('user_id', userId)
            .select('*')
            .single()
    if (retry.error) throw toServiceError(retry.error)
    return {
      ...mapUserSettingsRow(retry.data as UserSettingsRow),
      restTimerEnabled: update.restTimerEnabled !== false,
    }
  }

  if (error) throw toServiceError(error)
  return mapUserSettingsRow(data as UserSettingsRow)
}

function isRlsError(err: { message?: string; code?: string }): boolean {
  const code = err.code ?? ''
  const message = err.message ?? ''
  return (
    code === '42501' ||
    /row-level security/i.test(message) ||
    /violates row-level security/i.test(message)
  )
}

export async function upsertPushSubscription(
  userId: string,
  input: PushSubscriptionInput,
): Promise<string> {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession()

  if (sessionError) throw toServiceError(sessionError)
  if (!session?.user) {
    throw toServiceError({
      message: 'Not signed in — cannot save push subscription.',
      code: 'AUTH',
    })
  }
  if (session.user.id !== userId) {
    throw toServiceError({
      message: `Signed-in user (${session.user.id}) does not match settings user (${userId}).`,
      code: 'AUTH',
    })
  }

  const row = {
    user_id: userId,
    endpoint: input.endpoint,
    p256dh: input.p256dh,
    auth: input.auth,
    user_agent: input.userAgent ?? null,
  }

  const { data, error } = await supabase
    .from('push_subscriptions')
    .upsert(row, { onConflict: 'user_id,endpoint' })
    .select('id')
    .maybeSingle()

  if (error) {
    if (isRlsError(error)) {
      throw toServiceError({
        message:
          'Insert into push_subscriptions was blocked by RLS. Confirm you are signed in and the owner INSERT/UPDATE policies exist on push_subscriptions.',
        code: error.code,
        details: error.message,
      })
    }
    throw toServiceError(error)
  }

  if (data?.id) return (data as Pick<PushSubscriptionRow, 'id'>).id

  // Upsert wrote but SELECT returned nothing — verify via a follow-up read.
  const { data: existing, error: readError } = await supabase
    .from('push_subscriptions')
    .select('id')
    .eq('user_id', userId)
    .eq('endpoint', input.endpoint)
    .maybeSingle()

  if (readError) {
    if (isRlsError(readError)) {
      throw toServiceError({
        message:
          'push_subscriptions row may have been written but SELECT is blocked by RLS.',
        code: readError.code,
        details: readError.message,
      })
    }
    throw toServiceError(readError)
  }

  if (!existing?.id) {
    throw toServiceError({
      message:
        'push_subscriptions upsert returned no row. Check table exists, grants for authenticated, and RLS INSERT policy (auth.uid() = user_id).',
      code: 'NO_ROW',
    })
  }

  return (existing as Pick<PushSubscriptionRow, 'id'>).id
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
