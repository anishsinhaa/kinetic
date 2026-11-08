/// <reference lib="webworker" />
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching'
import { clientsClaim } from 'workbox-core'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { StaleWhileRevalidate } from 'workbox-strategies'

declare let self: ServiceWorkerGlobalScope

const KIND_URL: Record<string, string> = {
  workout: '/workout',
  morning_weight: '/logs?log=today',
  night_recovery: '/logs/recovery',
  test: '/settings',
}

/** Accept only same-origin path strings (leading `/`, not `//` or absolute URLs). */
function sameOriginPath(u: unknown): string | null {
  if (typeof u !== 'string') return null
  if (!u.startsWith('/') || u.startsWith('//')) return null
  return u
}

// Take over immediately so deploys don't leave tabs on a dead precache
self.skipWaiting()
clientsClaim()

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// SPA shell: navigations serve precached index.html (online + offline deep links)
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: [/\.[^/]+$/],
  }),
)

// Only images use runtime cache. Hashed JS/CSS come from the precache —
// a separate StaleWhileRevalidate layer was serving removed chunk URLs after deploy.
registerRoute(
  ({ request }) => request.destination === 'image',
  new StaleWhileRevalidate({ cacheName: 'kinetic-images' }),
)

self.addEventListener('push', (event) => {
  let title = 'Kinetic'
  let body = 'You have a reminder'
  let kind: string | undefined
  let payloadUrl: string | undefined
  try {
    const data = event.data?.json() as
      | { title?: string; body?: string; kind?: string; url?: string }
      | undefined
    if (data?.title) title = data.title
    if (data?.body) body = data.body
    if (data?.kind) kind = data.kind
    if (data?.url) payloadUrl = data.url
  } catch {
    const text = event.data?.text()
    if (text) body = text
  }

  const url =
    sameOriginPath(payloadUrl) ?? (kind ? KIND_URL[kind] : undefined) ?? '/'

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/just_logo.png',
      badge: '/just_logo.png',
      tag: kind ? `reminder-${kind}` : 'reminder',
      renotify: true,
      data: { url, kind },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target =
    sameOriginPath((event.notification.data as { url?: string } | undefined)?.url) ?? '/'
  const url = new URL(target, self.location.origin)

  event.waitUntil(
    (async () => {
      try {
        const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        const controlled = await self.clients.matchAll({ type: 'window' })
        const controlledIds = new Set(controlled.map((c) => c.id))

        const sameOrigin = all.filter((c) => {
          try {
            return new URL(c.url).origin === self.location.origin
          } catch {
            return false
          }
        })
        const client =
          sameOrigin.find((c) => c.focused) ??
          sameOrigin.find((c) => c.visibilityState === 'visible') ??
          sameOrigin[0]

        if (client) {
          await client.focus()
          client.postMessage({ type: 'NAVIGATE', url: url.pathname + url.search })
          if (!controlledIds.has(client.id) && 'navigate' in client) {
            await client.navigate(url.href).catch(() => undefined)
          }
          return
        }

        await self.clients.openWindow(url.href)
      } catch {
        await self.clients.openWindow(url.href)
      }
    })(),
  )
})

self.addEventListener('message', (event) => {
  const data = event.data as { type?: string; title?: string; body?: string } | undefined
  if (data?.type === 'REST_TIMER_DONE') {
    event.waitUntil(
      (async () => {
        await self.registration.showNotification(data.title ?? 'Rest done', {
          body: data.body ?? 'Time for your next set.',
          icon: '/just_logo.png',
          badge: '/just_logo.png',
          tag: 'rest-timer',
          renotify: true,
          requireInteraction: false,
          silent: false,
          data: { url: '/workout', kind: 'rest-timer' },
        })
        await new Promise((resolve) => setTimeout(resolve, 60_000))
        const list = await self.registration.getNotifications({ tag: 'rest-timer' })
        list.forEach((notification) => notification.close())
      })(),
    )
  }
  if (data?.type === 'CLEAR_REST_NOTIFICATIONS') {
    event.waitUntil(
      self.registration.getNotifications({ tag: 'rest-timer' }).then((list) => {
        list.forEach((notification) => notification.close())
      }),
    )
  }
  if (data?.type === 'SKIP_WAITING') {
    event.waitUntil(self.skipWaiting())
  }
})
