import { upsertPushSubscription, deletePushSubscription } from '../services/settingsService'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export function getVapidPublicKey(): string | null {
  const key = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined)?.trim()
  return key || null
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

/** Subscribe to Web Push and persist the subscription for the user. */
export async function subscribeUserPush(userId: string): Promise<PushSubscription | null> {
  const vapid = getVapidPublicKey()
  if (!vapid || !pushSupported()) return null

  const permission = await ensureNotificationPermission()
  if (permission !== 'granted') return null

  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid) as BufferSource,
    })
  }

  const json = sub.toJSON()
  const p256dh = json.keys?.p256dh
  const auth = json.keys?.auth
  if (!json.endpoint || !p256dh || !auth) {
    throw new Error('Push subscription missing keys')
  }

  await upsertPushSubscription(userId, {
    endpoint: json.endpoint,
    p256dh,
    auth,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
  })

  return sub
}

export async function unsubscribeUserPush(userId: string): Promise<void> {
  if (!pushSupported()) return
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (sub) {
    const endpoint = sub.endpoint
    await sub.unsubscribe()
    await deletePushSubscription(userId, endpoint)
  }
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

/** Local rest-timer notification via service worker (works when tab is backgrounded). */
export async function showRestDoneNotification(): Promise<void> {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return

    // Prefer posting to an active controller — never blocks.
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'REST_TIMER_DONE',
        title: 'Rest done',
        body: 'Time for your next set.',
      })
      return
    }

    // SW ready can hang in some embedded browsers — cap wait, then fall back.
    if ('serviceWorker' in navigator) {
      try {
        const reg = await withTimeout(navigator.serviceWorker.ready, 2000)
        await reg.showNotification('Rest done', {
          body: 'Time for your next set.',
          icon: '/just_logo.png',
          badge: '/just_logo.png',
          tag: 'rest-timer',
        })
        return
      } catch {
        // fall through to Notification API
      }
    }

    new Notification('Rest done', { body: 'Time for your next set.' })
  } catch {
    // ignore
  }
}
