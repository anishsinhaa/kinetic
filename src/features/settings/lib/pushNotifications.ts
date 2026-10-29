import { upsertPushSubscription, deletePushSubscription } from '../services/settingsService'
import { sendTestReminderPush } from '../services/pushTestService'

export class PushSubscribeError extends Error {
  readonly step: string

  constructor(step: string, message: string) {
    super(message)
    this.name = 'PushSubscribeError'
    this.step = step
  }
}

/** Chrome/Android PushManager expects an ArrayBuffer, not a Uint8Array view. */
function urlBase64ToArrayBuffer(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength)
}

export function getVapidPublicKey(): string | null {
  const key = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined)?.trim()
  return key || null
}

/** Throws if the public key was not present when Vite built the bundle. */
export function requireVapidPublicKey(): string {
  const key = getVapidPublicKey()
  if (!key) {
    throw new PushSubscribeError(
      'vapid',
      'VITE_VAPID_PUBLIC_KEY is missing from this build. Set it in the host env (e.g. Netlify) and rebuild — Vite only inlines VITE_* vars at build time.',
    )
  }
  // Uncompressed P-256 VAPID keys are ~87 URL-safe base64 chars.
  if (key.length < 80 || !/^[A-Za-z0-9_-]+$/.test(key)) {
    throw new PushSubscribeError(
      'vapid',
      'VITE_VAPID_PUBLIC_KEY looks invalid. Expect a URL-safe base64 VAPID public key (usually ~87 characters).',
    )
  }
  return key
}

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export async function ensureNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied'
  if (Notification.permission === 'granted') return 'granted'
  if (Notification.permission === 'denied') return 'denied'
  return Notification.requestPermission()
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error('timeout')), ms)
    promise.then(
      (v) => {
        window.clearTimeout(t)
        resolve(v)
      },
      (e) => {
        window.clearTimeout(t)
        reject(e)
      },
    )
  })
}

async function getPushRegistration(): Promise<ServiceWorkerRegistration> {
  // Prefer an explicit registration — ready can hang if nothing is registered yet.
  let existing = await navigator.serviceWorker.getRegistration()
  if (!existing) {
    // PWA plugin registers asynchronously; wait briefly for it.
    for (let i = 0; i < 20 && !existing; i++) {
      await new Promise((r) => window.setTimeout(r, 250))
      existing = await navigator.serviceWorker.getRegistration()
    }
  }

  if (existing) {
    try {
      return await withTimeout(navigator.serviceWorker.ready, 10000)
    } catch {
      return existing
    }
  }

  try {
    return await withTimeout(navigator.serviceWorker.ready, 10000)
  } catch {
    throw new PushSubscribeError(
      'service_worker',
      'No active service worker. Web Push needs a production/preview build with the PWA service worker registered (Vite dev has SW disabled).',
    )
  }
}

async function ensureBrowserPushSubscription(
  reg: ServiceWorkerRegistration,
  vapid: string,
): Promise<PushSubscription> {
  let sub = await reg.pushManager.getSubscription()
  if (sub) {
    console.info('[push] reusing existing browser subscription', sub.endpoint.slice(-32))
    return sub
  }

  console.info('[push] pushManager.subscribe…')
  try {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToArrayBuffer(vapid),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new PushSubscribeError(
      'subscribe',
      `pushManager.subscribe failed: ${msg}. Check that VITE_VAPID_PUBLIC_KEY matches the server VAPID public key.`,
    )
  }

  if (!sub) {
    throw new PushSubscribeError('subscribe', 'pushManager.subscribe returned no subscription.')
  }
  console.info('[push] browser subscribe ok', sub.endpoint.slice(-32))
  return sub
}

/**
 * Ensure a browser PushSubscription exists and upsert it into push_subscriptions.
 * Always writes to the DB even when permission was already granted or a browser sub already exists.
 */
