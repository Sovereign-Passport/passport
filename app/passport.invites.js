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

  // Populate cluster dropdown from:
  // 1. Clusters the grape owns (vault.ownClusters)
  // 2. Grape cluster credentials (vault.credentials type GrapeClusterCredential)
  // 3. Vine memberships (vault.credentials type MembershipCredential, fallback vault.memberships)
  const ownClusters    = ((vault && vault.ownClusters) || [])
  const grapeCreds     = ((vault && vault.credentials) || [])
    .filter(c => c.type === 'GrapeClusterCredential')
  const vineCreds      = ((vault && vault.credentials) || [])
    .filter(c => c.type === 'MembershipCredential')
  const legacyMembers  = ((vault && vault.memberships) || [])
    .filter(m => m.status === 'approved')
    .filter(m => !vineCreds.some(c => c.node_id === m.node_id))

  const allClusters = [
    ...ownClusters.map(c => ({ node_id: c.id,         node_name: c.name,         own: true  })),
    ...grapeCreds.map(c  => ({ node_id: c.cluster_id,  node_name: c.cluster_name, own: false })),
    ...vineCreds.map(c   => ({ node_id: c.node_id,     node_name: c.node_name,    own: false })),
    ...legacyMembers.map(m=> ({ node_id: m.node_id,    node_name: m.node_name,    own: false })),
  ]

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

    // Encode the signed referral as base64
    const encodedRef = toB64(new TextEncoder().encode(JSON.stringify(payload)))

    // POST ref payload to vine relay
    // Vine stores it for 5 days, returns short token + QR SVG + full invite URL
    // QR is generated server-side — no QR library needed in passport
    const vineCred    = (vault.credentials || []).find(
      function(c) { return c.type === 'MembershipCredential' && c.node_id === cluster.node_id }
    )
    const offerBase   = (vineCred && vineCred.offer_endpoint)
      || 'https://mdusl.sovereign-passport.id/api/offer'
    const refEndpoint = offerBase.replace('/api/offer', '/api/passport/ref')

    const refRes = await fetch(refEndpoint, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ ref: encodedRef }),
    })
    if (!refRes.ok) throw new Error('Could not store invite ref on vine')
    const refData = await refRes.json()

    // Display the invite URL and QR returned by the vine
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
