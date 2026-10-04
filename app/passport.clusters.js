/*
 * PASSPORT — Sovereign Identity System
 * passport.clusters.js — §10a GRAPE CLUSTERS
 *
 * Personal community groups — no server required.
 * The grape creates and manages clusters entirely within their vault.
 *
 * Responsibilities:
 *   validateCreateCluster() — form validation
 *   createCluster()         — self-issues FounderCredential, pings vignard
 *   pingVignard()           — fire-and-forget witness registration
 *   openInviteFromCluster() — routes to invite screen with cluster pre-selected
 *   confirmLeaveCluster()   — modal: leave or dissolve
 *   softLeaveCluster()      — sets status 'left', keeps cluster in vault
 *   rejoinCluster()         — restores status 'active'
 *   softLeaveMembership()   — leave a vine membership
 *   _executeClusterDelete() — internal: permanent cluster removal
 *   leaveCluster()          — soft succession to highest-weight member
 *   dissolveCluster()       — permanent delete, no members
 *
 * Dependencies: passport.crypto.js, passport.state.js
 * VPS: pingVignard() calls mdusl vignard endpoint (fire and forget)
 */

// SECTION 10 — GRAPE CLUSTERS
// Personal community groups — no server required.
// createCluster() — self-issues FounderCredential, pings vignard witness.
// openNodes() — renders ownClusters (founder view) + memberships (member view).
// softLeaveCluster() — sets status 'left', keeps cluster in vault.
// rejoinCluster() — restores status 'active'.
// confirmLeaveCluster() — shows modal then routes to leaveCluster or dissolve.
// leaveCluster() — soft succession to highest-weight member.
// dissolveCluster() — permanent delete, no members.
// pingVignard() — fire-and-forget witness registration on mdusl VPS.
//   Sets pre-vine flag silently when member count >= 3.
// ═════════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────
// GRAPE CLUSTERS — screen-create-cluster
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate the create cluster form.
 * Enables the Found button when name is filled.
 */
function validateCreateCluster() {
  const name = (document.getElementById('create-cluster-name') && document.getElementById('create-cluster-name').value).trim()
  const btn  = document.getElementById('btn-create-cluster')
  const err  = document.getElementById('create-cluster-error')
  if (err) err.style.display = 'none'
  if (btn) btn.disabled = !name
}

/**
 * Create a new grape cluster.
 * - Generates a cluster ID
 * - Stores in vault.ownClusters
 * - Self-issues a FounderCredential into vault.credentials
 * - Pings vignard witness (fire and forget)
 * - Pre-vine flag when memberCount >= 3
 */
