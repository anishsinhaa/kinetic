import { upsertPushSubscription, deletePushSubscription } from '../services/settingsService'

export class PushSubscribeError extends Error {
  readonly step: string

  constructor(step: string, message: string) {
    super(message)
    this.name = 'PushSubscribeError'
    this.step = step
  }
}

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

/** Throws if the public key was not present when Vite built the bundle. */
export function requireVapidPublicKey(): string {
  const key = getVapidPublicKey()
  if (!key) {
    throw new PushSubscribeError(
      'vapid',
      'VITE_VAPID_PUBLIC_KEY is missing from this build. Add it to .env (or the host env) and rebuild — Vite only inlines VITE_* vars at build time.',
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
  const existing = await navigator.serviceWorker.getRegistration()
  if (existing?.active || existing?.waiting || existing?.installing) {
    try {
      return await withTimeout(navigator.serviceWorker.ready, 8000)
    } catch {
      if (existing) return existing
    }
  }

  try {
    return await withTimeout(navigator.serviceWorker.ready, 8000)
  } catch {
    throw new PushSubscribeError(
      'service_worker',
      'No active service worker. Web Push needs a production/preview build with the PWA service worker registered (dev server has SW disabled).',
    )
  }
}

/** Subscribe to Web Push and persist the subscription for the user. */
export async function subscribeUserPush(userId: string): Promise<PushSubscription> {
  if (!pushSupported()) {
    throw new PushSubscribeError(
      'support',
      'Web Push is not supported in this browser (needs service worker, PushManager, and Notification).',
    )
  }

  const vapid = requireVapidPublicKey()

  const permission = await ensureNotificationPermission()
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
  } catch (err) {
    if (err instanceof PushSubscribeError) throw err
    throw new PushSubscribeError(
      'service_worker',
      err instanceof Error ? err.message : 'Failed to access the service worker.',
    )
  }

  let sub: PushSubscription | null
  try {
    sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid) as BufferSource,
      })
    }
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
    await upsertPushSubscription(userId, {
      endpoint: json.endpoint,
      p256dh,
      auth,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new PushSubscribeError(
      'save',
      `Browser subscribe succeeded but saving to push_subscriptions failed: ${msg}`,
    )
  }

  return sub
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
