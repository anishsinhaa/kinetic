/**
 * Supabase Edge Function: send-reminders
 *
 * Invoked every minute via pg_cron (Bearer CRON_SECRET), or in test mode from
 * the app (Bearer user JWT + { test: true }) for the signed-in user only.
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

type DueItem = { userId: string; kind: string; title: string; body: string }

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

function pushErrorInfo(err: unknown): { message: string; statusCode: number | null } {
  if (err && typeof err === 'object') {
    const e = err as { message?: string; statusCode?: number; status?: number; body?: string }
    const statusCode =
      typeof e.statusCode === 'number'
        ? e.statusCode
        : typeof e.status === 'number'
          ? e.status
          : null
    const message = [e.message, e.body].filter(Boolean).join(' | ') || String(err)
    return { message, statusCode }
  }
  return { message: String(err), statusCode: null }
}

function endpointTail(endpoint: string): string {
  return endpoint.length > 48 ? `…${endpoint.slice(-40)}` : endpoint
}

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function deliver(
  supabase: ReturnType<typeof createClient>,
  due: DueItem[],
): Promise<{
  sent: number
  deleted: number
  subscriptionsFound: number
  failures: Array<{ userId: string; endpoint: string; statusCode: number | null; message: string }>
}> {
  if (due.length === 0) {
    return { sent: 0, deleted: 0, subscriptionsFound: 0, failures: [] }
  }

  const userIds = [...new Set(due.map((d) => d.userId))]
  const { data: subs, error: subsError } = await supabase
    .from('push_subscriptions')
    .select('user_id, endpoint, p256dh, auth')
    .in('user_id', userIds)

  if (subsError) {
    throw new Error(subsError.message)
  }

  const subRows = (subs ?? []) as SubRow[]
  console.log(
    `[send-reminders] subscriptions_found=${subRows.length} for_users=${userIds.length}`,
  )

  const byUser = new Map<string, SubRow[]>()
  for (const s of subRows) {
    const list = byUser.get(s.user_id) ?? []
    list.push(s)
    byUser.set(s.user_id, list)
  }

  let sent = 0
  let deleted = 0
  const failures: Array<{ userId: string; endpoint: string; statusCode: number | null; message: string }> =
    []

  for (const item of due) {
    const userSubs = byUser.get(item.userId) ?? []
    console.log(
      `[send-reminders] send kind=${item.kind} user=${item.userId} subscriptions=${userSubs.length}`,
    )
    if (userSubs.length === 0) {
      console.warn(`[send-reminders] no subscriptions for user=${item.userId} kind=${item.kind}`)
      continue
    }

    const payload = JSON.stringify({ title: item.title, body: item.body })
    for (const sub of userSubs) {
      const tail = endpointTail(sub.endpoint)
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload,
        )
        sent += 1
        console.log(`[send-reminders] push ok user=${item.userId} kind=${item.kind} endpoint=${tail}`)
      } catch (err) {
        const { message, statusCode } = pushErrorInfo(err)
        failures.push({ userId: item.userId, endpoint: tail, statusCode, message })
        console.error(
          `[send-reminders] push fail user=${item.userId} kind=${item.kind}` +
            ` status=${statusCode ?? '—'} endpoint=${tail} error=${message}`,
        )

        const gone =
          statusCode === 404 ||
          statusCode === 410 ||
          message.includes('404') ||
          message.includes('410')
        if (gone) {
          const { error: delError } = await supabase
            .from('push_subscriptions')
            .delete()
            .eq('endpoint', sub.endpoint)
          if (delError) {
            console.error(
              `[send-reminders] failed to delete stale subscription endpoint=${tail}`,
              delError.message,
            )
          } else {
            deleted += 1
            console.log(`[send-reminders] deleted stale subscription endpoint=${tail}`)
          }
        }
      }
    }
  }

  return { sent, deleted, subscriptionsFound: subRows.length, failures }
}

Deno.serve(async (req) => {
  // Browser preflight (pg_cron never sends OPTIONS)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const cronSecret = Deno.env.get('CRON_SECRET')
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()

  let body: { test?: boolean; userId?: string } = {}
  try {
    body = (await req.json()) as { test?: boolean; userId?: string }
  } catch {
    body = {}
  }

  const isCron = Boolean(cronSecret && token && token === cronSecret)
  const isTest = body.test === true

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')!
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')!
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com'

  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)
  const supabase = createClient(supabaseUrl, serviceKey)

  // ── Test mode: verify caller JWT inside the function (--no-verify-jwt) ─────
  if (isTest) {
    if (isCron) {
      if (!body.userId) {
        return jsonResponse({ error: 'test mode with CRON_SECRET requires userId' }, 400)
      }
    } else {
      if (!token) {
        return jsonResponse({ error: 'Unauthorized — missing Bearer token' }, 401)
      }
      if (!anonKey) {
        return jsonResponse({ error: 'SUPABASE_ANON_KEY not configured on function' }, 500)
      }
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      })
      const {
        data: { user },
        error: userError,
      } = await userClient.auth.getUser(token)
      if (userError || !user) {
        console.error('[send-reminders] test auth failed', userError?.message)
        return jsonResponse(
          { error: userError?.message || 'Unauthorized — invalid or expired JWT' },
          401,
        )
      }
      if (body.userId && body.userId !== user.id) {
        return jsonResponse({ error: 'userId does not match session' }, 403)
      }
      body.userId = user.id
    }

    const userId = body.userId!
    console.log(`[send-reminders] test mode user=${userId}`)

    const due: DueItem[] = [
      {
        userId,
        kind: 'test',
        title: 'Kinetic test',
        body: 'Push is working — reminders can reach this device.',
      },
    ]

    try {
      const result = await deliver(supabase, due)
      const summary = {
        test: true,
        matched: 1,
        ...result,
        failures: result.failures.slice(0, 10),
      }
      console.log('[send-reminders] test done', JSON.stringify(summary))
      return jsonResponse(summary)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[send-reminders] test deliver failed', message)
      return jsonResponse({ error: message }, 500)
    }
  }

  // ── Cron mode (Bearer CRON_SECRET) — unchanged auth contract ───────────────
  if (cronSecret && !isCron) {
    console.error('[send-reminders] unauthorized')
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  const at = new Date()
  const utcNow = at.toISOString()
  console.log(`[send-reminders] tick utc=${utcNow}`)

  const { data: settings, error: settingsError } = await supabase
    .from('user_settings')
    .select(
      'user_id, timezone, reminder_morning_weight_enabled, reminder_morning_weight_time, reminder_night_recovery_enabled, reminder_night_recovery_time, reminder_workout_enabled, reminder_workout_time, reminder_workout_days',
    )

  if (settingsError) {
    console.error('[send-reminders] settings query failed', settingsError.message)
    return jsonResponse({ error: settingsError.message }, 500)
  }

  const rows = (settings ?? []) as SettingsRow[]
  console.log(`[send-reminders] users_checked=${rows.length}`)

  const due: DueItem[] = []

  for (const row of rows) {
    const tz = row.timezone?.trim() || 'UTC'
    const localNow = localHhmmInZone(tz, at)
    const weekday = localWeekdayInZone(tz, at)
    const morning = toHhmm(row.reminder_morning_weight_time)
    const night = toHhmm(row.reminder_night_recovery_time)
    const workout = toHhmm(row.reminder_workout_time)

    console.log(
      `[send-reminders] user=${row.user_id} tz=${tz} local=${localNow} weekday=${weekday}` +
        ` morning=${row.reminder_morning_weight_enabled ? morning ?? '—' : 'off'}` +
        ` night=${row.reminder_night_recovery_enabled ? night ?? '—' : 'off'}` +
        ` workout=${row.reminder_workout_enabled ? workout ?? '—' : 'off'}` +
        ` days=${JSON.stringify(row.reminder_workout_days ?? [])}`,
    )

    if (row.reminder_morning_weight_enabled && isDue(row.reminder_morning_weight_time, tz, at)) {
      due.push({
        userId: row.user_id,
        kind: 'morning_weight',
        title: 'Morning weight',
        body: 'Log today’s weight in Kinetic.',
      })
    }
    if (row.reminder_night_recovery_enabled && isDue(row.reminder_night_recovery_time, tz, at)) {
      due.push({
        userId: row.user_id,
        kind: 'night_recovery',
        title: 'Recovery check-in',
        body: 'How’s your fatigue and soreness today?',
      })
    }
    if (
      row.reminder_workout_enabled &&
      isDue(row.reminder_workout_time, tz, at) &&
      (row.reminder_workout_days ?? []).includes(weekday)
    ) {
      due.push({
        userId: row.user_id,
        kind: 'workout',
        title: 'Workout reminder',
        body: 'Time to train — open Kinetic to start.',
      })
    }
  }

  console.log(
    `[send-reminders] matched=${due.length}` +
      (due.length
        ? ` kinds=${due.map((d) => `${d.userId.slice(0, 8)}:${d.kind}`).join(',')}`
        : ''),
  )

  if (due.length === 0) {
    return jsonResponse({ sent: 0, matched: 0, usersChecked: rows.length })
  }

  try {
    const result = await deliver(supabase, due)
    const summary = {
      usersChecked: rows.length,
      matched: due.length,
      subscriptionsFound: result.subscriptionsFound,
      sent: result.sent,
      deleted: result.deleted,
      failures: result.failures.slice(0, 10),
    }
    console.log('[send-reminders] done', JSON.stringify(summary))
    return jsonResponse(summary)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[send-reminders] deliver failed', message)
    return jsonResponse({ error: message }, 500)
  }
})
