/*
 * PASSPORT — Sovereign Identity System
 * passport.offers.js — §10c CREDENTIAL OFFERS
 *
 * Receiving and accepting credential offers from vines.
 * The grape fetches an offer, reviews it, signs a request,
 * and stores the returned SD-JWT credential in the vault.
 *
 * Responsibilities:
 *   openOfficialize()      — navigate to officialize screen
 *   openReceiveCredential()— navigate to receive credential screen
 *   validateOfferInput()   — validate URL or JSON input
 *   loadOfferFromInput()   — parse input and route to loadOffer()
 *   loadOffer()            — fetch offer JSON from vine, populate offer screen
 *   acceptOffer()          — sign request, POST to issue_endpoint, store credential
 *
 * Dependencies: passport.crypto.js, passport.state.js
 * VPS: acceptOffer() POSTs to offer.issue_endpoint (vine issuer on VPS)
 * SPID rule: cross-origin restore must work — offer URLs are portable
 */

function openOfficialize() {
  const vault       = appState.vault
  const memberships = (vault && vault.memberships) || []
  const approved    = memberships.filter(m => m.status === 'approved')

  // Show first approved cluster name and status
  const primary = approved[0]
  document.getElementById('officialize-cluster-name').textContent =
    ((primary && primary.node_name) || 'No approved cluster yet')
  document.getElementById('officialize-status').textContent =
    primary ? 'Approved member ✓' : 'Not yet approved in any cluster'

  goTo('screen-officialize')
}


// ─────────────────────────────────────────────────────────────────────────────
// RECEIVE CREDENTIAL — home screen entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Open the receive credential screen.
 * Called from the home screen "Receive Credential" menu item.
 * Clears any previous input and error state before navigating.
 */
function openReceiveCredential() {
  // Clear previous state
  document.getElementById('input-offer-paste').value = ''
  document.getElementById('receive-error').style.display = 'none'
  document.getElementById('btn-load-offer').disabled = true
  goTo('screen-receive')
}

/**
 * Validate the offer input field in real time.
 * Enables the Load button only when there is non-empty input.
 * Called on every keystroke via oninput.
 */
function validateOfferInput() {
  const val = document.getElementById('input-offer-paste').value.trim()
  document.getElementById('btn-load-offer').disabled = val.length === 0
}

/**
 * Load an offer from the paste input.
 *
 * Handles two input formats:
 *   1. URL string  → fetch the offer JSON from the issuer
 *   2. JSON string → parse directly without a network call
 *
 * On success → navigates to screen-offer (populated with community details).
 * On failure → shows inline error, stays on screen-receive.
 */
