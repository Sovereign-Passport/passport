/*
 * PASSPORT — Sovereign Identity System
 * passport.files.js — §7 VAULT FILES
 *
 * Private file manager — text and image files stored in the vault.
 * Files are encrypted with the vault key. Visibility is per-file.
 *
 * Responsibilities:
 *   openVaultFiles()          — navigate to vault files screen
 *   addVaultFile()            — detect type, enforce limits, save to vault
 *   switchVaultTab()          — toggle private / shared tab
 *   renderVFList()            — render file list with actions
 *   toggleFileVisibility()    — move file between private / shared
 *   deleteVaultFile()         — remove file (welcome.txt protected)
 *   openVFPad()               — open file viewer overlay (text or image)
 *   closeVFPad()              — close file viewer overlay
 *
 * Dependencies: passport.crypto.js, passport.state.js, passport.ui.js
 * NOTE: "shared" visibility is intent only — transfer not yet implemented.
 */

// SECTION 7 — VAULT FILES
// File manager — private and shared tabs.
// addVaultFile() — detects type, enforces size limits, saves to vault.
// renderVFList() — renders file list with toggle visibility and delete actions.
// toggleFileVisibility() — moves file between private/shared.
// deleteVaultFile() — removes file, reverts on error. welcome.txt is protected.
// openVFPad() — opens file viewer overlay (text or image).
// NOTE: "shared" visibility is intent only — transfer not yet implemented.
// ═════════════════════════════════════════════════════════════════════════════

let _vfTab = 'private'

function openVaultFiles() {
  goTo('screen-vault-files')
  renderVFList()
}

async function addVaultFile(input) {
  const file = input.files[0]
  if (!file) return

  const isImage   = file.type.startsWith('image/')
  const MAX_TEXT  = 2 * 1024 * 1024   // 2 MB for text files
  const MAX_IMAGE = 512 * 1024         // 512 KB for images (base64 ~4x overhead in vault)

  if (isImage && file.size > MAX_IMAGE) {
    showToast(`Image too large — max 512 KB (this file is ${Math.round(file.size/1024)}KB)`)
    input.value = ''
    return
  }
  if (!isImage && file.size > MAX_TEXT) {
    showToast(`File too large — max 2 MB`)
    input.value = ''
    return
  }

  const reader = new FileReader()

  reader.onerror = () => {
    showToast('Could not read file — try a different file')
    input.value = ''
  }

  reader.onload = async (e) => {
    const content = e.target.result
    const vault   = appState.vault
    if (!vault.files) vault.files = []

    const entry = {
      name:       file.name,
      path:       file.name,
      mime:       file.type || 'text/plain',
      visibility: _vfTab || 'private',
      date:       new Date().toLocaleDateString('en-CA'),
      size:       `${Math.round(file.size / 1024 * 10) / 10}kb`,
      content,
    }

    vault.files.push(entry)

    try {
      const newPayload = await saveVault(appState.vaultKey, vault, appState.stored.salt)
      await persist(newPayload)
      appState.stored = newPayload
      showToast(`${file.name} saved to vault`)
      populateHome()
      renderVFList()
    } catch (err) {
      vault.files.pop()
      showToast('Could not save — ' + ((err.message || 'storage error')))
      console.error('[VaultFile] Save failed:', err)
    }
  }

  if (isImage) {
    reader.readAsDataURL(file)
  } else {
    reader.readAsText(file)
  }

  input.value = ''
}

function switchVaultTab(tab) {
  _vfTab = tab
  const btnP   = document.getElementById('vf-tab-private')
  const btnS   = document.getElementById('vf-tab-shared')
  const notice = document.getElementById('vf-shared-notice')
  btnP.classList.toggle('active', tab === 'private')
  btnS.classList.toggle('active', tab === 'shared')
  if (notice) notice.style.display = tab === 'shared' ? 'block' : 'none'
  renderVFList()
}

