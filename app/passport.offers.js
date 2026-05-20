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

/**
 * Fetch an offer from the issuer URL and show the offer screen.
 * Called after vault is unlocked if an offer URL is present.
 */
async function loadOffer(offerUrl) {
  try {
    // Fetch the offer from the issuer
    const res   = await fetch(offerUrl)
    if (!res.ok) throw new Error(`Issuer returned ${res.status}`)
    const offer = await res.json()

    _pendingOffer = offer

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

    // Build full request body
    const body = Object.assign({}, requestPayload, {
      subject_public_key: vault.keys.publicKey,
      signature: signature,
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

    // Store credential in vault
    if (!vault.credentials) vault.credentials = []
    vault.credentials.push({
      id:          issued.credential_id,
      type:        'MembershipCredential',
      issuer_did:  offer.issuer,
      subject_did: vault.identity.id,
      issued_at:   issued.issued_at,
      expires_at:  issued.expires_at,
      sd_jwt:      issued.sd_jwt,
      node_id:     offer.node_id,
      node_name:   offer.node_name,
      stored_at:   new Date().toISOString(),
      revoked:     false,
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

    goTo('screen-credential-received')

  } catch (err) {
    errEl.style.display   = 'flex'
    errText.textContent   = err.message
    btn.textContent       = 'Accept credential →'
    btn.disabled          = false
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// ABOUT OVERLAY
// ─────────────────────────────────────────────────────────────────────────────
