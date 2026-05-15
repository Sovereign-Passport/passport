/**
 * SOVEREIGN PASSPORT — Service Worker
 * app/sw.js
 *
 * Enables offline use. Caches the wallet shell on first load.
 * The vault itself lives in IndexedDB — not in the cache.
 * This service worker only caches the app code, never user data.
 */

const CACHE_NAME    = 'sovereign-passport-v2'
const SHELL_FILES   = [
  '/passport.html',
  '/manifest.json',
]

// ── Install — cache the app shell ────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(SHELL_FILES)
    })
  )
  self.skipWaiting()
})

// ── Activate — clean old caches ──────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  )
  self.clients.claim()
})

// ── Fetch — shell-first strategy ─────────────────────────────────
// Serve app shell from cache, everything else from network.
// User data (vault) always comes from IndexedDB — never this cache.
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)

  // Only cache same-origin requests
  if (url.origin !== location.origin) return

  // Shell files: cache first
  if (SHELL_FILES.some(f => url.pathname.endsWith(f.replace('/', '')))) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        return cached ?? fetch(event.request)
      })
    )
    return
  }

  // Everything else: network first, cache fallback
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  )
})
