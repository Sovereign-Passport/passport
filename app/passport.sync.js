/*
 * PASSPORT — Sovereign Identity System
 * passport.sync.js — §8 BACKUP & SYNC
 *
 * All backup, sync, and restore operations.
 * The vault never leaves the device unencrypted.
 *
 * Responsibilities:
 *   showDID()              — copy DID to clipboard
 *   downloadBackup()       — export encrypted .passport file to disk
 *   syncToDevice()         — upload encrypted blob to 15-min VPS relay, show QR
 *   _showSyncLinkModal()   — render sync link + QR in overlay
 *   switchRestoreTab()     — toggle file / sync-link restore tabs
 *   restoreFromSyncLink()  — fetch blob from relay, decrypt, restore
 *   showRestore()          — navigate to restore screen
 *   handleRestoreFile()    — handle .passport file input
 *   tryRestore()           — restore from .passport file with password
 *   confirmReset()         — confirm and wipe local vault
 *
 * Dependencies: passport.crypto.js, passport.state.js, passport.ui.js
 * SYNC_ENDPOINT: defined in passport.state.js
 * VPS: syncToDevice() and restoreFromSyncLink() call the VPS relay
 */

function showDID() {
  const did = (appState.vault && appState.vault.identity && appState.vault.identity.id)
  if (!did) return
  if(navigator.clipboard) navigator.clipboard.writeText(did).then(() => showToast('DID copied to clipboard'))
    .catch(() => showToast(did.slice(0,30) + '…'))
}


// ─────────────────────────────────────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════
// SECTION 8 — BACKUP & SYNC
// downloadBackup() — exports encrypted .passport blob to disk.
// syncToDevice() — uploads encrypted blob to 15-min VPS relay, shows QR.
//   QR points to passport.html#sync=TOKEN (not raw API endpoint).
//   QR generated locally via passport.qr.js — no external calls.
//   FUTURE: move to sync.sovereign-passport.id when DNS is ready.
// switchRestoreTab() — toggles between file restore and sync link restore.
// restoreFromSyncLink() — fetches blob from relay, decrypts, restores.
// tryRestore() — restores from .passport file with password.
// ═════════════════════════════════════════════════════════════════════════════

function downloadBackup() {
  if (!appState.stored) { showToast('No vault to backup yet'); return }
  const blob = exportBackup(appState.stored)
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  const handle = ((appState.vault && appState.vault.identity && appState.vault.identity.handle) || 'passport')
  a.href     = url
  a.download = `${handle}-passport-backup.passport`
  a.click()
  URL.revokeObjectURL(url)
  showToast('Backup downloaded')
}


// ─────────────────────────────────────────────────────────────────────────────
// SYNC TO ANOTHER DEVICE — 15-minute relay
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Upload encrypted .passport blob to the VPS relay.
 * Returns a sync link valid for 15 minutes.
 * The VPS receives an opaque encrypted blob — it cannot read it.
 */
async function syncToDevice() {
  if (!appState.stored) { showToast('No vault to sync'); return }

  showToast('Generating sync link…')

  try {
    const blob    = exportBackup(appState.stored)
    const text    = await blob.text()
    const b64     = btoa(unescape(encodeURIComponent(text)))
    const did     = (appState.vault && appState.vault.identity && appState.vault.identity.id)

    const res = await fetch(SYNC_ENDPOINT, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ did, blob: b64 }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error((err.error || `Server error ${res.status}`))
    }

    const { token, expires_at, qr_svg } = await res.json()
    const expiresIn  = Math.round((new Date(expires_at) - Date.now()) / 60000)
    const walletBase = 'https://sovereign-passport.github.io/passport/passport.html'
    const syncUrl    = walletBase + '#sync=' + token

    // Show sync link modal — QR generated server-side by vine
    _showSyncLinkModal(syncUrl, expiresIn, qr_svg)

  } catch (err) {
    showToast('Sync failed: ' + ((err.message || 'network error')))
  }
}

/**
 * Show the sync link + QR in a modal overlay.
 */
