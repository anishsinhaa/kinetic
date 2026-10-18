import { supabase } from '../../../lib/supabase/client'
import { toServiceError } from '../../../lib/supabase/errors'

type TestPushResult = {
  sent: number
  matched?: number
  subscriptionsFound?: number
  error?: string
}

/**
 * Call the send-reminders Edge Function in test mode for the current user only.
 * Uses the user's JWT (not CRON_SECRET).
 */
export async function sendTestReminderPush(userId: string): Promise<{ sent: number }> {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession()

  if (sessionError) throw toServiceError(sessionError)
  if (!session?.access_token || !session.user) {
    throw toServiceError({ message: 'Not signed in — cannot send test notification.', code: 'AUTH' })
  }
  if (session.user.id !== userId) {
    throw toServiceError({
      message: 'Signed-in user does not match settings user.',
      code: 'AUTH',
    })
  }

  const base = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '')
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (!base || !anon) {
    throw toServiceError({
      message: 'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing from this build.',
      code: 'ENV',
    })
  }

  const res = await fetch(`${base}/functions/v1/send-reminders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: anon,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ test: true, userId }),
  })

  let payload: TestPushResult | null = null
  try {
    payload = (await res.json()) as TestPushResult
  } catch {
    payload = null
  }

  if (!res.ok) {
    throw toServiceError({
      message:
        payload?.error ||
        `Test notification failed (HTTP ${res.status}). Deploy send-reminders with test-mode support and confirm a push_subscriptions row exists.`,
      code: String(res.status),
    })
  }

  const sent = typeof payload?.sent === 'number' ? payload.sent : 0
  if (sent === 0) {
    throw toServiceError({
      message:
        payload?.subscriptionsFound === 0 || payload?.matched === 0
          ? 'No push_subscriptions row for this user — tap Enable first, then try again.'
          : 'Test notification returned sent=0. Check Edge Function logs.',
      code: 'NO_SEND',
    })
  }

  return { sent }
}
