/// <reference lib="webworker" />
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching'
import { clientsClaim } from 'workbox-core'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { NetworkOnly, StaleWhileRevalidate } from 'workbox-strategies'
import { BackgroundSyncPlugin } from 'workbox-background-sync'

declare let self: ServiceWorkerGlobalScope

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
clientsClaim()

self.skipWaiting()

// SPA shell: all navigations serve precached index.html (online + offline deep links)
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    // Skip URLs that look like real files (icons, assets, etc.)
    denylist: [/\.[^/]+$/],
  }),
)

registerRoute(
  ({ request }) =>
    request.destination === 'style' ||
    request.destination === 'script' ||
    request.destination === 'worker',
  new StaleWhileRevalidate({ cacheName: 'kinetic-assets' }),
)

registerRoute(
  ({ request }) => request.destination === 'image',
  new StaleWhileRevalidate({ cacheName: 'kinetic-images' }),
)

// Queue failed API writes for replay when back online
const bgSync = new BackgroundSyncPlugin('kinetic-api-queue', {
  maxRetentionTime: 24 * 60,
})

registerRoute(
  ({ url }) =>
    url.hostname.includes('supabase') &&
    (url.pathname.includes('/rest/v1/sets') ||
      url.pathname.includes('/rest/v1/daily_logs')),
  new NetworkOnly({ plugins: [bgSync] }),
  'POST',
)

self.addEventListener('push', (event) => {
  let title = 'Kinetic'
  let body = 'You have a reminder'
  try {
    const data = event.data?.json() as { title?: string; body?: string } | undefined
    if (data?.title) title = data.title
    if (data?.body) body = data.body
  } catch {
    const text = event.data?.text()
    if (text) body = text
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/just_logo.png',
      badge: '/just_logo.png',
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
    void self.registration.showNotification(data.title ?? 'Rest done', {
      body: data.body ?? 'Time for your next set.',
      icon: '/just_logo.png',
      badge: '/just_logo.png',
      tag: 'rest-timer',
      renotify: true,
    })
  }
})
