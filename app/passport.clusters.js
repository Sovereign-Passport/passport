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

    // Build cluster record
    const cluster = {
      id:          clusterId,
      name,
      description: desc,
      founder_did: founderDid,
      vignard_did: null,          // set after vignard ping
      members:     [],
      status:      'active',
      created_at:  now,
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

    // Ping vignard witness — fire and forget, never block
    pingVignard(clusterId, name, desc, founderDid).catch(() => {})

    populateHome()
    showToast(`${name} founded 🍇`)
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
async function pingVignard(clusterId, name, description, founderDid) {
  try {
    const res = await fetch('https://mdusl.sovereign-passport.id/api/vignard/clusters', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ cluster_id: clusterId, name, description, founder_did: founderDid }),
    })
    if (res.ok) {
      const data = await res.json()
      // Update cluster record with vignard witness timestamp
      const vault   = appState.vault
      const cluster = (vault.ownClusters || []).find(c => c.id === clusterId)
      if (cluster) {
        cluster.witnessed_at = data.witnessed_at
        cluster.vignard_did  = 'did:web:mdusl.sovereign-passport.id'
        // Silent pre-vine flag — no UI prompt, just state
        if (((cluster.members && cluster.members.length) || 0) >= 3 && cluster.status === 'active') {
          cluster.status = 'pre-vine'
        }
        const newPayload = await saveVault(appState.vaultKey, vault, appState.stored.salt)
        await persist(newPayload)
        appState.stored = newPayload
      }
    }
  } catch(e) {
    // Silent — vignard is a witness, not a dependency
  }
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

    // Ping vignard with succession event — fire and forget
    pingVignard(clusterId, cluster.name, cluster.description || '',
      (successorDid || vault.identity.id)).catch(() => {})

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