async function loadOfferFromInput() {
  let input    = document.getElementById('input-offer-paste').value.trim()
  const errEl  = document.getElementById('receive-error')
  const errTxt = document.getElementById('receive-error-text')
  const btn    = document.getElementById('btn-load-offer')

  errEl.style.display = 'none'
  btn.textContent     = 'Loading...'
  btn.disabled        = true

  // If a full passport URL was pasted, extract the #offer= fragment
  if (input.includes('#offer=')) {
    const hashPart = input.split('#offer=')[1]
    input = decodeURIComponent(hashPart.split('&')[0])
  }

  try {
    let offer

    if (input.startsWith('http://') || input.startsWith('https://')) {
      // ── Format 1: URL ─────────────────────────────────────────────────────
      // Fetch the offer JSON from the issuer endpoint.
      // The issuer returns a fresh offer with a new nonce each time.
      const res = await fetch(input)
      if (!res.ok) throw new Error(`Issuer returned ${res.status} — is the URL correct?`)
      offer = await res.json()

    } else {
      // ── Format 2: Raw JSON ────────────────────────────────────────────────
      // Parse the pasted JSON directly.
      // Useful for QR-encoded offers or offline distribution.
      try {
        offer = JSON.parse(input)
      } catch(e) {
        throw new Error('Not a valid invite link. Paste the full link you received.')
      }
    }

    // Validate the offer has required fields
    if (!offer.issuer || !offer.nonce || !offer.issue_endpoint) {
      throw new Error('Offer is missing required fields. Make sure you copied the full offer.')
    }

    // Store offer globally for acceptOffer()
    _pendingOffer = offer

    // Populate the offer screen with community details
    document.getElementById('offer-node-name').textContent  = (offer.node_name || offer.node_id || 'Unknown community')
    document.getElementById('offer-issuer-did').textContent = offer.issuer
    document.getElementById('offer-type').textContent       = (offer.credential_type || 'membership')
    document.getElementById('offer-expires').textContent    = offer.expires_at
      ? new Date(offer.expires_at).toLocaleDateString()
      : '1 year'

    // Navigate to the offer confirmation screen
    goTo('screen-offer')

  } catch (err) {
    // Show error inline — don't navigate away
    errEl.style.display  = 'flex'
    errTxt.textContent   = err.message
    btn.textContent      = 'Load offer →'
    btn.disabled         = false
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// CREDENTIAL OFFER FLOW
// ─────────────────────────────────────────────────────────────────────────────

// Pending offer stored between unlock and acceptance
let _pendingOffer = null
let _pendingRef   = null  // short token or null — resolved at issue time

/**
 * Fetch an offer from the issuer URL and show the offer screen.
 * Called after vault is unlocked if an offer URL is present.
 */
async function loadOffer(offerUrl, ref) {
  try {
    // Fetch the offer from the issuer
    const res   = await fetch(offerUrl)
    if (!res.ok) throw new Error(`Issuer returned ${res.status}`)
    const offer = await res.json()

    _pendingOffer = offer
    _pendingRef   = ref || null  // short token — resolved at issue time

    // Populate the offer screen
    document.getElementById('offer-node-name').textContent  = (offer.node_name || offer.node_id)
    document.getElementById('offer-issuer-did').textContent = offer.issuer
    document.getElementById('offer-type').textContent       = (offer.credential_type || 'membership')
    document.getElementById('offer-expires').textContent    = '1 year'

    goTo('screen-offer')

  } catch (err) {
    showToast('Could not load offer: ' + err.message)
  }
}

/**
 * Accept the pending credential offer.
 * Signs a request with the user's DID key and submits to the issuer.
 */
async function acceptOffer() {
  if (!_pendingOffer) { showToast('No pending offer'); return }
  if (!appState.vault || !appState.vaultKey) { goTo('screen-unlock'); return }

  const btn      = document.getElementById('btn-accept-offer')
  const errEl    = document.getElementById('offer-error')
  const errText  = document.getElementById('offer-error-text')

  btn.textContent = 'Requesting...'
  btn.disabled    = true
  errEl.style.display = 'none'

  try {
    const vault  = appState.vault
    const offer  = _pendingOffer

    // Import the holder's signing key
    const privateKey = await crypto.subtle.importKey(
      'jwk', vault.keys.privateKey, {name:'Ed25519'}, false, ['sign']
    )

    // Build the signed credential request payload
    const requestPayload = {
      subject_did:        vault.identity.id,
      type:               (offer.credential_type || 'membership'),
      node_id:            offer.node_id,
      nonce:              offer.nonce,
    }

    // Sign the request
    const sigData  = JSON.stringify(requestPayload)
    const sigBuf   = await crypto.subtle.sign('Ed25519', privateKey, enc(sigData))
    const signature = toB64(sigBuf)

    // Resolve ref — if we have a short token, fetch the full payload from relay
    let resolvedRef = null
    if (_pendingRef) {
      const refEndpoint = offer.issue_endpoint
        .replace('/api/credentials/issue', '/api/passport/ref/' + _pendingRef)
      try {
        const refRes = await fetch(refEndpoint)
        if (refRes.ok) {
          const refData = await refRes.json()
          resolvedRef = refData.ref
        }
      } catch(e) {
        // Non-fatal — ref is optional for open issuance vines
        console.warn('[SPID] Could not resolve ref token:', e.message)
      }
    }

    // Build full request body
    const body = Object.assign({}, requestPayload, {
      subject_public_key: vault.keys.publicKey,
      signature: signature,
      ref: resolvedRef,
      member_info: {
        name: (vault.identity.profile && vault.identity.profile.name) || null,
      },
    })

    // POST to issuer
    const issueRes = await fetch(offer.issue_endpoint, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    })

    if (!issueRes.ok) {
      const err = await issueRes.json().catch(() => ({}))
      throw new Error((err.message || err.error || `Issuer returned ${issueRes.status}`))
    }

    const issued = await issueRes.json()

    // ── Invitation accepted, Cluster approval still pending (HTTP 202) ──
    // No credential is issued yet: record a pending membership only.
    if (issueRes.status === 202) {
      if (!vault.memberships) vault.memberships = []
      const nodeId  = issued.cluster_id || offer.node_id
      const pending = {
        node_id:           nodeId,
        node_name:         offer.node_name || offer.node_id || 'Cluster',
        status:            issued.status || 'invited',
        cluster_id:        issued.cluster_id || null,
        referral_id:       issued.referral_id || _pendingRef || null,
        inviter_did:       issued.inviter_did || null,
        approval_required: issued.approval_required !== false,
        vine_endpoint:     offer.issue_endpoint
          ? offer.issue_endpoint.replace('/api/credentials/issue', '')
          : null,
        stored_at:         new Date().toISOString(),
      }
      const idx = vault.memberships.findIndex(m => m.node_id === nodeId)
      if (idx >= 0) vault.memberships[idx] = Object.assign({}, vault.memberships[idx], pending)
      else vault.memberships.push(pending)

      const pendingPayload = await saveVault(appState.vaultKey, vault, appState.stored.salt)
      await persist(pendingPayload)
      appState.stored = pendingPayload

      _pendingOffer = null
      _pendingRef   = null
      showToast('Invitation recorded — Cluster approval pending.')
      goTo('screen-home')
      return
    }

    // Store credential in vault
    // offer_endpoint — vine's /api/offer URL, derived from issue_endpoint.
    // Stored so the grape can build invite QRs pointing to the correct vine
    // without hardcoding any domain. Portable across all vine instances.
    const offerEndpoint = offer.issue_endpoint
      ? offer.issue_endpoint.replace('/api/credentials/issue', '/api/offer')
      : null

    if (!vault.credentials) vault.credentials = []
    vault.credentials.push({
      id:             issued.credential_id,
      type:           'MembershipCredential',
      issuer_did:     offer.issuer,
      subject_did:    vault.identity.id,
      issued_at:      issued.issued_at,
      expires_at:     issued.expires_at,
      sd_jwt:         issued.sd_jwt,
      node_id:        offer.node_id,
      node_name:      offer.node_name,
      offer_endpoint: offerEndpoint,
      stored_at:      new Date().toISOString(),
      revoked:        false,
    })

    // Save vault
    const newPayload = await saveVault(appState.vaultKey, vault, appState.stored.salt)
    await persist(newPayload)
    appState.stored = newPayload

    // Update credential count on home screen
    document.getElementById('cred-count').textContent =
      `${vault.credentials.length} credential${vault.credentials.length !== 1 ? 's' : ''}`

    // Show success screen
    document.getElementById('received-node-name').textContent = offer.node_name
    document.getElementById('received-issuer').textContent    = offer.issuer
    _pendingOffer = null
    _pendingRef   = null

    goTo('screen-credential-received')

  } catch (err) {
    errEl.style.display   = 'flex'
    errText.textContent   = err.message
    btn.textContent       = 'Accept credential →'
    btn.disabled          = false
  }
}


// ═════════════════════════════════════════════════════════════════════════════
// CLUSTER APPROVAL DELIVERY — signed claim + confirm (reuses vault + crypto)
// The invited Passport fetches its pending Cluster approvals with a fresh,
// DID-signed proof, verifies the issuer signature, stores the credential,
// then confirms receipt with a second DID-signed proof.
// ═════════════════════════════════════════════════════════════════════════════

const CLUSTER_APPROVAL_ACTIONS = {
  CLAIM:   'claim_cluster_approvals',
  CONFIRM: 'confirm_cluster_approvals',
}

async function _signHolderPayload(payload) {
  const privateKey = await crypto.subtle.importKey(
    'jwk', appState.vault.keys.privateKey, { name: 'Ed25519' }, false, ['sign']
  )
  const sigBuf = await crypto.subtle.sign(
    'Ed25519', privateKey, new TextEncoder().encode(JSON.stringify(payload))
  )
  return toB64(sigBuf)
}

function _approvalUrl(vineEndpoint, path) {
  return String(vineEndpoint || '').replace(/\/+$/, '') + path
}

/**
 * Confirm receipt of Cluster approvals (signed by the holder DID).
 * Idempotent server-side: a repeat returns 200.
 */
async function confirmClusterApprovals(vineEndpoint, clusterIds) {
  const did       = appState.vault.identity.id
  const timestamp = Date.now()
  const payload   = { action: CLUSTER_APPROVAL_ACTIONS.CONFIRM, did, cluster_ids: clusterIds, timestamp }
  const signature = await _signHolderPayload(payload)

  const res = await fetch(_approvalUrl(vineEndpoint, '/api/clusters/approvals/confirm'), {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ did, timestamp, cluster_ids: clusterIds, signature }),
  })
  if (!res.ok) return { ok: false, error: 'CONFIRM_FAILED', status: res.status }
  const data = await res.json().catch(() => ({}))
  return { ok: true, confirmed: data.confirmed || clusterIds }
}

