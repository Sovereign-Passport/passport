// SECTION 4 — ONBOARDING (CREATE NEW PASSPORT)
// Handle validation, password strength, vault generation, generating screen.
// Flow: screen-welcome → screen-handle → screen-password →
//       screen-generating → screen-created → screen-home
// ═════════════════════════════════════════════════════════════════════════════

function validateHandle() {
  const val     = document.getElementById('input-handle').value.trim()
  const btn     = document.getElementById('btn-handle-next')
  const notice  = document.getElementById('handle-notice')
  const ntext   = document.getElementById('handle-notice-text')

  const valid = /^[a-zA-Z0-9_\-\.]{2,32}$/.test(val)

  if (val.length === 0) {
    notice.style.display = 'none'
    btn.disabled = true
    return
  }

  if (!valid) {
    notice.style.display = 'flex'
    ntext.textContent = 'Handle must be 2–32 characters. Letters, numbers, _ - . only.'
    btn.disabled = true
    return
  }

  notice.style.display = 'none'
  btn.disabled = false
}


// ─────────────────────────────────────────────────────────────────────────────
// PASSWORD STRENGTH
// ─────────────────────────────────────────────────────────────────────────────

function checkPasswordStrength() {
  const pw    = document.getElementById('input-password').value
  const fill  = document.getElementById('strength-fill')
  const label = document.getElementById('strength-label')

  let score = 0
  if (pw.length >= 8)  score++
  if (pw.length >= 12) score++
  if (/[A-Z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++

  const levels = [
    {w:'0%',  c:'transparent', t:''},
    {w:'20%', c:'#c0392b',     t:'Very weak'},
    {w:'40%', c:'#e67e22',     t:'Weak'},
    {w:'60%', c:'#f1c40f',     t:'Fair'},
    {w:'80%', c:'#27ae60',     t:'Strong'},
    {w:'100%',c:'#c9a961',     t:'Very strong'},
  ]

  const l = levels[Math.min(score, 5)]
  fill.style.width      = l.w
  fill.style.background = l.c
  label.textContent     = l.t
  label.style.color     = l.c

  checkPasswordMatch()
}

function checkPasswordMatch() {
  const pw1  = document.getElementById('input-password').value
  const pw2  = document.getElementById('input-password-confirm').value
  const err  = document.getElementById('password-error')
  const etxt = document.getElementById('password-error-text')
  const btn  = document.getElementById('btn-password-next')

  if (!pw1) { btn.disabled = true; err.style.display='none'; return }

  if (pw2 && pw1 !== pw2) {
    err.style.display = 'flex'
    etxt.textContent  = 'Passwords do not match.'
    btn.disabled = true
    return
  }

  err.style.display = 'none'

  const score = [pw1.length>=8, pw1.length>=12, /[A-Z]/.test(pw1),
    /[0-9]/.test(pw1), /[^A-Za-z0-9]/.test(pw1)].filter(Boolean).length

  btn.disabled = !(pw2 && pw1 === pw2 && score >= 2)
}


// ─────────────────────────────────────────────────────────────────────────────
// IDENTITY GENERATION
// ─────────────────────────────────────────────────────────────────────────────

async function startGeneration() {
  const handle   = document.getElementById('input-handle').value.trim()
  const password = document.getElementById('input-password').value

  goTo('screen-generating')

  const steps = ['step-keys','step-did','step-vault','step-store']
  const delays = [0, 600, 1200, 1900]

  // Animate steps
  steps.forEach((id, i) => {
    setTimeout(() => {
      if (i > 0) document.getElementById(steps[i-1]).classList.replace('active','done')
      document.getElementById(id).classList.add('active')
    }, delays[i])
  })

  try {
    // Actual generation (happens in background while animation plays)
    const payload = await createVault(password, handle)
    await persist(payload)

    appState.stored = payload
    const {vault,vaultKey} = await unlockVault(
      password, payload.salt, payload.iv, payload.ciphertext
    )
    appState.vault    = vault
    appState.vaultKey = vaultKey

    // Wait for animation to complete
    setTimeout(() => {
      document.getElementById(steps[steps.length-1]).classList.replace('active','done')
      setTimeout(() => {
        document.getElementById('display-did').textContent = vault.identity.id
        goTo('screen-created')
      }, 400)
    }, 2400)

  } catch (err) {
    console.error('Generation failed:', err)
    showToast('Generation failed. Please try again.')
    goTo('screen-password')
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// UNLOCK (returning user)
// ═════════════════════════════════════════════════════════════════════════════
// SECTION 5 — UNLOCK (RETURNING USER)
// tryUnlock() — decrypts vault with password, boots into home screen.
// Handles pending offer and pending sync token after unlock.
// ═════════════════════════════════════════════════════════════════════════════

async function tryUnlock() {
  const password = document.getElementById('input-unlock-password').value
  const err      = document.getElementById('unlock-error')
  const btn      = document.getElementById('btn-unlock')

  if (!password) return

  btn.textContent = 'Unlocking...'
  btn.disabled    = true
  err.style.display = 'none'

  try {
    // Safety check — appState.stored must be populated from IndexedDB
    // If it's null, reload from IndexedDB before attempting unlock
    if (!appState.stored) {
      appState.stored = await loadStored()
    }

    if (!appState.stored) {
      // No vault found at all — send to welcome screen
      console.warn('[Unlock] No vault found in IndexedDB')
      goTo('screen-welcome')
      return
    }

    const {vault, vaultKey} = await unlockVault(
      password,
      appState.stored.salt,
      appState.stored.iv,
      appState.stored.ciphertext
    )

    appState.vault    = vault
    appState.vaultKey = vaultKey
    populateHome()
    checkPendingOffer()
    checkPendingApproval()
    checkPendingDecision()
    checkPendingRevoke()
    checkPendingNewCluster()
    checkPendingInvite()

    // If a sync token was waiting, route to restore screen sync tab
    if (appState.pendingSyncToken) {
      const token = appState.pendingSyncToken
      appState.pendingSyncToken = null
      goTo('screen-restore')
      requestAnimationFrame(() => {
        switchRestoreTab('sync')
        const input = document.getElementById('input-sync-link')
        if (input) input.value = `${SYNC_ENDPOINT}/${token}`
        showToast('Enter your password to complete restore')
      })
    } else {
      goTo('screen-home')
    }

  } catch (e) {
    // Log real error to console
    console.error('[Unlock] Failed:', (e.code || e.message), e)

    err.style.display = 'flex'
    btn.textContent   = 'Unlock →'
    btn.disabled      = false
    document.getElementById('input-unlock-password').value = ''
    document.getElementById('input-unlock-password').focus()
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// HOME SCREEN
// ═════════════════════════════════════════════════════════════════════════════
// SECTION 6 — HOME SCREEN
// populateHome() — renders handle, counts, menu items from vault state.
// showDID() — copies and displays the grape's passport address.
// ═════════════════════════════════════════════════════════════════════════════

function populateHome() {
  const v = appState.vault
  if (!v) return
  const handle = v.identity.handle

  document.getElementById('home-handle').textContent = handle

  // Settings handle display
  const sh = document.getElementById('settings-handle-display')
  if (sh) sh.textContent = handle

  // Memberships count — ONLY Vines/Vignards actually shown in My Memberships.
  // Clusters (founded or joined) are never counted here.
  const allCreds = (v.credentials || [])
  const vineCreds = allCreds.filter(c =>
    c.type === 'MembershipCredential' && c.scope !== 'cluster' && c.scope !== 'vignard')
  const seenVine = {}
  const vineCount = vineCreds.filter(c => {
    if (c.issuer_did) { if (seenVine[c.issuer_did]) return false; seenVine[c.issuer_did] = true }
    return true
  }).length
  const vignardCount = allCreds.filter(c =>
    c.type === 'MembershipCredential' && c.scope === 'vignard' &&
    (c.issuer_did || c.vignard_did)).length
  const legacyCount = (v.memberships || [])
    .filter(m => !m.cluster_id)
    .filter(m => !vineCreds.some(c => c.node_id === m.node_id)).length
  const credCount = vineCount + vignardCount + legacyCount
  document.getElementById('cred-count').textContent =
    `${credCount} membership${credCount !== 1 ? 's' : ''}`

  // Clusters count (Communities I Own)
  const nodeCount = (v.ownClusters || []).length
  document.getElementById('nodes-count').textContent =
    nodeCount > 0
      ? `${nodeCount} cluster${nodeCount !== 1 ? 's' : ''} — free forever`
      : '0 clusters — free forever'

  // Vault files count
  const fileCount = (v.files || []).length
  document.getElementById('vault-file-count').textContent =
    `${fileCount} file${fileCount !== 1 ? 's' : ''}`

  // DID short
  const did = v.identity.id
  document.getElementById('did-short').textContent =
    did.slice(0,16) + '…' + did.slice(-8)

  // Health summary
  const issues = []
  if (credCount === 0) issues.push('no memberships yet')
  document.getElementById('health-summary').textContent =
    issues.length === 0 ? 'All good ✓' : issues.join(' · ')

  // Health screen — only update if on health screen
  const hDid   = document.getElementById('h-did')
  const hCreds  = document.getElementById('h-creds')
  const hCredsB = document.getElementById('h-creds-badge')
  const hFiles  = document.getElementById('h-files')
  const hFilesB = document.getElementById('h-files-badge')
  try {
    if (hDid)    hDid.textContent    = did.slice(0,20) + '…'
    if (hCreds)  hCreds.textContent  = `${credCount} membership credential${credCount !== 1 ? 's' : ''}`
    if (hCredsB) hCredsB.textContent = `${credCount}`
    if (hFiles)  hFiles.textContent  = `${fileCount} file${fileCount !== 1 ? 's' : ''} in vault`
    if (hFilesB) hFilesB.textContent = `${fileCount}`
  } catch(e) { console.warn('[populateHome] health section:', e) }
}


// ═════════════════════════════════════════════════════════════════════════════



// ─────────────────────────────────────────────────────────────────────────────
// MY CLUSTERS — screen-nodes
// Shows all cluster memberships stored in vault.memberships
// ─────────────────────────────────────────────────────────────────────────────

/** Shared Billboard portal URL for a canonical Cluster UUID (UI preference only). */
function billboardUrl(clusterId) {
  return 'https://sovereign-passport.github.io/portail/portail.html#service=billboard&cluster=' +
    encodeURIComponent(String(clusterId))
}

/**
 * Open the clusters screen.
 * Reads vault.credentials (type MembershipCredential) as primary source.
 * Falls back to vault.memberships for passports predating the migration.
 */
function openNodes() {
  const vault      = appState.vault
  const list       = document.getElementById('nodes-list')
  const empty      = document.getElementById('nodes-empty')
  const ownClusters = ((vault && vault.ownClusters) || [])
    .filter(c => c.id && c.name && c.founder_did)

  // Joined Clusters ONLY — canonical cluster_id, never a Vine, never a founder.
  const allCreds = ((vault && vault.credentials) || [])
  const ownIds   = new Set(ownClusters.map(c => c.id))
  // A Cluster we hold an ownership proof for is FOUNDED, never "joined".
  const ownerIds = new Set()
  allCreds.forEach(c => {
    if (c.type === 'ClusterOwnerCredential' && c.cluster_id) ownerIds.add(c.cluster_id)
    if (c.type === 'FounderCredential') {
      const cid = c.cluster_id || (c.claims && c.claims.cluster_id)
      if (cid) ownerIds.add(cid)
    }
  })
  const clusterCandidates = [
    ...((vault && vault.memberships) || []).filter(m => m.cluster_id),
    ...allCreds.filter(c =>
      (c.type === 'MembershipCredential' && c.scope === 'cluster' && c.cluster_id) ||
      (c.type === 'GrapeClusterCredential' && c.cluster_id)),
  ]
  const seenJoined = {}
  const memberships = clusterCandidates.filter(m => {
    const cid = m.cluster_id
    if (!cid || ownIds.has(cid) || ownerIds.has(cid) || seenJoined[cid]) return false
    seenJoined[cid] = true
    return true
  })

  list.innerHTML = ''

  if (ownClusters.length === 0 && memberships.length === 0) {
    empty.style.display = 'block'
    list.style.display  = 'none'
  } else {
    empty.style.display = 'none'
    list.style.display  = 'block'

    // Owned clusters — founder view
    if (ownClusters.length > 0) {
      const ownLabel = document.createElement('p')
      ownLabel.className   = 'section-label'
      ownLabel.textContent = 'Clusters I Founded'
      ownLabel.style.marginTop = '8px'
      list.appendChild(ownLabel)

      ownClusters.forEach((c, i) => {
        const memberCount = ((c.members && c.members.length) || 0) + 1
        const isLeft      = c.status === 'left'
        const card = document.createElement('div')
        card.className = 'cred-card'
        card.style.marginBottom = '12px'
        card.innerHTML = `
          <p class="cred-type">${
            isLeft
              ? 'FOUNDER · AWAY'
              : c.status === 'pre-vine'
                ? 'FOUNDER · 🌱 PRE-VINE'
                : 'FOUNDER'
          }</p>
          <div class="cred-title">${escHtmlP(c.name)}</div>
          <div class="cred-sub" style="font-size:11px;color:var(--ink-dim);margin-top:4px;">
            ${escHtmlP(c.description || '')}
          </div>
          <div class="cred-meta" style="margin-top:12px;">
            <div class="cred-meta-item">
              Founded <span>${c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}</span>
            </div>
            <div class="cred-meta-item">
              Members <span>${memberCount}</span>
            </div>
            <div class="cred-meta-item">
              Health <span class="pm-slot" data-marker-slot></span>
            </div>
          </div>
          <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">
            ${isLeft ? `
              <button class="btn btn-ghost" style="flex:1;font-size:11px;"
                onclick="rejoinCluster('${c.id}')">
                Rejoin as Founder
              </button>
            ` : `
              <button class="btn btn-ghost" style="flex:1;font-size:11px;"
                onclick="openInviteFromCluster('${c.id}')">
                Invite a Grape
              </button>
              <button class="btn btn-ghost" style="font-size:11px;"
                onclick="softLeaveCluster('${c.id}')">
                Leave
              </button>
            `}
            <button class="btn btn-ghost" style="font-size:11px;color:var(--red);"
              onclick="confirmLeaveCluster('${c.id}')">
              Delete
            </button>
            <a class="btn btn-ghost" style="font-size:11px;text-decoration:none;flex:1;"
               href="${billboardUrl(c.id)}" target="_blank" rel="noopener">Billboard</a>
          </div>
        `
        // Personal markers — private, non-actionable (Cluster scope only).
        const slot = card.querySelector('[data-marker-slot]')
        if (slot) slot.appendChild(buildPersonalMarkers('cluster', c.id, openNodes))
        list.appendChild(card)
      })
    }

    // Memberships — member view
    if (memberships.length > 0) {
      const memLabel = document.createElement('p')
      memLabel.className   = 'section-label'
      memLabel.textContent = 'Clusters I Joined'
      memLabel.style.marginTop = '16px'
      list.appendChild(memLabel)

      memberships.forEach(m => {
        const card = document.createElement('div')
        card.className = 'cred-card'
        card.style.marginBottom = '12px'

        const status     = m.status || null            // null = vine credential
        const isLeft     = status === 'left'
        const isPending  = status === 'invited' || status === 'candidate' || status === 'temporary'
        const isTerminal = status === 'suspended' || status === 'revoked' || status === 'removed'
        const statusText = isLeft ? 'MEMBER · AWAY' : (status ? status.toUpperCase() : 'MEMBER')
        const title      = escHtmlP(m.node_name || m.cluster_name || m.node_id || m.cluster_id || 'Unknown cluster')
        // Every Joined card here is a canonical Cluster (cluster_id present).
        const markerScope = 'cluster'
        const markerId    = m.cluster_id

        card.innerHTML = `
          <p class="cred-type">${statusText}</p>
          <div class="cred-title">${title}</div>
          ${isPending ? '<div style="margin-top:6px;"><span class="badge badge-gold">Pending approval</span></div>' : ''}
          <div class="cred-meta" style="margin-top:12px;">
            <div class="cred-meta-item">
              Joined <span>${(m.joined_at || m.issued_at) ? new Date((m.joined_at || m.issued_at)).toLocaleDateString() : '—'}</span>
            </div>
            ${markerScope ? '<div class="cred-meta-item">Health <span class="pm-slot" data-marker-slot></span></div>' : ''}
          </div>
        `

        if (isPending) {
          // Pending Cluster invitation: offer a manual check when an endpoint
          // is known. Never invent an endpoint, never show a dead button.
          if (m.vine_endpoint) {
            const checkBtn = document.createElement('button')
            checkBtn.className     = 'btn btn-primary'
            checkBtn.style.cssText = 'font-size:11px;margin-top:12px;'
            checkBtn.textContent   = 'Check approval'
            checkBtn.addEventListener('click', () => checkClusterApproval(m, checkBtn))
            card.appendChild(checkBtn)
          } else {
            const note = document.createElement('p')
            note.style.cssText = 'font-size:11px;color:var(--ink-dim);margin-top:8px;'
            note.textContent = 'Approval endpoint unavailable'
            card.appendChild(note)
          }
        } else if (isLeft) {
          const note = document.createElement('p')
          note.style.cssText = 'font-size:11px;color:var(--ink-dim);margin-top:8px;'
          note.textContent = 'You left this cluster. Your credential remains as a personal record. Rejoin by requesting a new invite from the founder.'
          card.appendChild(note)
        } else {
          // Approved / suspended / terminal: never offer a misleading Leave or
          // Rejoin. A single manual "Check updates" recovers any still-pending
          // decision when an endpoint is known.
          const actions = document.createElement('div')
          actions.style.cssText = 'display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;'

          if (m.vine_endpoint) {
            const updBtn = document.createElement('button')
            updBtn.className      = 'btn btn-ghost'
            updBtn.style.fontSize = '11px'
            updBtn.textContent    = 'Check updates'
            updBtn.addEventListener('click', () => checkClusterUpdates(m, updBtn))
            actions.appendChild(updBtn)
          }

          if (!isTerminal) {
            const leaveBtn = document.createElement('button')
            leaveBtn.className      = 'btn btn-ghost'
            leaveBtn.style.fontSize = '11px'
            leaveBtn.textContent    = 'Leave'
            leaveBtn.addEventListener('click', () => softLeaveMembership(m.id || m.node_id))
            actions.appendChild(leaveBtn)
          }

          if (actions.children.length) card.appendChild(actions)
        }

        // Billboard link — opens the shared portal on this Cluster (real cluster_id).
        const bbLink = document.createElement('a')
        bbLink.className = 'btn btn-ghost'
        bbLink.style.cssText = 'font-size:11px;text-decoration:none;margin-top:8px;display:inline-block;'
        bbLink.href = billboardUrl(m.cluster_id)
        bbLink.target = '_blank'
        bbLink.rel = 'noopener'
        bbLink.textContent = 'Billboard'
        card.appendChild(bbLink)

        // Personal markers — private, non-actionable (Cluster scope only).
        const markerSlot = card.querySelector('[data-marker-slot]')
        if (markerScope && markerSlot) markerSlot.appendChild(buildPersonalMarkers(markerScope, markerId, openNodes))

        list.appendChild(card)
      })
    }

    // Always show create button at bottom
    const createBtn = document.createElement('button')
    createBtn.className   = 'btn btn-ghost'
    createBtn.style.marginTop = '16px'
    createBtn.textContent = '+ Start a new cluster'
    createBtn.addEventListener('click', () => goTo('screen-create-cluster'))
    list.appendChild(createBtn)
  }

  goTo('screen-nodes')
}


/**
 * Manual Cluster claim action (approval or updates).
 * Reuses claimClusterApprovals(); disables the button to avoid double calls.
 * Never corrupts local data: claimClusterApprovals restores its snapshot on
 * a failed save, and a network failure returns before any mutation.
 *
 * @param {Object} membership
 * @param {HTMLElement} btn
 * @param {'approval'|'updates'} kind
 */
async function _runClusterClaim(membership, btn, kind) {
  const idle = kind === 'updates' ? 'Check updates' : 'Check approval'
  if (btn && btn.disabled) return                    // single active request
  if (!membership || !membership.vine_endpoint) {
    showToast('Approval endpoint unavailable')
    return
  }
  if (btn) { btn.disabled = true; btn.textContent = 'Checking…' }
  try {
    const r = await claimClusterApprovals(membership.vine_endpoint)
    if (!r || !r.ok) {
      showToast(r && r.error === 'SAVE_FAILED'
        ? 'Could not save locally.'
        : 'Could not check for updates.')
      if (btn) { btn.disabled = false; btn.textContent = idle }
      return
    }
    if (!r.stored || r.stored.length === 0) {
      showToast(kind === 'updates' ? 'No updates available yet.' : 'No approval available yet.')
      if (btn) { btn.disabled = false; btn.textContent = idle }
      return
    }
    showToast(kind === 'updates' ? 'Cluster updates received ✓' : 'Cluster approval received ✓')
    openNodes()        // refresh My Clusters
    populateHome()     // refresh counters + cred-count
  } catch (e) {
    showToast('Could not check for updates.')
    if (btn) { btn.disabled = false; btn.textContent = idle }
  }
}

/** Manual "Check approval" for a pending Cluster membership. */
async function checkClusterApproval(membership, btn) {
  return _runClusterClaim(membership, btn, 'approval')
}

/** Manual "Check updates" for an established/terminal Cluster membership. */
async function checkClusterUpdates(membership, btn) {
  return _runClusterClaim(membership, btn, 'updates')
}


// ─────────────────────────────────────────────────────────────────────────────
// MY CREDENTIALS — screen-credentials
// Shows all SD-JWT credentials stored in vault.credentials
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Open the credentials screen.
 * Reads vault.credentials and renders a card for each one.
 * Tapping a card copies the SD-JWT to clipboard.
 */

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 9 — MY MEMBERSHIPS (screen-credentials)
// Vines / Vignards ONLY. Clusters (founded or joined) live in My Clusters.
//   MembershipCredential scope!=cluster,vignard → VINE MEMBERSHIP
//   MembershipCredential scope===vignard        → VIGNARD MEMBERSHIP
//   legacy vault.memberships without cluster_id → LEGACY VINE MEMBERSHIP
// ═════════════════════════════════════════════════════════════════════════════

function openCredentials() {
  const vault    = appState.vault
  const list     = document.getElementById('credentials-list')
  const empty    = document.getElementById('credentials-empty')
  const allCreds = (vault && vault.credentials) || []

  // My Memberships = Vines / Vignards ONLY — never a Cluster, never a Founder.
  const vineCreds = allCreds.filter(c =>
    c.type === 'MembershipCredential' && c.scope !== 'cluster' && c.scope !== 'vignard')
  const vignardCreds = allCreds.filter(c =>
    c.type === 'MembershipCredential' && c.scope === 'vignard' &&
    (c.issuer_did || c.vignard_did))
  const legacyMembers = ((vault && vault.memberships) || [])
    .filter(m => !m.cluster_id)
    .filter(m => !vineCreds.some(c => c.node_id === m.node_id))

  // Deduplicate canonical Vines by issuer_did.
  const seenVine = {}
  const vineList = vineCreds.filter(c => {
    if (c.issuer_did) { if (seenVine[c.issuer_did]) return false; seenVine[c.issuer_did] = true }
    return true
  })

  const items = [
    ...vineList.map(c     => ({ kind: 'vine',    cred: c, idx: allCreds.indexOf(c) })),
    ...vignardCreds.map(c => ({ kind: 'vignard', cred: c, idx: allCreds.indexOf(c) })),
    ...legacyMembers.map(m=> ({ kind: 'legacy',  cred: m, idx: -1 })),
  ]

  list.innerHTML = ''
  document.getElementById('cred-count').textContent =
    `${items.length} membership${items.length !== 1 ? 's' : ''}`

  if (items.length === 0) {
    empty.style.display = 'block'
    list.style.display  = 'none'
  } else {
    empty.style.display = 'none'
    list.style.display  = 'block'

    items.forEach(item => {
      const c    = item.cred
      const idx  = item.idx
      const card = document.createElement('div')
      card.className = 'cred-card'
      card.style.marginBottom = '12px'

      let typeLabel, title, issuerLine
      let markerScope = null
      let markerId    = null

      if (item.kind === 'vine') {
        typeLabel  = 'VINE MEMBERSHIP'
        title      = c.node_name || c.issuer_did || 'Vine'
        issuerLine = c.issuer_did || ''
        if (c.issuer_did) { markerScope = 'vine'; markerId = c.issuer_did }
      } else if (item.kind === 'vignard') {
        typeLabel  = 'VIGNARD MEMBERSHIP'
        title      = c.node_name || c.issuer_did || c.vignard_did || 'Vignard'
        issuerLine = c.issuer_did || c.vignard_did || ''
        const vid  = c.issuer_did || c.vignard_did
        if (vid) { markerScope = 'vignard'; markerId = vid }
      } else {
        // Legacy Vine membership without a canonical DID → no markers.
        typeLabel  = 'LEGACY VINE MEMBERSHIP'
        title      = c.node_name || c.node_id || 'Vine'
        issuerLine = c.node_id || ''
      }

      const expiry = c.expires_at
        ? new Date(c.expires_at).toLocaleDateString()
        : 'No expiry'

      const revokedBadge = c.revoked
        ? `<span class="badge" style="background:rgba(192,57,43,0.1);
            color:var(--red);border:1px solid rgba(192,57,43,0.3);">✗ Revoked</span>`
        : `<span class="badge badge-green">✓ Valid</span>`

      // SD-JWT actions only when a real credential is present.
      const hasSdJwt = !!c.sd_jwt && idx >= 0
      const actions = hasSdJwt ? `
        <div style="margin-top:12px;display:flex;gap:8px;">
          <button class="btn btn-primary"
            onclick="copyCredential(${idx})"
            style="flex:1;padding:8px;">
            Copy credential
          </button>
          <button class="btn btn-ghost"
            onclick="presentCredential(${idx})"
            style="flex:1;padding:8px;">
            Present QR
          </button>
        </div>` : ''

      card.innerHTML = `
        <p class="cred-type">${escHtmlP(typeLabel)}</p>
        <div class="cred-title">${escHtmlP(title)}</div>
        <div class="cred-sub" style="font-size:10px;word-break:break-all;color:var(--ink-dim);">
          ${escHtmlP(issuerLine)}
        </div>
        <div class="cred-meta" style="margin-top:12px;">
          <div class="cred-meta-item">
            Issued <span>${c.issued_at ? new Date(c.issued_at).toLocaleDateString() : '—'}</span>
          </div>
          <div class="cred-meta-item">
            Expires <span>${expiry}</span>
          </div>
          ${markerScope ? '<div class="cred-meta-item">Health <span class="pm-slot" data-marker-slot></span></div>' : ''}
        </div>
        <div style="display:flex;gap:8px;margin-top:12px;">
          ${revokedBadge}
        </div>
        ${actions}
      `

      const slot = card.querySelector('[data-marker-slot]')
      if (slot && markerScope) slot.appendChild(buildPersonalMarkers(markerScope, markerId, openCredentials))

      list.appendChild(card)
    })
  }

  goTo('screen-credentials')
}

/**
 * Copy a credential's SD-JWT to clipboard.
 * @param {number} idx - index in vault.credentials
 */
function copyCredential(idx) {
  const cred = (appState.vault && appState.vault.credentials && appState.vault.credentials[idx])
  if (!(cred && cred.sd_jwt)) return
  if(navigator.clipboard) navigator.clipboard.writeText(cred.sd_jwt)
    .then(() => showToast('Credential copied'))
    .catch(() => showToast('Copy failed — open browser console to get SD-JWT'))
  console.log('[Credential] SD-JWT:', cred.sd_jwt)
}

/**
 * Present a credential as a QR code.
 * For now — copies the SD-JWT and shows a toast with instructions.
 * Full QR presentation screen comes in next build.
 * @param {number} idx - index in vault.credentials
 */
function presentCredential(idx) {
  const cred = (appState.vault && appState.vault.credentials && appState.vault.credentials[idx])
  if (!(cred && cred.sd_jwt)) return
  // Copy credential and instruct user to paste in verifier
  if(navigator.clipboard) navigator.clipboard.writeText(cred.sd_jwt)
  showToast('SD-JWT copied — paste at mdusl.sovereign-passport.id/verify')
}


// ─────────────────────────────────────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════

function openAbout() {
  const body = document.getElementById('about-body')
  if (body && !body.dataset.loaded) {
    body.innerHTML = renderAboutContent()
    body.dataset.loaded = '1'
  }
  document.getElementById('about-overlay').classList.add('open')
}

function closeAbout() {
  document.getElementById('about-overlay').classList.remove('open')
}

function renderAboutContent() {
  // Render the welcome text as clean HTML
  const sections = [
    { h: 'Your identity. In your pocket.', body: `This app lives on your phone — not on a server, not in a cloud. On your phone.\n\nEverything here — your identity, your files, your community memberships — is encrypted and stored only on this device.\n\nNo company holds your data. No account was created anywhere. You are the only one with the key.` },
    { h: 'Start with the basics', body: `<strong>Add this app to your home screen.</strong>\nTap the share button in your browser, then "Add to Home Screen." It opens like any other app — no app store, no install.\n\n<strong>Download your backup right away.</strong>\nSettings → Download Backup. Save that file somewhere safe. If you lose your phone and have no backup, your passport is gone. It takes thirty seconds.\n\n<strong>Your password is your key.</strong>\nThere is no "forgot password." Write it somewhere. Protect it like a house key.` },
    { h: 'Why use a Passport?', body: `Because your identity should belong to you.\n\nNot to a platform that can ban you. Not to a company that sells your habits. Not to a service that disappears when the funding runs out.\n\nYour Passport travels with you. It answers to no one but you.` },
    { h: 'Invite your friends. Start a cluster.', body: `A cluster is just a gathering — your family, your friends, your chess group, your garden collective, your neighbourhood.\n\nInvite someone with a single link. They tap it, create their own Passport, and they are in.\n\nNo forms. No approvals. No middleman. Just you, vouching for someone you know.\n\nEvery invitation is a small act of trust.` },
    { h: 'Your vault', body: `Keep anything you want close and safe — notes, photos, documents.\n\nExport your backup, restore it on another phone or your laptop, and your files come with you.\n\nPrivate files never leave your vault. Shared files go only to the people you choose. You decide. Every time.` },
    { h: 'What is coming', body: `<strong>Cluster calendar</strong> — keep your community's rhythm without surrendering it to big tech.\n\n<strong>AI agent</strong> — a quiet helper that knows your community and your files. Never decides for you. Always assists. Always yours.\n\n<strong>Vine network</strong> — when your cluster is ready to grow, officialize it and federate with other communities.` },
    { h: 'This is just the beginning', body: `Your data. Your peace of mind. Your world.\nWith a little help from people you trust —\nand, gently, from AI that works for you.\n\nNo rush. No pressure. The community is here when you are ready.` },
  ]

  let html = sections.map(s => `
    <h2>${s.h}</h2>
    <p style="white-space:pre-wrap;margin-bottom:8px;">${s.body}</p>
    <hr>
  `).join('')

  html += `<p style="text-align:center;font-size:11px;color:var(--ink-dim);margin-top:16px;letter-spacing:0.1em;">
    <em>Your identity. Your vault. Your community.</em><br>
    Salted. Signed. Alive. 🍇<br><br>
    Built in Saint-Léon-de-Standon, Quebec, Canada.<br>
    © 2026 JF Bertrand — Sovereign Passport ID
  </p>`

  return html
}
// ─────────────────────────────────────────────────────────────────────────────

async function boot() {
  // Push initial history entry so popstate has something to catch
  history.pushState({ screen: 'boot' }, '', location.href)

  // Show orb on welcome by default — goTo will update it from there
  const orb = document.getElementById('about-orb')
  if (orb) orb.classList.add('visible')

  // Check for existing vault
  const stored = await loadStored().catch(() => null)

  // Support ?offer= (direct) and #offer= (GitHub Pages — hash not stripped by server)
  const params     = new URLSearchParams(window.location.search)
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const offerUrl   = params.get('offer') || hashParams.get('offer')
  const offerData  = params.get('r')     || hashParams.get('r')
  const offerRef   = params.get('ref')   || hashParams.get('ref')
  const syncToken  = params.get('sync')  || hashParams.get('sync')
  // Public signed-approval demand: passport.html#approve=<base64url(payload)>
  const approveRaw = params.get('approve') || hashParams.get('approve')
  if (approveRaw) appState.pendingApproveRaw = approveRaw
  // Public signed-decision demand: passport.html#decision=<base64url(payload)>
  const decisionRaw = params.get('decision') || hashParams.get('decision')
  if (decisionRaw) appState.pendingDecisionRaw = decisionRaw
  // Public signed cluster-deletion demand: passport.html#revoke=<base64url(payload)>
  const revokeRaw = params.get('revoke') || hashParams.get('revoke')
  if (revokeRaw) appState.pendingRevokeRaw = revokeRaw
  // Signed-flow hand-offs from the SPID dashboard.
  const newClusterRaw = params.get('newcluster') || hashParams.get('newcluster')
  const inviteRaw     = params.get('invite')     || hashParams.get('invite')
  if (newClusterRaw) appState.pendingNewClusterRaw = newClusterRaw
  if (inviteRaw)     appState.pendingInviteRaw      = inviteRaw

  if (stored) {
    appState.stored = stored
    document.getElementById('unlock-handle-display').textContent =
      `DID: ${stored.did ? stored.did.slice(0,20) : ""}…`

    if (offerUrl || offerData) {
      // Store offer URL for after unlock
      appState.pendingOfferUrl  = offerUrl
      appState.pendingOfferData = offerData
      appState.pendingOfferRef  = offerRef
      showToast('Credential offer waiting — unlock your Passport')
    }

    if (syncToken) {
      appState.pendingSyncToken = syncToken
      showToast('Sync link detected — unlock your Passport to restore')
    }

    goTo('screen-unlock')

  } else if (syncToken) {
    // New device — go straight to restore, sync tab pre-filled
    appState.pendingSyncToken = syncToken
    goTo('screen-restore')
    requestAnimationFrame(() => {
      switchRestoreTab('sync')
      const input = document.getElementById('input-sync-link')
      if (input) input.value = `${SYNC_ENDPOINT}/${syncToken}`
    })

  } else if (offerUrl || offerData) {
    // New user — create passport first, then handle offer
    appState.pendingOfferUrl  = offerUrl
    appState.pendingOfferData = offerData
    appState.pendingOfferRef  = offerRef
    showToast('Create your Passport to accept this credential')
    goTo('screen-welcome')

  } else {
    // Fresh new grape — no vault, no offer, no sync
    goTo('screen-welcome')
  }

  // iOS install banner
  if (isIOS() && !isInStandaloneMode()) {
    setTimeout(() => {
      document.getElementById('install-banner').classList.add('show')
    }, 3000)
  }
}

// Override populateHome to also trigger pending offers
// ─────────────────────────────────────────────────────────────────────────────
// PENDING OFFER CHECK
// Called after vault is unlocked (from tryUnlock and tryRestore).
// Checks if a credential offer was waiting and triggers it.
// Kept separate from populateHome() to avoid recursive override patterns.
// ─────────────────────────────────────────────────────────────────────────────
function checkPendingOffer() {
  if (appState.pendingOfferUrl) {
    const url = appState.pendingOfferUrl
    const ref = appState.pendingOfferRef
    appState.pendingOfferUrl = null
    appState.pendingOfferRef = null
    setTimeout(() => loadOffer(url, ref), 500)
  } else if (appState.pendingOfferData) {
    // pendingOfferData is a raw offer JSON string (not a URL)
    // Only parse if it looks like JSON, not a URL or ref token
    const data = appState.pendingOfferData
    appState.pendingOfferData = null
    try {
      const offer = JSON.parse(data)
      _pendingOffer = offer
      document.getElementById('offer-node-name').textContent  = (offer.node_name || offer.node_id)
      document.getElementById('offer-issuer-did').textContent = offer.issuer
      setTimeout(() => goTo('screen-offer'), 500)
    } catch(e) {
      // Not JSON — ignore silently (was a ref token or malformed data)
      console.warn('[SPID] pendingOfferData was not valid JSON — ignored')
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// URL HASH LISTENER
// Re-runs boot() when the hash changes — handles the case where the user
// is already on the page and a new #offer= link is tapped or pasted.
// This is needed because GitHub Pages and static hosts strip query strings
// but preserve the hash fragment, so we use #offer= for offer delivery.
// ─────────────────────────────────────────────────────────────────────────────
window.addEventListener('hashchange', () => {
  // Only re-run if there's actually an offer in the new hash
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  if (hashParams.get('offer') || hashParams.get('r') || hashParams.get('approve') ||
      hashParams.get('decision') ||
      hashParams.get('newcluster') || hashParams.get('invite')) {
    boot()
  }
})

boot()
