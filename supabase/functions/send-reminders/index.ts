/**
 * Supabase Edge Function: send-reminders
 *
 * Invoked every minute via pg_cron. Reminder times are local wall-clock in
 * each user's IANA timezone (user_settings.timezone). We convert "now" into
 * that zone and compare HH:MM (equivalent to converting the local time to UTC).
 *
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VAPID_PUBLIC_KEY,
 * VAPID_PRIVATE_KEY, VAPID_SUBJECT, CRON_SECRET
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import webpush from 'npm:web-push@3.6.7'

type SettingsRow = {
  user_id: string
  timezone: string | null
  reminder_morning_weight_enabled: boolean
  reminder_morning_weight_time: string | null
  reminder_night_recovery_enabled: boolean
  reminder_night_recovery_time: string | null
  reminder_workout_enabled: boolean
  reminder_workout_time: string | null
  reminder_workout_days: number[] | null
}

type SubRow = {
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
}

function toHhmm(time: string | null): string | null {
  if (!time) return null
  const m = time.trim().match(/^(\d{1,2}):(\d{2})/)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

function localHhmmInZone(timeZone: string, at: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timeZone || 'UTC',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(at)
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '00'
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00'
  const h = hour === '24' ? '00' : hour.padStart(2, '0')
  return `${h}:${minute.padStart(2, '0')}`
}

function localWeekdayInZone(timeZone: string, at: Date): number {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: timeZone || 'UTC',
    weekday: 'short',
  }).format(at)
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  }
  return map[weekday] ?? 0
}

function isDue(reminderTime: string | null, timeZone: string, at: Date): boolean {
  const want = toHhmm(reminderTime)
  if (!want) return false
  return localHhmmInZone(timeZone || 'UTC', at) === want
}

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get('CRON_SECRET')
  const auth = req.headers.get('Authorization') ?? ''
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')!
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')!
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com'

  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)

  const supabase = createClient(supabaseUrl, serviceKey)
  const at = new Date()

  const { data: settings, error: settingsError } = await supabase
    .from('user_settings')
    .select(
      'user_id, timezone, reminder_morning_weight_enabled, reminder_morning_weight_time, reminder_night_recovery_enabled, reminder_night_recovery_time, reminder_workout_enabled, reminder_workout_time, reminder_workout_days',
    )

  if (settingsError) {
    return new Response(JSON.stringify({ error: settingsError.message }), { status: 500 })
  }

  const due: Array<{ userId: string; title: string; body: string }> = []

  for (const row of (settings ?? []) as SettingsRow[]) {
    const tz = row.timezone?.trim() || 'UTC'

    if (row.reminder_morning_weight_enabled && isDue(row.reminder_morning_weight_time, tz, at)) {
      due.push({
        userId: row.user_id,
        title: 'Morning weight',
        body: 'Log today’s weight in Kinetic.',
      })
    }
    if (row.reminder_night_recovery_enabled && isDue(row.reminder_night_recovery_time, tz, at)) {
      due.push({
        userId: row.user_id,
        title: 'Recovery check-in',
        body: 'How’s your fatigue and soreness today?',
      })
    }
    if (
      row.reminder_workout_enabled &&
      isDue(row.reminder_workout_time, tz, at) &&
      (row.reminder_workout_days ?? []).includes(localWeekdayInZone(tz, at))
    ) {
      due.push({
        userId: row.user_id,
        title: 'Workout reminder',
        body: 'Time to train — open Kinetic to start.',
      })
    }
  }

  if (due.length === 0) {
    return new Response(JSON.stringify({ sent: 0, matched: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const userIds = [...new Set(due.map((d) => d.userId))]
  const { data: subs, error: subsError } = await supabase
    .from('push_subscriptions')
    .select('user_id, endpoint, p256dh, auth')
    .in('user_id', userIds)

  if (subsError) {
    return new Response(JSON.stringify({ error: subsError.message }), { status: 500 })
  }

  const byUser = new Map<string, SubRow[]>()
  for (const s of (subs ?? []) as SubRow[]) {
    const list = byUser.get(s.user_id) ?? []
    list.push(s)
    byUser.set(s.user_id, list)
  }

  let sent = 0
  const failures: string[] = []

  for (const item of due) {
    const userSubs = byUser.get(item.userId) ?? []
    const payload = JSON.stringify({ title: item.title, body: item.body })
    for (const sub of userSubs) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload,
        )
        sent += 1
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        failures.push(msg)
        if (msg.includes('410') || msg.includes('404')) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
        }
      }
    }
  }

  return new Response(JSON.stringify({ sent, matched: due.length, failures: failures.slice(0, 5) }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
