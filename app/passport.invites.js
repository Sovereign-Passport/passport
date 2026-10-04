/*
 * PASSPORT — Sovereign Identity System
 * passport.invites.js — §10b INVITES
 *
 * Generating and sharing invite links.
 * The grape signs a referral and produces a shareable URL.
 *
 * Responsibilities:
 *   openInvite()        — navigate to invite screen, populate cluster dropdown
 *   generateInvite()    — sign referral, build invite URL, show QR + link
 *   copyInviteLink()    — copy invite URL to clipboard
 *   shareInviteLink()   — native share or copy fallback
 *
 * Dependencies: passport.crypto.js, passport.state.js, passport.qr.js
 * SYNC_ENDPOINT: used for invite URL base (defined in passport.state.js)
 */

function openInvite() {
  const vault       = appState.vault
  const select      = document.getElementById('invite-cluster-select')
  const disclosures = document.getElementById('invite-disclosures')
  const noteField   = document.getElementById('invite-note-field')
  const result      = document.getElementById('invite-result')
  const errEl       = document.getElementById('invite-error')
  const btn         = document.getElementById('btn-generate-invite')

  // Reset state
  result.style.display    = 'none'
  errEl.style.display     = 'none'
  disclosures.style.display = 'none'
  noteField.style.display  = 'none'
  btn.disabled             = true
  document.getElementById('invite-note').value = ''

  // Cluster dropdown — canonical Cluster ids ONLY:
  //   1. ownClusters[].id (the Passport's canonical UUID)
  //   2. GrapeClusterCredential.cluster_id
  //   3. MembershipCredential scope=cluster, approved → cluster_id
  // Never use a Vine credential's node_id / vine_handle as a Cluster id.
  const ownClusters  = ((vault && vault.ownClusters) || [])
  const grapeCreds   = ((vault && vault.credentials) || [])
    .filter(c => c.type === 'GrapeClusterCredential' && c.cluster_id)
  const clusterCreds = ((vault && vault.credentials) || [])
    .filter(c => c.type === 'MembershipCredential' && c.scope === 'cluster' &&
                 c.status === 'approved' && c.cluster_id)

  const rawClusters = [
    ...ownClusters.map(c => ({ node_id: c.id,         node_name: c.name,         own: true  })),
    ...grapeCreds.map(c  => ({ node_id: c.cluster_id,  node_name: c.cluster_name, own: false })),
    ...clusterCreds.map(c=> ({ node_id: c.cluster_id,  node_name: c.cluster_name || 'Cluster', own: false })),
  ]
  const seen = {}
  const allClusters = rawClusters.filter(c =>
    c.node_id && !seen[c.node_id] && (seen[c.node_id] = true))

  select.innerHTML = '<option value="">— select a cluster —</option>'
  allClusters.forEach(c => {
    const opt = document.createElement('option')
    opt.value       = JSON.stringify({ node_id: c.node_id, node_name: c.node_name })
    opt.textContent = (c.node_name || c.node_id) + (c.own ? ' ✦' : '')
    select.appendChild(opt)
  })

  // Show disclosures and note when a cluster is selected
  select.onchange = () => {
    const hasSelection = select.value !== ''
    disclosures.style.display = hasSelection ? 'block' : 'none'
    noteField.style.display   = hasSelection ? 'block' : 'none'
    btn.disabled              = !hasSelection
    result.style.display      = 'none'
  }

  // If no clusters available — explain and offer to create
  if (allClusters.length === 0) {
    select.innerHTML =
      '<option value="">No clusters yet — create one or receive a credential first</option>'
    btn.disabled = true
  }

  goTo('screen-invite')
}

/**
 * Generate a signed invite link.
 *
 * Flow:
 *   1. Read selected cluster and disclosures
 *   2. Build referral payload (from identity.js model)
 *   3. Sign with holder's Ed25519 key
 *   4. Encode as base64url
 *   5. Build full invite URL:
 *      passport.html#offer=<issuer_url>&ref=<signed_referral>
 *   6. Display link + share button
 */
