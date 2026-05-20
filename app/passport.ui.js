/*
 * PASSPORT — Sovereign Identity System
 * passport.ui.js — UI UTILITIES
 *
 * Shared UI helpers used across all passport modules.
 * Must load before passport.clusters.js, passport.invites.js,
 * passport.offers.js, and passport.sync.js.
 *
 * Globals exposed:
 *   escHtmlP(str)        — HTML-escape a string for safe DOM insertion
 *   showToast(msg)       — show a brief notification toast
 *   isIOS()              — detect iOS device
 *   isInStandaloneMode() — detect PWA standalone mode
 *
 * Dependencies: none — pure DOM utilities
 */

function escHtmlP(str) {
  return String(str || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

let _toastTimer = null
function showToast(msg) {
  const t = document.getElementById('toast')
  t.textContent = msg
  t.classList.add('show')
  clearTimeout(_toastTimer)
  _toastTimer = setTimeout(() => t.classList.remove('show'), 2800)
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream
}
function isInStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
}