function renderVFList() {
  const el    = document.getElementById('vf-file-list')
  if (!el) return
  const all   = (appState.vault && appState.vault.files) || []
  const files = all.filter(f => (f.visibility || 'private') === _vfTab)

  if (files.length === 0) {
    el.innerHTML = `
      <div class="menu-item menu-item-static">
        <div class="menu-icon">${_vfTab === 'private' ? '🔒' : '🌐'}</div>
        <div class="menu-text">
          <strong>No ${_vfTab} files yet</strong>
          <small>${_vfTab === 'private'
            ? 'Files you store here are yours alone'
            : 'Files shared with clusters appear here'}</small>
        </div>
      </div>`
    return
  }

  el.innerHTML = files.map((f, i) => {
    const isImage   = (f.mime || '').startsWith('image/') ||
                      (f.content || '').startsWith('data:image/')
    const icon      = isImage ? '🖼' : '📄'
    const otherTab  = _vfTab === 'private' ? 'shared' : 'private'
    const toggleLbl = _vfTab === 'private' ? 'Make shared' : 'Make private'
    const isReadonly = f.name === 'welcome.txt'
    return `
    <div class="vf-file-row" data-vf-index="${i}">
      <div class="vf-file-main" data-vf-index="${i}">
        <div class="menu-icon">${icon}</div>
        <div class="menu-text">
          <strong>${escHtmlP((f.name || f.path || 'untitled'))}</strong>
          <small>${f.date || '—'} · ${f.size || '—'}</small>
        </div>
        <span class="menu-arrow">›</span>
      </div>
      <div class="vf-file-actions">
        <button class="vf-action-btn" data-action="toggle" data-index="${i}"
          title="${toggleLbl}">
          ${_vfTab === 'private' ? '🌐' : '🔒'}
        </button>
        ${!isReadonly ? `
        <button class="vf-action-btn vf-action-delete" data-action="delete" data-index="${i}"
          title="Delete file">
          ✕
        </button>` : ''}
      </div>
    </div>`
  }).join('')

  // Attach click handlers
  el.querySelectorAll('.vf-file-main').forEach(row => {
    row.addEventListener('click', () => {
      openVFPad(parseInt(row.dataset.vfIndex, 10))
    })
  })
  el.querySelectorAll('[data-action="toggle"]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation()
      toggleFileVisibility(parseInt(btn.dataset.index, 10))
    })
  })
  el.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation()
      deleteVaultFile(parseInt(btn.dataset.index, 10))
    })
  })
}

async function toggleFileVisibility(index) {
  const vault = appState.vault
  const all   = (vault && vault.files) || []
  const files = all.filter(f => (f.visibility || 'private') === _vfTab)
  const f     = files[index]
  if (!f) return

  // Find the actual index in the full array
  const fullIdx = all.indexOf(f)
  if (fullIdx < 0) return

  vault.files[fullIdx].visibility = _vfTab === 'private' ? 'shared' : 'private'

  try {
    const newPayload = await saveVault(appState.vaultKey, vault, appState.stored.salt)
    await persist(newPayload)
    appState.stored = newPayload
    renderVFList()
    showToast(`Moved to ${vault.files[fullIdx].visibility} files`)
  } catch (err) {
    // Revert
    vault.files[fullIdx].visibility = _vfTab
    showToast('Could not update: ' + err.message)
  }
}

async function deleteVaultFile(index) {
  const vault = appState.vault
  const all   = (vault && vault.files) || []
  const files = all.filter(f => (f.visibility || 'private') === _vfTab)
  const f     = files[index]
  if (!f) return
  if (f.name === 'welcome.txt') { showToast('welcome.txt cannot be deleted'); return }

  const fullIdx = all.indexOf(f)
  if (fullIdx < 0) return

  vault.files.splice(fullIdx, 1)

  try {
    const newPayload = await saveVault(appState.vaultKey, vault, appState.stored.salt)
    await persist(newPayload)
    appState.stored = newPayload
    populateHome()
    renderVFList()
    showToast(`${f.name} deleted`)
  } catch (err) {
    // Revert
    vault.files.splice(fullIdx, 0, f)
    showToast('Could not delete: ' + err.message)
  }
}

function openVFPad(index) {
  const all   = (appState.vault && appState.vault.files) || []
  const files = all.filter(f => (f.visibility || 'private') === _vfTab)
  const f     = files[index]
  if (!f) return
  document.getElementById('vf-pad-name').textContent = (f.name || f.path || 'file')
  const contentEl = document.getElementById('vf-pad-content')
  const isImage   = (f.mime || '').startsWith('image/') ||
                    (f.content || '').startsWith('data:image/')
  if (isImage) {
    contentEl.innerHTML = `<img src="${f.content}" alt="${escHtmlP(f.name)}"
      style="max-width:100%;border-radius:8px;display:block;margin:0 auto;">`
  } else {
    contentEl.textContent = (f.content || '(empty)')
  }
  document.getElementById('vf-pad-overlay').classList.add('open')
}

function closeVFPad() {
  (document.getElementById('vf-pad-overlay') && document.getElementById('vf-pad-overlay').classList).remove('open')
}