async function generateInvite() {
  const vault      = appState.vault
  const select     = document.getElementById('invite-cluster-select')
  const note       = document.getElementById('invite-note').value.trim()
  const errEl      = document.getElementById('invite-error')
  const errTxt     = document.getElementById('invite-error-text')
  const result     = document.getElementById('invite-result')
  const btn        = document.getElementById('btn-generate-invite')

  errEl.style.display   = 'none'
  result.style.display  = 'none'
  btn.textContent       = 'Generating...'
  btn.disabled          = true

  try {
    // Parse selected cluster
    const cluster = JSON.parse(select.value)

    // Read disclosure choices
    const disclosures = {
      handle:  document.getElementById('disclose-handle').checked,
      since:   document.getElementById('disclose-since').checked,
      role:    document.getElementById('disclose-role').checked,
    }

    // Find this membership for status + weight
    const membership = (vault.memberships || []).find(
      m => m.node_id === cluster.node_id
    )

    // Build the referral payload
    const payload = {
      id:                  crypto.randomUUID(),
      type:                'ReferralCredential',
      from_did:            vault.identity.id,
      to_did:              null,            // unknown until grape creates Passport
      node_id:             cluster.node_id,
      node_name:           cluster.node_name,
      from_status_at_time: (membership && membership.status) || 'unknown',
      weight:              (membership && membership.status) === 'approved' ? 3 : 1,
      disclosed:           {},
      note:                note || null,
      created_at:          new Date().toISOString(),
      expires_at:          null,
    }

    // Apply disclosures
    if (disclosures.handle && vault.identity.handle)
      payload.disclosed.handle = vault.identity.handle
    if (disclosures.since && (membership && membership.joined_at))
      payload.disclosed.since = membership.joined_at
    if (disclosures.role && (membership && membership.is_issuer))
      payload.disclosed.role = 'issuer'

    // Sign the referral with the holder's private key
    const privateKey = await crypto.subtle.importKey(
      'jwk', vault.keys.privateKey, {name:'Ed25519'}, false, ['sign']
    )
    const sigData   = JSON.stringify(payload)
    const sigBuf    = await crypto.subtle.sign(
      'Ed25519', privateKey, new TextEncoder().encode(sigData)
    )
    const signature = toB64(sigBuf)
    payload.signature = signature

    // Encode the signed referral as base64url
    const encodedRef = toB64(new TextEncoder().encode(JSON.stringify(payload)))

    // The endpoint must belong to THIS Cluster. Resolution order:
    //   1. the ownCluster's stored vine_endpoint
    //   2. the matching cluster-membership record's vine_endpoint
    //   3. the one-shot #invite descriptor — ONLY if it targets this cluster_id
    // No global fallback: absent endpoint → clear error, no request.
    const own = (vault.ownClusters || []).find(c => c.id === cluster.node_id)
    let vineEndpoint = (own && own.vine_endpoint) || null
    if (!vineEndpoint) {
      const mem = (vault.memberships || []).find(m =>
        m.cluster_id === cluster.node_id || m.node_id === cluster.node_id)
      vineEndpoint = (mem && mem.vine_endpoint) || null
    }
    if (!vineEndpoint && appState.pendingInvite &&
        appState.pendingInvite.cluster_id === cluster.node_id) {
      vineEndpoint = appState.pendingInvite.vine_endpoint
    }
    const vineBase = (typeof normalizeVineEndpoint === 'function')
      ? normalizeVineEndpoint(vineEndpoint) : null
    if (!vineBase) {
      throw new Error('No vine endpoint for this cluster.')
    }
    const offerBase    = vineBase + '/api/offer'
    const refEndpoint  = vineBase + '/api/passport/ref'
    const passportBase = 'https://sovereign-passport.github.io/passport/passport.html'
    const inviteUrl    = passportBase + '#offer=' + offerBase + '&ref=' + encodedRef

    // POST encodedRef to the vine relay — returns short token + QR SVG
    const refRes = await fetch(refEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: encodedRef }),
    })
    if (!refRes.ok) throw new Error('Could not connect to SPID network')
    const refData = await refRes.json()

    // Display the link + QR
    document.getElementById('invite-link-display').textContent = refData.invite_url
    document.getElementById('invite-qr').innerHTML = refData.qr_svg

    // Show share button only if Web Share API available
    const shareBtn = document.getElementById('btn-share-invite')
    shareBtn.style.display = navigator.share ? 'block' : 'none'

    result.style.display = 'block'

    // Store in vault referrals_sent
    if (!vault.referrals_sent) vault.referrals_sent = []
    vault.referrals_sent.push(payload)
    const refPayload = await saveVault(appState.vaultKey, vault, appState.stored.salt)
    await persist(refPayload)
    appState.stored = refPayload

    showToast('Invite link generated')

  } catch (err) {
    console.error('[Invite] Failed:', err)
    errEl.style.display  = 'flex'
    errTxt.textContent   = err.message
  } finally {
    btn.textContent = 'Generate invite link →'
    btn.disabled    = false
  }
}

