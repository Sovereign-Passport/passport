/*
 * PASSPORT — Sovereign Identity System
 * passport.status.js — Vine/Vignard signed status delivery
 *
 * The DID claims only its own status proof, verifies the space signature,
 * stores it in the vault and confirms receipt.
 */

// ═════════════════════════════════════════════════════════════════════════════
// STATUS DELIVERY — Vine/Vignard signed statuses (reuses vault + crypto)
// The DID signs the claim, receives only its own status proof, verifies the
// space signature, stores it, then confirms receipt.
// ═════════════════════════════════════════════════════════════════════════════

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
// ═════════════════════════════════════════════════════════════════════════════
// VINE STATUS DELIVERY — the DID RECEIVES its status FROM the Vine.
// The status is NOT the DID's own data: the Vine signs it and the Passport
// holds the received proof. Mirror of the Cluster-approval delivery.
// ═════════════════════════════════════════════════════════════════════════════

const VINE_STATUS_ACTIONS = {
  CLAIM:   'claim_vine_status',
  CONFIRM: 'confirm_vine_status',
}
const VINE_STATUS_VALUES = ['guest', 'invited', 'approved', 'admin', 'revoked', 'left']

/** Confirm receipt of Vine-status proofs (signed by the holder DID). Idempotent. */
async function confirmVineStatuses(vineEndpoint, vineIds) {
  const did       = appState.vault.identity.id
  const timestamp = Date.now()
  const payload   = { action: VINE_STATUS_ACTIONS.CONFIRM, did, vine_ids: vineIds, timestamp }
  const signature = await _signHolderPayload(payload)
  const res = await fetch(_approvalUrl(vineEndpoint, '/api/vine/status/confirm'), {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ did, timestamp, vine_ids: vineIds, signature }),
  })
  if (!res.ok) return { ok: false, error: 'CONFIRM_FAILED', status: res.status }
  const data = await res.json().catch(() => ({}))
  return { ok: true, confirmed: data.confirmed || vineIds }
}

/**
 * Claim the Vine-status proofs held for THIS DID, verify the VINE signature,
 * store them in vault.vineStatuses (latest wins — the Vine is authoritative),
 * then confirm receipt. A failed local save never corrupts the vault.
 */
async function claimVineStatuses(vineEndpoint) {
  const vault     = appState.vault
  const did       = vault.identity.id
  const timestamp = Date.now()
  const payload   = { action: VINE_STATUS_ACTIONS.CLAIM, did, timestamp }
  const signature = await _signHolderPayload(payload)

  const res = await fetch(_approvalUrl(vineEndpoint, '/api/vine/status/claim'), {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ did, timestamp, signature }),
  })
  if (!res.ok) return { ok: false, error: 'CLAIM_FAILED', status: res.status }
  const data     = await res.json().catch(() => ({}))
  const statuses = Array.isArray(data.statuses) ? data.statuses : []

  const prev = vault.vineStatuses
  const next = (vault.vineStatuses || []).slice()

  const accepted = []
  for (const s of statuses) {
    if (!s || s.subject_did !== did || !s.vine_id || !s.status) continue
    if (!VINE_STATUS_VALUES.includes(s.status)) continue

    // Verify the VINE's Ed25519 signature over the exact signed payload.
    let vineOk = false
    try {
      const pub = s.issuer_public_key
        ? await crypto.subtle.importKey('jwk', s.issuer_public_key, { name: 'Ed25519' }, false, ['verify'])
        : await didKeyToPublicKey(s.vine_did)
      vineOk = await crypto.subtle.verify(
        'Ed25519', pub, fromB64(s.signature),
        new TextEncoder().encode(s.signed_payload))
    } catch (e) { vineOk = false }
    if (!vineOk) continue

    const entry = {
      vine_id:        s.vine_id,
      vine_did:       s.vine_did ?? null,
      vine_web_did:   s.vine_web_did ?? null,
      status:         s.status,
      granted_by:     (s.payload && s.payload.granted_by) || s.granted_by || null,
      issued_at:      s.issued_at || null,
      signed_payload: s.signed_payload,
      signature:      s.signature,
      received_at:    new Date().toISOString(),
    }
    const i = next.findIndex(x => x && x.vine_id === s.vine_id)
    if (i >= 0) next[i] = entry
    else next.push(entry)
    accepted.push(s.vine_id)
  }

  if (accepted.length === 0) return { ok: true, stored: [] }

  vault.vineStatuses = next
  try {
    const newPayload = await saveVault(appState.vaultKey, vault, appState.stored.salt)
    await persist(newPayload)
    appState.stored = newPayload
  } catch (e) {
    vault.vineStatuses = prev
    return { ok: false, error: 'SAVE_FAILED', stored: [] }
  }

  await confirmVineStatuses(vineEndpoint, accepted)
  return { ok: true, stored: accepted }
}