/**
 * Claim pending Cluster approvals for THIS DID, verify them, store them once,
 * flip the matching pending membership to approved, then confirm receipt.
 *
 * Confirmation is sent ONLY after a successful local vault save.
 */
async function claimClusterApprovals(vineEndpoint) {
  const vault     = appState.vault
  const did       = vault.identity.id
  const timestamp = Date.now()
  const payload   = { action: CLUSTER_APPROVAL_ACTIONS.CLAIM, did, timestamp }
  const signature = await _signHolderPayload(payload)

  const res = await fetch(_approvalUrl(vineEndpoint, '/api/clusters/approvals/claim'), {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ did, timestamp, signature }),
  })
  if (!res.ok) return { ok: false, error: 'CLAIM_FAILED', status: res.status }
  const data      = await res.json().catch(() => ({}))
  const approvals = Array.isArray(data.approvals) ? data.approvals : []

  // Work on copies so a failed local save never corrupts the in-memory vault.
  const prevCreds = vault.credentials
  const prevMems  = vault.memberships
  const nextCreds = (vault.credentials || []).slice()
  const nextMems  = (vault.memberships || []).map(m => Object.assign({}, m))

  const accepted = []
  for (const cred of approvals) {
    if (!cred || cred.type !== 'MembershipCredential' || cred.scope !== 'cluster') continue
    if (cred.subject_did !== did || cred.status !== 'approved') continue

    const pendingIdx = nextMems.findIndex(
      m => m.status !== 'approved' &&
           (m.cluster_id === cred.cluster_id || m.node_id === cred.cluster_id)
    )
    if (pendingIdx < 0) continue

    // Verify the issuer's Ed25519 signature over the payload sans `signature`.
    let issuerOk = false
    try {
      const pub = await didKeyToPublicKey(cred.issuer_did)
      const { signature: sig, ...signed } = cred
      issuerOk = await crypto.subtle.verify(
        'Ed25519', pub, fromB64(sig),
        new TextEncoder().encode(JSON.stringify(signed))
      )
    } catch (e) { issuerOk = false }
    if (!issuerOk) continue

    const dup = nextCreds.some(c =>
      c.type === 'MembershipCredential' && c.scope === 'cluster' &&
      c.cluster_id === cred.cluster_id && c.signature === cred.signature)
    if (!dup) {
      nextCreds.push(Object.assign({}, cred, { stored_at: new Date().toISOString() }))
    }

    nextMems[pendingIdx] = Object.assign({}, nextMems[pendingIdx], {
      status:            'approved',
      approval_required: false,
      approved_at:       new Date().toISOString(),
    })
    accepted.push(cred.cluster_id)
  }

  if (accepted.length === 0) return { ok: true, stored: [], confirmed: [] }

  // Commit to memory only once, then save. On failure, restore the snapshot.
  vault.credentials = nextCreds
  vault.memberships = nextMems
  try {
    const newPayload = await saveVault(appState.vaultKey, vault, appState.stored.salt)
    await persist(newPayload)
    appState.stored = newPayload
  } catch (e) {
    vault.credentials = prevCreds
    vault.memberships = prevMems
    return { ok: false, error: 'SAVE_FAILED', stored: [] }
  }

  const confirmed = await confirmClusterApprovals(vineEndpoint, accepted)
  return { ok: true, stored: accepted, confirmed: confirmed.confirmed || [] }
}