/**
 * Copy the generated invite link to clipboard.
 */
function copyInviteLink() {
  const link = document.getElementById('invite-link-display').textContent
  if(navigator.clipboard) navigator.clipboard.writeText(link)
    .then(() => showToast('Invite link copied'))
    .catch(() => showToast('Copy failed'))
}

/**
 * Share the invite link via the Web Share API.
 * Falls back gracefully if not supported.
 */
async function shareInviteLink() {
  const link   = document.getElementById('invite-link-display').textContent
  const handle = ((appState.vault && appState.vault.identity && appState.vault.identity.handle) || 'Someone')
  try {
    await navigator.share({
      title: 'Join my cluster on Sovereign Passport',
      text:  `${handle} has invited you to join their community on SPID.`,
      url:   link,
    })
  } catch (err) {
    if (err.name !== 'AbortError') showToast('Share failed — copy the link instead')
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// OFFICIALIZE — screen-officialize
// Explains the vine path and $100 upgrade
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Open the officialize screen.
 * Populates current cluster name and member status.
 */


// ─────────────────────────────────────────────────────────────────────────────
// SIGNED FLOW HAND-OFFS — #newcluster= / #invite= from the SPID dashboard.
// Fragments are public demands, never an authority. No cluster-id conversion.
// ─────────────────────────────────────────────────────────────────────────────

/** Does this Passport hold a canonical Cluster with this exact UUID? */
function hasCanonicalCluster(clusterId) {
  const vault = appState.vault
  if (!vault || !clusterId) return false
  if ((vault.ownClusters || []).some(c => c.id === clusterId)) return true
  return (vault.credentials || []).some(c =>
    c.type === 'MembershipCredential' && c.scope === 'cluster' &&
    c.status === 'approved' && c.cluster_id === clusterId)
}

/** #newcluster= → open the existing create-cluster screen with the endpoint. */
function checkPendingNewCluster() {
  const raw = appState.pendingNewClusterRaw
  if (!raw) return false
  appState.pendingNewClusterRaw = null

  let demand = null
  try { demand = JSON.parse(new TextDecoder().decode(fromB64(raw))) } catch (e) { demand = null }
  const endpoint = demand && typeof demand === 'object'
    ? normalizeVineEndpoint(demand.vine_endpoint) : null

  clearApproveFragment()
  if (!endpoint) { showToast('Invalid or incomplete cluster request.'); return false }

  appState.pendingClusterEndpoint = endpoint
  goTo('screen-create-cluster')
  return true
}

/** #invite= → open the existing invite screen for a canonical Cluster only. */
function checkPendingInvite() {
  const raw = appState.pendingInviteRaw
  if (!raw) return false
  appState.pendingInviteRaw = null

  let demand = null
  try { demand = JSON.parse(new TextDecoder().decode(fromB64(raw))) } catch (e) { demand = null }
  const endpoint = demand && typeof demand === 'object'
    ? normalizeVineEndpoint(demand.vine_endpoint) : null

  clearApproveFragment()

  if (!endpoint) { showToast('Invalid or incomplete invite request.'); return false }
  if (!demand.cluster_id) { showToast('Invite request missing cluster.'); return false }
  if (!hasCanonicalCluster(demand.cluster_id)) {
    showToast('This legacy cluster is not linked to your Passport.')
    return false
  }

  appState.pendingInvite = demand
  openInviteFromCluster(demand.cluster_id)   // opens + preselects the canonical cluster
  return true
}