// ═════════════════════════════════════════════════════════════════════════════
// VIGNARD STATUS DELIVERY — the DID RECEIVES its status FROM the Vignard.
// Same principle as the Vine: the status is received, never owned.
// ═════════════════════════════════════════════════════════════════════════════

const VIGNARD_STATUS_ACTIONS = {
  CLAIM:   'claim_vignard_status',
  CONFIRM: 'confirm_vignard_status',
}

/** Confirm receipt of Vignard-status proofs (signed by the holder DID). Idempotent. */
async function confirmVignardStatuses(vineEndpoint, vignardIds) {
  const did       = appState.vault.identity.id
  const timestamp = Date.now()
  const signature = await _signHolderPayload({
    action: VIGNARD_STATUS_ACTIONS.CONFIRM, did, vignard_ids: vignardIds, timestamp })
  const res = await fetch(_approvalUrl(vineEndpoint, '/api/vignard/status/confirm'), {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ did, timestamp, vignard_ids: vignardIds, signature }),
  })
  if (!res.ok) return { ok: false, error: 'CONFIRM_FAILED', status: res.status }
  const data = await res.json().catch(() => ({}))
  return { ok: true, confirmed: data.confirmed || vignardIds }
}

/** Claim the Vignard-status proofs held for THIS DID, verify them, store, confirm. */
async function claimVignardStatuses(vineEndpoint) {
  const vault     = appState.vault
  const did       = vault.identity.id
  const timestamp = Date.now()
  const signature = await _signHolderPayload({ action: VIGNARD_STATUS_ACTIONS.CLAIM, did, timestamp })

  const res = await fetch(_approvalUrl(vineEndpoint, '/api/vignard/status/claim'), {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ did, timestamp, signature }),
  })
  if (!res.ok) return { ok: false, error: 'CLAIM_FAILED', status: res.status }
  const data     = await res.json().catch(() => ({}))
  const statuses = Array.isArray(data.statuses) ? data.statuses : []

  const prev = vault.vignardStatuses
  const next = (vault.vignardStatuses || []).slice()

  const accepted = []
  for (const s of statuses) {
    if (!s || s.subject_did !== did || !s.vignard_id || !s.status) continue
    if (!VINE_STATUS_VALUES.includes(s.status)) continue

    let vineOk = false
    try {
      const pub = s.issuer_public_key
        ? await crypto.subtle.importKey('jwk', s.issuer_public_key, { name: 'Ed25519' }, false, ['verify'])
        : await didKeyToPublicKey(s.vine_did)
      vineOk = await crypto.subtle.verify(
        'Ed25519', pub, fromB64(s.signature),
        new TextEncoder().encode(s.signed_payload))
    } catch (e) { vineOk = false }
    if (!vineOk) continue

    const entry = {
      vignard_id:     s.vignard_id,
      vine_did:       s.vine_did ?? null,
      vine_web_did:   s.vine_web_did ?? null,
      status:         s.status,
      granted_by:     (s.payload && s.payload.granted_by) || s.granted_by || null,
      issued_at:      s.issued_at || null,
      signed_payload: s.signed_payload,
      signature:      s.signature,
      received_at:    new Date().toISOString(),
    }
    const i = next.findIndex(x => x && x.vignard_id === s.vignard_id)
    if (i >= 0) next[i] = entry
    else next.push(entry)
    accepted.push(s.vignard_id)
  }

  if (accepted.length === 0) return { ok: true, stored: [] }

  vault.vignardStatuses = next
  try {
    const newPayload = await saveVault(appState.vaultKey, vault, appState.stored.salt)
    await persist(newPayload)
    appState.stored = newPayload
  } catch (e) {
    vault.vignardStatuses = prev
    return { ok: false, error: 'SAVE_FAILED', stored: [] }
  }

  await confirmVignardStatuses(vineEndpoint, accepted)
  return { ok: true, stored: accepted }
}


// ═════════════════════════════════════════════════════════════════════════════
// VINE ENDPOINT NORMALIZATION
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

// ─────────────────────────────────────────────────────────────────────────────
// ABOUT OVERLAY
// ─────────────────────────────────────────────────────────────────────────────