// ═════════════════════════════════════════════════════════════════════════════
// APPROVE-MEMBER CONFIRMATION SCREEN — opened from a public #approve= demand.
// The demand is NOT an authority; the server re-verifies everything.
// ═════════════════════════════════════════════════════════════════════════════

/** Normalize a vine endpoint: scheme optional, no trailing slash, https by default. */
function normalizeVineEndpoint(raw) {
  let s = String(raw || '').trim()
  if (!s) return null
  if (!/^https?:\/\//i.test(s)) {
    const isLocal = /^localhost(:\d+)?(\/|$)/i.test(s) ||
                    /^127\.0\.0\.1(:\d+)?(\/|$)/i.test(s) ||
                    /^\[::1\](:\d+)?(\/|$)/i.test(s)
    s = (isLocal ? 'http://' : 'https://') + s
  }
  return s.replace(/\/+$/, '')
}

/** Remove the #approve= fragment without reloading (avoids a reload loop). */
function clearApproveFragment() {
  try {
    const base = (window.location.pathname || '') + (window.location.search || '')
    window.history.replaceState(null, '', base)
  } catch (e) { /* non-fatal */ }
}

/**
 * Detect a pending #approve= demand and render the confirmation screen.
 * Required keys: vine_endpoint, cluster_id, subject_did and the KEY
 * `referral_id` (UUID or null). A missing `referral_id` key is refused.
 * The fragment is always removed after handling.
 * @returns {boolean} true if a screen was shown
 */