async function createCluster() {
  const nameEl = document.getElementById('create-cluster-name')
  const descEl = document.getElementById('create-cluster-desc')
  const errEl  = document.getElementById('create-cluster-error')
  const errTxt = document.getElementById('create-cluster-error-text')
  const btn    = document.getElementById('btn-create-cluster')

  const name = (nameEl && nameEl.value).trim()
  const desc = (descEl && descEl.value).trim() || ''

  if (!name) return

  btn.disabled    = true
  btn.textContent = 'Founding…'

  try {
    const vault      = appState.vault
    const identity   = vault.identity
    const founderDid = identity.id
    const clusterId  = crypto.randomUUID()
    const now        = new Date().toISOString()

    // Endpoint is per-Cluster (from #newcluster). Absent → local-only Cluster.
    const clusterEndpoint = (typeof normalizeVineEndpoint === 'function')
      ? normalizeVineEndpoint(appState.pendingClusterEndpoint) : null

    // Build cluster record
    const cluster = {
      id:            clusterId,
      name,
      description:   desc,
      founder_did:   founderDid,
      vine_endpoint: clusterEndpoint || null,
      vignard_did:   null,          // stays null — vine_endpoint is the only link
      members:       [],
      status:        'active',
      created_at:    now,
      weight_events: [],
    }

    // Self-issue a FounderCredential into vault.credentials
    const founderCredential = {
      id:          `founder:${clusterId}`,
      type:        'FounderCredential',
      cluster_id:  clusterId,
      cluster_name: name,
      issuer_did:  founderDid,    // self-issued
      subject:     founderDid,
      issued_at:   now,
      claims: {
        cluster_id:   clusterId,
        cluster_name: name,
        description:  desc,
        role:         'founder',
      },
    }

    // Sign the credential with the grape's own key
    const privateKey = await crypto.subtle.importKey(
      'jwk', vault.keys.privateKey, { name: 'Ed25519' }, false, ['sign']
    )
    const sigData  = JSON.stringify(founderCredential.claims)
    const sigBuf   = await crypto.subtle.sign(
      'Ed25519', privateKey, new TextEncoder().encode(sigData)
    )
    founderCredential.signature = toB64(sigBuf)

    // Store in vault
    if (!vault.ownClusters) vault.ownClusters = []
    if (!vault.credentials)  vault.credentials  = []
    vault.ownClusters.push(cluster)
    vault.credentials.push(founderCredential)

    // Save vault
    const newPayload = await saveVault(appState.vaultKey, vault, appState.stored.salt)
    await persist(newPayload)
    appState.stored = newPayload

    // Send the signed witness to THIS cluster's endpoint — only if it has one.
    // The Cluster is always kept locally; no rollback, no automatic retry.
    if (clusterEndpoint) {
      let linked = false
      try {
        await pingVignard(clusterEndpoint, clusterId, name, desc, founderDid, founderCredential)
        linked = true
      } catch (e) { linked = false }
      populateHome()
      showToast(linked
        ? 'Cluster founded and linked to the Vine.'
        : 'Cluster created locally — Vine witness failed.')
    } else {
      populateHome()
      showToast('Cluster created locally — not linked to a Vine.')
    }
    appState.pendingClusterEndpoint = null
    goTo('screen-nodes')

  } catch (err) {
    if (errEl)  errEl.style.display  = 'flex'
    if (errTxt) errTxt.textContent   = (err.message || 'Could not create cluster')
    btn.disabled    = false
    btn.textContent = 'Found this cluster →'
  }
}

/**
 * Ping the vignard witness with a grape cluster registration.
 * Fire and forget — never blocks the UI.
 */
async function pingVignard(vineEndpoint, clusterId, name, description, founderDid, founderCredential) {
  // A Cluster endpoint is mandatory — there is NO default / mdusl fallback.
  const vineBase = (typeof normalizeVineEndpoint === 'function')
    ? normalizeVineEndpoint(vineEndpoint) : null
  if (!vineBase) {
    const err  = new Error('A vine endpoint is required to send the witness')
    err.code   = 'VINE_ENDPOINT_REQUIRED'
    throw err
  }

  // The signed FounderCredential is mandatory. Without it there is nothing
  // to prove, and NO request is made (no unsigned fallback).
  if (!founderCredential || typeof founderCredential !== 'object') {
    const err  = new Error('FounderCredential required for vignard witness')
    err.code   = 'FOUNDER_CREDENTIAL_REQUIRED'
    throw err
  }

  // Send the full, already-signed FounderCredential. Its signature covers
  // `claims` only and is reused verbatim — no second identity or signature.
  // `name`, `description` and `founder_did` are added as transport fields.
  const body = Object.assign({}, founderCredential, {
    name,
    description,
    founder_did: founderDid,
  })

  const res = await fetch(vineBase + '/api/vignard/clusters', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })
  if (!res.ok) {
    const err  = new Error('WITNESS_FAILED')
    err.code   = 'WITNESS_FAILED'
    throw err
  }

  const data = await res.json()
  // Update cluster record with the witness timestamp. vignard_did stays null —
  // vine_endpoint is the Cluster's only network link.
  const vault   = appState.vault
  const cluster = (vault.ownClusters || []).find(c => c.id === clusterId)
  if (cluster) {
    cluster.witnessed_at = data.witnessed_at
    // Silent pre-vine flag — no UI prompt, just state
    if (((cluster.members && cluster.members.length) || 0) >= 3 && cluster.status === 'active') {
      cluster.status = 'pre-vine'
    }
    const newPayload = await saveVault(appState.vaultKey, vault, appState.stored.salt)
    await persist(newPayload)
    appState.stored = newPayload
  }
  return true
}

/**
 * Open invite screen pre-selected to a specific cluster.
 */
function openInviteFromCluster(clusterId) {
  openInvite()
  // After invite screen loads, pre-select the cluster
  requestAnimationFrame(() => {
    const select = document.getElementById('invite-cluster-select')
    if (!select) return
    for (const opt of select.options) {
      try {
        const val = JSON.parse(opt.value)
        if (val.node_id === clusterId) {
          select.value = opt.value
          select.dispatchEvent(new Event('change'))
          break
        }
      } catch(e) { /* skip */ }
    }
  })
}

