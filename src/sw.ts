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
  try {
    const data = event.data?.json() as
      | { title?: string; body?: string; kind?: string }
      | undefined
    if (data?.title) title = data.title
    if (data?.body) body = data.body
    if (data?.kind) kind = data.kind
  } catch {
    const text = event.data?.text()
    if (text) body = text
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/just_logo.png',
      badge: '/just_logo.png',
      tag: kind ? `reminder-${kind}` : 'reminder',
      renotify: true,
      data: { url: '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data as { url?: string } | undefined)?.url ?? '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          void client.navigate(target)
          return client.focus()
        }
      }
      return self.clients.openWindow(target)
    }),
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
