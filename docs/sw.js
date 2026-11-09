/* Sovereign Passport — installability/offline shell.
 * Network-first for same-origin GETs, cache fallback. API traffic is not cached.
 */
const CACHE = 'spid-passport-v1'
const ASSETS = [
  './passport.html',
  './passport.css',
  './passport.crypto.js',
  './passport.state.js',
  './passport.ui.js',
  './passport.sync.js',
  './passport.files.js',
  './passport.clusters.js',
  './passport.invites.js',
  './passport.status.js',
  './passport.feedback.js',
  './passport.relations.js',
  './passport.boot.js',
  './relations-client.js',
  './relations-contract.js',
  './feedback-contract.js',
  './spid.i18n.js',
  './pwa-install.js',
  './manifest.json',
  './spid-logo-192.png',
  './spid-logo-512.png',
  './spid-logo-180.png'
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
    )).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.endsWith('/sw.js')) return
  event.respondWith(
    fetch(request).then((response) => {
      if (response && response.ok) {
        const copy = response.clone()
        caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {})
      }
      return response
    }).catch(() => caches.match(request, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit
      if (request.mode === 'navigate') return caches.match('./passport.html')
      return Response.error()
    }))
  )
})