/**
 * Soft succession — grape leaves their own cluster.
 * If members exist, highest-weight member gets an admin offer.
 * If no members, cluster dissolves.
 */
async function confirmLeaveCluster(clusterId) {
  const vault   = appState.vault
  const cluster = (vault.ownClusters || []).find(c => c.id === clusterId)
  if (!cluster) return

  const memberCount = ((cluster.members && cluster.members.length) || 0)

  // Build confirmation modal
  const existing = document.getElementById('cluster-delete-modal')
  if (existing) existing.remove()

  const overlay = document.createElement('div')
  overlay.id = 'cluster-delete-modal'
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(8,11,18,0.92);
    z-index:200;display:flex;align-items:center;
    justify-content:center;padding:24px;
  `

  const memberLine = memberCount === 0
    ? `This cluster has no members.`
    : `This cluster has <strong>${memberCount} member${memberCount !== 1 ? 's' : ''} 🍇</strong>.
       Their credentials become a personal historical record —
       their vaults are not affected.`

  const successionLine = memberCount > 0
    ? `<p style="font-size:12px;color:var(--ink-dim);margin-top:8px;">
        The member with the most referral weight will be offered
        founder status. The cluster lives on in their vault.
       </p>`
    : ''

  overlay.innerHTML = `
    <div class="card" style="width:100%;max-width:380px;">
      <p class="cred-type" style="color:var(--red);">Delete cluster</p>
      <div class="cred-title" style="margin-bottom:12px;">
        ${escHtmlP(cluster.name)}
      </div>
      <p style="font-size:13px;color:var(--ink);line-height:1.7;margin-bottom:8px;">
        ${memberLine}
      </p>
      ${successionLine}
      <p style="font-size:12px;color:var(--ink-dim);line-height:1.6;margin-top:12px;">
        Deleting this cluster is fine — just don't do it too often,
        as the cluster resides on each grape as their own.
        This cannot be undone.
      </p>
      <div style="display:flex;gap:8px;margin-top:20px;">
        <button class="btn btn-ghost" style="flex:1;"
          onclick="document.getElementById('cluster-delete-modal').remove()">
          Cancel
        </button>
        <button class="btn btn-primary"
          style="flex:1;background:var(--red);border-color:var(--red);"
          onclick="document.getElementById('cluster-delete-modal').remove();
                   _executeClusterDelete('${clusterId}')">
          Delete
        </button>
      </div>
    </div>
  `
  document.body.appendChild(overlay)
}

/**
 * Soft leave — founder steps back but keeps the cluster.
 * Status set to 'left'. Can rejoin anytime.
 */
async function softLeaveCluster(clusterId) {
  const vault   = appState.vault
  const cluster = (vault.ownClusters || []).find(c => c.id === clusterId)
  if (!cluster) return

  cluster.status  = 'left'
  cluster.left_at = new Date().toISOString()

  try {
    const newPayload = await saveVault(appState.vaultKey, vault, appState.stored.salt)
    await persist(newPayload)
    appState.stored = newPayload
    populateHome()
    showToast(`You stepped back from ${cluster.name}`)
    openNodes()
  } catch (err) {
    showToast('Could not leave: ' + err.message)
  }
}

/**
 * Rejoin a cluster the founder previously left.
 */
async function rejoinCluster(clusterId) {
  const vault   = appState.vault
  const cluster = (vault.ownClusters || []).find(c => c.id === clusterId)
  if (!cluster) return

  cluster.status  = 'active'
  cluster.left_at = null

  try {
    const newPayload = await saveVault(appState.vaultKey, vault, appState.stored.salt)
    await persist(newPayload)
    appState.stored = newPayload
    populateHome()
    showToast(`Welcome back to ${cluster.name}`)
    openNodes()
  } catch (err) {
    showToast('Could not rejoin: ' + err.message)
  }
}

/**
 * Soft leave a membership credential.
 * Marks the credential status as 'left' — credential stays in vault.
 */
async function softLeaveMembership(credentialId) {
  const vault = appState.vault
  const cred  = (vault.credentials || []).find(
    c => (c.id || c.node_id) === credentialId
  )
  if (!cred) return

  cred.status  = 'left'
  cred.left_at = new Date().toISOString()

  try {
    const newPayload = await saveVault(appState.vaultKey, vault, appState.stored.salt)
    await persist(newPayload)
    appState.stored = newPayload
    showToast('You left the cluster. Your credential stays as a personal record.')
    openNodes()
  } catch (err) {
    showToast('Could not leave: ' + err.message)
  }
}
async function _executeClusterDelete(clusterId) {
  const vault   = appState.vault
  const cluster = (vault.ownClusters || []).find(c => c.id === clusterId)
  if (!cluster) return

  const memberCount = (cluster.members && cluster.members.length) || 0

  if (memberCount === 0) {
    await dissolveCluster(clusterId)
    return
  }

  // Find highest-weight member for succession
  const successor = cluster.members.reduce((best, m) =>
    (m.weight || 0) > (best.weight || 0) ? m : best
  , cluster.members[0])

  await leaveCluster(clusterId, successor.did)
}

/**
 * Execute cluster leave with succession offer.
 */
async function leaveCluster(clusterId, successorDid) {
  const vault   = appState.vault
  const clusterIdx = (vault.ownClusters || []).findIndex(c => c.id === clusterId)
  if (clusterIdx < 0) return

  const cluster = vault.ownClusters[clusterIdx]

  // Mark cluster as succession-pending in vault
  cluster.status     = 'succession-pending'
  cluster.successor  = successorDid
  cluster.left_at    = new Date().toISOString()

  // Remove founder credential from vault.credentials
  vault.credentials = (vault.credentials || []).filter(
    c => !(c.type === 'FounderCredential' && c.cluster_id === clusterId)
  )

  // Remove from ownClusters — cluster transfers to successor
  vault.ownClusters.splice(clusterIdx, 1)

  try {
    const newPayload = await saveVault(appState.vaultKey, vault, appState.stored.salt)
    await persist(newPayload)
    appState.stored = newPayload

    // Departure / succession is NOT witnessed here. A founder-initiated
    // succession will require its own distinct signed event (a succession
    // credential signed by the successor). Until then, no unsigned ping.

    populateHome()
    showToast(`You have left ${cluster.name}`)
    goTo('screen-nodes')
  } catch (err) {
    showToast('Could not leave cluster: ' + err.message)
  }
}

/**
 * Dissolve a cluster with no members.
 */
async function dissolveCluster(clusterId) {
  const vault = appState.vault
  vault.ownClusters = (vault.ownClusters || []).filter(c => c.id !== clusterId)
  vault.credentials = (vault.credentials || []).filter(
    c => !(c.type === 'FounderCredential' && c.cluster_id === clusterId)
  )

  try {
    const newPayload = await saveVault(appState.vaultKey, vault, appState.stored.salt)
    await persist(newPayload)
    appState.stored = newPayload
    populateHome()
    showToast('Cluster dissolved')
    goTo('screen-nodes')
  } catch (err) {
    showToast('Could not dissolve cluster: ' + err.message)
  }
}

/**
 * Build and sign a Cluster-scoped MembershipCredential approval.
 *
 * Signed by the admin/founder DID with its own Ed25519 key. The signature
 * covers exactly JSON.stringify(payload without `signature`). This reuses the
 * existing credential type (`MembershipCredential`) with `scope:'cluster'`;
 * no new credential type is introduced.
 *
 * Exposed as a global for the existing/future approval action.
 *
 * @param {Object} vault
 * @param {{ cluster_id:string, subject_did:string, referral_id?:string|null }} opts
 * @returns {Promise<Object>} signed credential payload
 */
async function buildClusterApprovalCredential(vault, opts) {
  const payload = {
    type:        'MembershipCredential',
    scope:       'cluster',
    cluster_id:  opts.cluster_id,
    issuer_did:  vault.identity.id,
    subject_did: opts.subject_did,
    referral_id: opts.referral_id ?? null,
    status:      'approved',
    issued_at:   new Date().toISOString(),
    expires_at:  null,
  }

  const privateKey = await crypto.subtle.importKey(
    'jwk', vault.keys.privateKey, { name: 'Ed25519' }, false, ['sign']
  )
  const sigBuf = await crypto.subtle.sign(
    'Ed25519', privateKey, new TextEncoder().encode(JSON.stringify(payload))
  )

  payload.signature = toB64(sigBuf)
  return payload
}


// ═════════════════════════════════════════════════════════════════════════════
// PERSONAL MARKERS — optional, private, non-actionable notes on Cluster cards.
// Stored in the encrypted vault under vault.personal_markers.
// Colours have NO official meaning and never affect permissions or SPID actions.
// ═════════════════════════════════════════════════════════════════════════════

const PERSONAL_MARKER_KEYS = [
  { key: 'invite',       icon: '✉',  label: 'Invitation'   },
  { key: 'availability', icon: '●',  label: 'Availability' },
  { key: 'revoke',       icon: '⛔', label: 'Revocation'   },
]

const MARKER_NEXT   = { yellow: 'green', green: 'red', red: 'yellow' }
const MARKER_COLORS = { yellow: '#c9a84c', green: '#27ae60', red: '#c0392b' }

/** Current stored colour for one marker (defaults to yellow, never written). */
function getPersonalMarker(clusterId, key) {
  const store = (appState.vault && appState.vault.personal_markers) || {}
  const entry = store['cluster:' + clusterId] || {}
  const c     = entry[key]
  return (c === 'green' || c === 'red' || c === 'yellow') ? c : 'yellow'
}

/**
 * Cycle one marker yellow→green→red→yellow, persisting via the encrypted
 * vault. Creates only the concerned entry. On save failure, restores the
 * previous state and reports an error. Never performs any network call.
 */
async function cyclePersonalMarker(clusterId, key, refresh) {
  const vault = appState.vault
  if (!vault) return

  const storeKey  = 'cluster:' + clusterId
  const prevStore = vault.personal_markers
    ? JSON.parse(JSON.stringify(vault.personal_markers)) : null

  const next  = MARKER_NEXT[getPersonalMarker(clusterId, key)] || 'yellow'

  if (!vault.personal_markers) vault.personal_markers = {}
  const entry = Object.assign({}, vault.personal_markers[storeKey] || {})
  entry[key] = next
  vault.personal_markers[storeKey] = entry

  try {
    const payload = await saveVault(appState.vaultKey, vault, appState.stored.salt)
    await persist(payload)
    appState.stored = payload
    if (typeof refresh === 'function') refresh()
  } catch (e) {
    if (prevStore === null) delete vault.personal_markers
    else vault.personal_markers = prevStore
    showToast('Could not save personal markers')
  }
}

/**
 * Build the compact personal-marker strip for a Cluster card.
 * Purely decorative/private: clicks never trigger Invite/Revoke/Leave nor any
 * network request.
 * @param {string} clusterId
 * @param {Function} [refresh] re-render callback
 * @returns {HTMLElement}
 */
function buildPersonalMarkers(clusterId, refresh) {
  const wrap = document.createElement('div')
  wrap.className = 'personal-markers'
  wrap.style.cssText = 'display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap;'

  PERSONAL_MARKER_KEYS.forEach(def => {
    const color = getPersonalMarker(clusterId, def.key)
    const btn   = document.createElement('button')
    btn.type      = 'button'
    btn.className = 'btn btn-ghost'
    btn.style.cssText = 'font-size:12px;line-height:1;padding:4px 6px;display:inline-flex;align-items:center;gap:4px;'
    btn.dataset.marker = def.key
    btn.dataset.color  = color
    btn.title = def.label + ' — ' + color
    btn.setAttribute('aria-label', def.label + ' — ' + color)

    const dot = document.createElement('span')
    dot.textContent = def.icon
    dot.style.cssText = 'color:' + (MARKER_COLORS[color] || MARKER_COLORS.yellow) + ';'
    btn.appendChild(dot)

    btn.addEventListener('click', () => cyclePersonalMarker(clusterId, def.key, refresh))
    wrap.appendChild(btn)
  })

  const help = document.createElement('button')
  help.type      = 'button'
  help.className = 'btn btn-ghost'
  help.style.cssText = 'font-size:11px;padding:2px 6px;'
  help.textContent = '?'
  help.title = 'About personal markers'
  help.setAttribute('aria-label', 'About personal markers')
  help.addEventListener('click', () => showToast(
    'Personal markers are optional private notes. Colours have no official ' +
    'meaning and never affect permissions, status or SPID actions.'))
  wrap.appendChild(help)

  return wrap
}