function _showSyncLinkModal(url, expiresIn, qrSvg) {
  const _slm = document.getElementById('sync-link-modal'); if(_slm) _slm.remove()

  const overlay = document.createElement('div')
  overlay.id    = 'sync-link-modal'
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(8,11,18,0.96);
    z-index:200;display:flex;align-items:center;
    justify-content:center;padding:24px;overflow-y:auto;
  `

  overlay.innerHTML = `
    <div class="card" style="width:100%;max-width:380px;text-align:center;">
      <p class="cred-type" style="margin-bottom:8px;">Sync link</p>
      <p style="font-size:12px;color:var(--ink-dim);line-height:1.6;margin-bottom:16px;">
        Expires in <strong style="color:var(--gold);">${expiresIn} minutes</strong>.
        Your data is already encrypted — the server cannot read it.
      </p>

      <div class="qr-container">${qrSvg || ''}</div>

      <div style="background:var(--bg-deep);border-radius:6px;padding:10px;
                  font-size:10px;color:var(--gold);word-break:break-all;
                  margin-bottom:16px;text-align:left;line-height:1.6;">
        ${escHtmlP(url)}
      </div>

      <div style="display:flex;gap:8px;">
        <button class="btn btn-primary" style="flex:1;"
          onclick="if(navigator.clipboard)navigator.clipboard.writeText('${escHtmlP(url)}');showToast('Link copied')">
          Copy link
        </button>
        ${navigator.share ? `
        <button class="btn btn-ghost" style="flex:1;"
          onclick="navigator.share({title:'Passport sync',url:'${escHtmlP(url)}'})">
          Share
        </button>` : ''}
      </div>

      <div class="notice" style="margin-top:16px;text-align:left;">
        <span class="notice-icon">ℹ</span>
        <span class="notice-text" style="font-size:11px;">
          The sovereign way is to download and transfer your backup file yourself.
          This 15-minute relay is a convenience — use it, then forget it exists.
        </span>
      </div>

      <button class="btn btn-ghost" style="margin-top:12px;width:100%;"
        onclick="document.getElementById('sync-link-modal').remove()">
        Close
      </button>
    </div>
  `
  document.body.appendChild(overlay)
}


// ─────────────────────────────────────────────────────────────────────────────
// RESTORE TAB SWITCH
// ─────────────────────────────────────────────────────────────────────────────

function switchRestoreTab(tab) {
  const filePanel = document.getElementById('restore-panel-file')
  const syncPanel = document.getElementById('restore-panel-sync')
  const fileBtn   = document.getElementById('restore-tab-file')
  const syncBtn   = document.getElementById('restore-tab-sync')
  if (!filePanel || !syncPanel) return
  const isFile = tab === 'file'
  filePanel.style.display = isFile ? 'block' : 'none'
  syncPanel.style.display = isFile ? 'none'  : 'block'
  fileBtn.classList.toggle('active',  isFile)
  syncBtn.classList.toggle('active', !isFile)
}


// ─────────────────────────────────────────────────────────────────────────────
// RESTORE FROM SYNC LINK
// ─────────────────────────────────────────────────────────────────────────────

async function restoreFromSyncLink() {
  const linkInput = document.getElementById('input-sync-link')
  const pwInput   = document.getElementById('input-sync-password')
  const errEl     = document.getElementById('sync-restore-error')
  const errTxt    = document.getElementById('sync-restore-error-text')
  const btn       = document.getElementById('btn-sync-restore')

  const link     = (linkInput && linkInput.value).trim()
  const password = (pwInput && pwInput.value)

  if (!link || !password) return

  errEl.style.display = 'none'
  btn.textContent     = 'Fetching…'
  btn.disabled        = true

  try {
    // Fetch blob from relay
    const res = await fetch(link)

    if (res.status === 410) {
      throw Object.assign(new Error('Sync link has expired. Generate a new one from your passport.'), { code: 'EXPIRED' })
    }
    if (res.status === 404) {
      throw Object.assign(new Error('Sync link not found. It may have already been used or expired.'), { code: 'NOT_FOUND' })
    }
    if (!res.ok) throw new Error(`Server error ${res.status}`)

    const { blob: b64 } = await res.json()

    // Decode base64 back to text
    const text    = decodeURIComponent(escape(atob(b64)))
    const payload = JSON.parse(text)

    if (payload.format !== 'passport-vault' || !payload.payload) {
      throw Object.assign(new Error('Invalid backup format'), { code: 'INVALID_BACKUP' })
    }

    // Decrypt with password — same flow as file restore
    const { vault, vaultKey } = await unlockVault(
      password,
      payload.payload.salt,
      payload.payload.iv,
      payload.payload.ciphertext
    )

    await persist(payload.payload)
    appState.stored   = payload.payload
    appState.vault    = vault
    appState.vaultKey = vaultKey
    populateHome()
    checkPendingOffer()
    showToast('Passport restored from sync link')
    goTo('screen-home')

  } catch (e) {
    errEl.style.display  = 'flex'
    errTxt.textContent   = (e.message || 'Could not restore')
    btn.textContent      = 'Fetch & Restore →'
    btn.disabled         = false
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// RESTORE
// ─────────────────────────────────────────────────────────────────────────────

function showRestore() { goTo('screen-restore') }

function handleRestoreFile() {
  const file = document.getElementById('input-restore-file').files[0]
  document.getElementById('btn-restore').disabled = !file
}

async function tryRestore() {
  const file     = document.getElementById('input-restore-file').files[0]
  const password = document.getElementById('input-restore-password').value
  const err      = document.getElementById('restore-error')
  const etxt     = document.getElementById('restore-error-text')
  const btn      = document.getElementById('btn-restore')

  if (!file || !password) return

  btn.textContent = 'Restoring...'
  btn.disabled    = true
  err.style.display = 'none'

  try {
    // Step 1 — parse the .passport file (catches malformed JSON)
    const payload = await importBackup(file)

    // Step 2 — decrypt with password (catches wrong password)
    const {vault, vaultKey} = await unlockVault(
      password, payload.salt, payload.iv, payload.ciphertext
    )

    // Step 3 — persist and load
    await persist(payload)
    appState.stored   = payload
    appState.vault    = vault
    appState.vaultKey = vaultKey
    populateHome()
    checkPendingOffer()
    showToast('Passport restored')
    goTo('screen-home')

  } catch (e) {
    // Show the REAL error — not a generic message
    // This is critical for debugging — the exact error tells us what failed
    err.style.display = 'flex'

    if (e.code === 'INVALID_BACKUP') {
      etxt.textContent = 'Invalid backup file — make sure you selected a .passport file.'
    } else if (e.code === 'WRONG_PASSWORD') {
      etxt.textContent = 'Wrong password for this backup.'
    } else {
      // Show the actual error message so we can diagnose it
      etxt.textContent = 'Restore failed: ' + ((e.message || e.toString()))
    }

    // Log full error to console for debugging
    console.error('[Restore] Failed:', e)

    // Show debug details in the UI panel
    const debugEl = document.getElementById('restore-debug')
    const debugTxt = document.getElementById('restore-debug-text')
    if (debugEl && debugTxt) {
      debugEl.style.display = 'block'
      debugTxt.textContent  =
        'Error code: ' + ((e.code || 'none')) + '\n' +
        'Message: '    + ((e.message || e.toString())) + '\n' +
        'File name: '  + ((file && file.name) || 'unknown') + '\n' +
        'File size: '  + ((file && file.size) || 0) + ' bytes'
    }

    btn.textContent = 'Restore →'
    btn.disabled    = false
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS / RESET
// ─────────────────────────────────────────────────────────────────────────────

function confirmReset() {
  if (confirm('Delete your local Passport? This cannot be undone. Make sure you have a backup.')) {
    clearStored().then(() => {
      appState = {vault:null,vaultKey:null,stored:null,restorePayload:null}
      goTo('screen-welcome')
      showToast('Passport cleared')
    })
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// TOAST
// ─────────────────────────────────────────────────────────────────────────────