function checkPendingApproval() {
  const raw = appState.pendingApproveRaw
  if (!raw) return false
  appState.pendingApproveRaw = null

  let demand = null
  try {
    demand = JSON.parse(new TextDecoder().decode(fromB64(raw)))
  } catch (e) { demand = null }

  const endpoint = demand && typeof demand === 'object'
    ? normalizeVineEndpoint(demand.vine_endpoint)
    : null

  const valid = demand && typeof demand === 'object' &&
    'referral_id' in demand &&          // null allowed, absent refused
    endpoint && demand.cluster_id && demand.subject_did
  if (!valid) {
    showToast('Invalid or incomplete approval request.')
    clearApproveFragment()
    return false
  }

  demand.vine_endpoint     = endpoint
  appState.pendingApproval = demand

  const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt }
  set('approve-cluster',  demand.cluster_id)
  set('approve-subject',  demand.subject_did)
  set('approve-referral', demand.referral_id == null ? '(none)' : demand.referral_id)
  set('approve-endpoint', demand.vine_endpoint)
  const errEl = document.getElementById('approve-error')
  if (errEl) errEl.style.display = 'none'

  clearApproveFragment()
  goTo('screen-approve')
  return true
}

/** Cancel — signs nothing, sends nothing. */
function cancelPendingApproval() {
  appState.pendingApproval = null
  goTo('screen-home')
}

/** Explicit admin action: sign the Cluster approval and POST it. */
async function approveClusterMember() {
  const demand  = appState.pendingApproval
  const btn     = document.getElementById('btn-approve-member')
  const errEl   = document.getElementById('approve-error')
  const errText = document.getElementById('approve-error-text')

  if (!demand) { showToast('No pending approval.'); return }
  if (!appState.vault) { goTo('screen-unlock'); return }

  if (btn) { btn.disabled = true; btn.textContent = 'Approving…' }
  if (errEl) errEl.style.display = 'none'

  try {
    const cred = await buildClusterApprovalCredential(appState.vault, {
      cluster_id:  demand.cluster_id,
      subject_did: demand.subject_did,
      referral_id: demand.referral_id ?? null,
    })

    const base = normalizeVineEndpoint(demand.vine_endpoint)
    if (!base) throw new Error('INVALID_ENDPOINT')
    const url  = base + '/api/clusters/' + encodeURIComponent(demand.cluster_id) +
                 '/members/' + encodeURIComponent(demand.subject_did) + '/approve'

    const res  = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(cred),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || data.status || ('HTTP ' + res.status))

    appState.pendingApproval = null
    showToast('Member approved ✓')
    goTo('screen-home')
  } catch (e) {
    if (errEl) { errEl.style.display = 'flex'; if (errText) errText.textContent = e.message }
    if (btn)   { btn.disabled = false; btn.textContent = 'Approve' }
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// ABOUT OVERLAY
// ─────────────────────────────────────────────────────────────────────────────
