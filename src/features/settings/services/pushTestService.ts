import { FunctionsHttpError, FunctionsRelayError, FunctionsFetchError } from '@supabase/supabase-js'
import { supabase } from '../../../lib/supabase/client'
import { toServiceError } from '../../../lib/supabase/errors'

type TestPushResult = {
  sent?: number
  matched?: number
  subscriptionsFound?: number
  error?: string
  failures?: Array<{ message?: string; statusCode?: number | null }>
}

async function messageFromFunctionsError(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = (await error.context.json()) as TestPushResult | string
      if (typeof body === 'string' && body.trim()) return body
      if (body && typeof body === 'object') {
        if (body.error) return body.error
        if (body.failures?.[0]?.message) return body.failures[0].message!
        return JSON.stringify(body)
      }
    } catch {
      // fall through
    }
    return error.message || `Edge function HTTP error`
  }
  if (error instanceof FunctionsRelayError || error instanceof FunctionsFetchError) {
    return error.message || 'Failed to reach send-reminders (network/CORS). Redeploy the function with CORS headers.'
  }
  if (error instanceof Error && error.message) return error.message
  return String(error)
}

/**
 * Call send-reminders in test mode for the signed-in user only.
 * Uses supabase.functions.invoke (apikey + user access token from the session).
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

  const { data, error } = await supabase.functions.invoke<TestPushResult>('send-reminders', {
    body: { test: true, userId },
  })

  if (error) {
    const message = await messageFromFunctionsError(error)
    throw toServiceError({ message, code: 'FUNCTIONS' })
  }

  const payload = data ?? null
  if (payload?.error) {
    throw toServiceError({ message: payload.error, code: 'FUNCTIONS' })
  }

  const sent = typeof payload?.sent === 'number' ? payload.sent : 0
  if (sent === 0) {
    const failMsg = payload?.failures?.[0]?.message
    throw toServiceError({
      message:
        failMsg ||
        (payload?.subscriptionsFound === 0
          ? 'No push_subscriptions row for this user — tap Enable first, then try again.'
          : 'Test notification returned sent=0. Check Edge Function logs.'),
      code: 'NO_SEND',
    })
  }

  return { sent }
}