export async function subscribeUserPush(userId: string): Promise<PushSubscription> {
  console.info('[push] enable start', { userId: userId.slice(0, 8) })

  if (!pushSupported()) {
    throw new PushSubscribeError(
      'support',
      'Web Push is not supported in this browser (needs service worker, PushManager, and Notification).',
    )
  }

  const vapid = requireVapidPublicKey()
  console.info('[push] vapid present', { length: vapid.length })

  const permission = await ensureNotificationPermission()
  console.info('[push] permission', permission)
  if (permission !== 'granted') {
    throw new PushSubscribeError(
      'permission',
      permission === 'denied'
        ? 'Notification permission is blocked. Allow notifications for this site in browser settings, then try again.'
        : 'Notification permission was not granted.',
    )
  }

  let reg: ServiceWorkerRegistration
  try {
    reg = await getPushRegistration()
    console.info('[push] service worker ready', {
      active: Boolean(reg.active),
      scope: reg.scope,
    })
  } catch (err) {
    if (err instanceof PushSubscribeError) throw err
    throw new PushSubscribeError(
      'service_worker',
      err instanceof Error ? err.message : 'Failed to access the service worker.',
    )
  }

  const sub = await ensureBrowserPushSubscription(reg, vapid)

  const json = sub.toJSON()
  const p256dh = json.keys?.p256dh
  const auth = json.keys?.auth
  if (!json.endpoint || !p256dh || !auth) {
    throw new PushSubscribeError(
      'subscribe',
      'Push subscription is missing endpoint or encryption keys.',
    )
  }

  try {
    const id = await upsertPushSubscription(userId, {
      endpoint: json.endpoint,
      p256dh,
      auth,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    })
    console.info('[push] upserted push_subscriptions row', id)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new PushSubscribeError(
      'save',
      `Browser subscribe succeeded but saving to push_subscriptions failed: ${msg}`,
    )
  }

  return sub
}

/**
 * If the browser already granted notifications, re-sync the current subscription to the DB.
 * No-ops (without throwing) when permission is not granted or push is unsupported.
 * Throws on real sync failures so callers can surface them.
 */
export async function syncPushSubscriptionIfGranted(userId: string): Promise<boolean> {
  if (!pushSupported()) return false
  if (!('Notification' in window) || Notification.permission !== 'granted') return false
  if (!getVapidPublicKey()) {
    console.warn('[push] skip sync — VITE_VAPID_PUBLIC_KEY missing from build')
    return false
  }
  await subscribeUserPush(userId)
  return true
}

export async function unsubscribeUserPush(userId: string): Promise<void> {
  if (!pushSupported()) {
    throw new PushSubscribeError('support', 'Web Push is not supported in this browser.')
  }
  const reg = await getPushRegistration()
  const sub = await reg.pushManager.getSubscription()
  if (sub) {
    const endpoint = sub.endpoint
    await sub.unsubscribe()
    await deletePushSubscription(userId, endpoint)
  }
}

/** Invoke send-reminders in test mode for the signed-in user only. */
export async function sendTestPushNotification(userId: string): Promise<{ sent: number }> {
  return sendTestReminderPush(userId)
}

const REST_DONE_TITLE = 'Rest done'
const REST_DONE_BODY = 'Time for your next set.'
const REST_DONE_ICON = '/just_logo.png'

let fallbackRestNotification: Notification | null = null

function restDoneOptions(): NotificationOptions & { renotify: boolean } {
  return {
    body: REST_DONE_BODY,
    icon: REST_DONE_ICON,
    badge: REST_DONE_ICON,
    tag: 'rest-timer',
    renotify: true,
  }
}

/** Close any rest-done notification. Never throws. */
export async function clearRestNotifications(): Promise<void> {
  try {
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_REST_NOTIFICATIONS' })
    }
    if ('serviceWorker' in navigator) {
      try {
        const reg = await withTimeout(navigator.serviceWorker.ready, 1500)
        const list = await reg.getNotifications({ tag: 'rest-timer' })
        list.forEach((notification) => notification.close())
      } catch {
        // ready can hang or getNotifications can be unavailable
      }
    }
    fallbackRestNotification?.close()
    fallbackRestNotification = null
  } catch {
    // ignore
  }
}

/** Local rest-timer notification via service worker (works when tab is backgrounded). */
export async function showRestDoneNotification(): Promise<void> {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') return

    // Prefer posting to an active controller — never blocks.
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'REST_TIMER_DONE',
        title: REST_DONE_TITLE,
        body: REST_DONE_BODY,
      })
      return
    }

    const options = restDoneOptions()

    // SW ready can hang in some embedded browsers — cap wait, then fall back.
    if ('serviceWorker' in navigator) {
      try {
        const reg = await withTimeout(navigator.serviceWorker.ready, 2000)
        await reg.showNotification(REST_DONE_TITLE, options)
        window.setTimeout(() => void clearRestNotifications(), 60_000)
        return
      } catch {
        // fall through to Notification API
      }
    }

    const notification = new Notification(REST_DONE_TITLE, options)
    fallbackRestNotification = notification
    notification.onclick = () => {
      notification.close()
      if (fallbackRestNotification === notification) fallbackRestNotification = null
    }
    window.setTimeout(() => void clearRestNotifications(), 60_000)
  } catch {
    // ignore
  }
}
