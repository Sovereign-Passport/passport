/*
 * PASSPORT — Sovereign Identity System
 * passport.state.js — §2 STATE + §3 NAVIGATION
 *
 * The application state container and screen navigation system.
 * Must load before any other passport JS file that touches the DOM or state.
 *
 * Globals exposed:
 *   appState        — canonical runtime state (vault, vaultKey, stored, restorePayload)
 *   SYNC_ENDPOINT   — relay URL (temporary on mdusl, future: sync.sovereign-passport.id)
 *   goTo(screenId)  — screen transition with animation
 *   goBack()        — return to previous screen
 *
 * Dependencies: passport.crypto.js (for appState.vault structure awareness)
 * DOM: requires screen divs and #about-orb to exist in passport.html
 */

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 2 — VAULT STORAGE & PERSISTENCE
// IndexedDB persistence (persist, loadStored, clearStored).
// exportBackup / importBackup — .passport file format.
// ═════════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────
// APP STATE
// ─────────────────────────────────────────────────────────────────────────────

let appState = {
  vault:      null,
  vaultKey:   null,
  stored:     null,    // encrypted payload from IndexedDB
  restorePayload: null,
}

let _currentScreen = 'screen-welcome'
let _prevScreen    = null


// ═════════════════════════════════════════════════════════════════════════════
// SECTION 3 — SCREEN NAVIGATION
// goTo(screenId) — transitions between screens with animation.
// goBack() — returns to previous screen.
// popstate listener — intercepts browser back button, keeps user in app.
// SYNC_ENDPOINT constant — temporary on mdusl, moves to sync.sovereign-passport.id
// ═════════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────
// SCREEN NAVIGATION
// ─────────────────────────────────────────────────────────────────────────────

// _bootDone guards the first goTo() call — no exit animation on boot
let _bootDone = false

function goTo(screenId) {
  const current = document.getElementById(_currentScreen)
  const next    = document.getElementById(screenId)
  if (!next || screenId === _currentScreen) return

  if (_bootDone && current) {
    current.classList.add('exit')
    setTimeout(() => { current.classList.remove('active','exit') }, 300)
  } else if (current) {
    current.classList.remove('active')
  }

  next.classList.add('active')
  _prevScreen    = _currentScreen
  _currentScreen = screenId
  _bootDone      = true

  // Push a history entry so the browser back button has something to intercept
  history.pushState({ screen: screenId }, '', location.href)

  // Trigger re-animations
  next.querySelectorAll('.fade-up').forEach(el => {
    el.style.animation = 'none'
    requestAnimationFrame(() => { el.style.animation = '' })
  })

  // Show orb only on welcome, unlock, home
  const orbScreens = ['screen-welcome', 'screen-unlock', 'screen-home']
  const orb = document.getElementById('about-orb')
  if (orb) orb.classList.toggle('visible', orbScreens.includes(screenId))

  // Screen-specific init
  if (screenId === 'screen-vault-files') renderVFList()
  if (screenId === 'screen-health')      populateHome()
  if (screenId === 'screen-settings') {
    const sh = document.getElementById('settings-handle-display')
    if (sh) sh.textContent = (appState.vault && appState.vault.identity && appState.vault.identity.handle) ? appState.vault.identity.handle : '—'
  }
}

function goBack() {
  if (_prevScreen) goTo(_prevScreen)
  else goTo('screen-home')
}

// Intercept browser back button — never let it leave the app
window.addEventListener('popstate', () => {
  if (_currentScreen === 'screen-home' || _currentScreen === 'screen-welcome' ||
      _currentScreen === 'screen-unlock') {
    // Already at a root screen — push state again to keep user inside
    history.pushState({ screen: _currentScreen }, '', location.href)
  } else {
    goTo(appState.vault ? 'screen-home' : 'screen-welcome')
  }
})



// ─────────────────────────────────────────────────────────────────────────────
// SYNC ENDPOINT
// Temporary on mdusl.sovereign-passport.id
// One line changes when sync.sovereign-passport.id DNS is ready.
// ─────────────────────────────────────────────────────────────────────────────

const SYNC_ENDPOINT = 'https://mdusl.sovereign-passport.id/api/passport/sync'
