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
 * Dependencies: passport.crypto.js, passport.state.js
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
    .filter(c => c.type === 'GrapeClusterCredential' && c.cluster_id &&
      (typeof relationCredentialActive !== 'function' || relationCredentialActive(vault, c)))
  const clusterCreds = ((vault && vault.credentials) || [])
    .filter(c => c.type === 'MembershipCredential' && c.scope === 'cluster' &&
                 c.status === 'approved' && c.cluster_id &&
      (typeof relationCredentialActive !== 'function' || relationCredentialActive(vault, c)))

  // Vines come from the SAME source as My Memberships (distinct space, by scope).
  const vineItems = (typeof collectMembershipItems === 'function')
    ? collectMembershipItems(vault).items.filter(it => it.kind === 'vine' && it.cred)
    : []
  const rawVines = vineItems.map(it => {
    const c = it.cred
    return {
      kind:      'vine',
      node_id:   c.issuer_did || c.node_id || null,   // the Vine's DID / id
      node_name: c.node_name || c.issuer_did || 'Vine',
      endpoint:  c.offer_endpoint || c.vine_endpoint || null,
      own:       true,
    }
  })

  const rawClusters = [
    ...ownClusters.map(c => ({ kind:'cluster', node_id: c.id,         node_name: c.name,         own: true,  endpoint: c.vine_endpoint || null })),
    ...grapeCreds.map(c  => ({ kind:'cluster', node_id: c.cluster_id,  node_name: c.cluster_name, own: false, endpoint: c.vine_endpoint || null })),
    ...clusterCreds.map(c=> ({ kind:'cluster', node_id: c.cluster_id,  node_name: c.cluster_name || 'Cluster', own: false, endpoint: c.vine_endpoint || null })),
  ]
  const seen = {}
  const allTargets = [...rawClusters, ...rawVines].filter(c =>
    c.node_id && !seen[c.node_id] && (seen[c.node_id] = true))

  select.innerHTML = '<option value="">— select a membership —</option>'
  allTargets.forEach(c => {
    const opt = document.createElement('option')
    opt.value       = JSON.stringify({ kind: c.kind, node_id: c.node_id, node_name: c.node_name, endpoint: c.endpoint })
    opt.textContent = (c.node_name || c.node_id) + (c.own ? ' ✦' : '') + (c.kind === 'vine' ? ' · Vine' : '')
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
  if (allTargets.length === 0) {
    select.innerHTML =
      '<option value="">No memberships yet — create a cluster or receive a credential first</option>'
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
    // Parse the selected membership (Cluster OR Vine)
    const target = JSON.parse(select.value)

    // Read disclosure choices
    const disclosures = {
      handle:  document.getElementById('disclose-handle').checked,
      since:   document.getElementById('disclose-since').checked,
      role:    document.getElementById('disclose-role').checked,
    }

    // Find this membership for status + weight
    const membership = (vault.memberships || []).find(
      m => m.node_id === target.node_id
    )

    // Build the referral payload
    const payload = {
      id:                  crypto.randomUUID(),
      type:                'ReferralCredential',
      from_did:            vault.identity.id,
      to_did:              null,            // unknown until grape creates Passport
      node_id:             target.node_id,
      node_name:           target.node_name,
      scope:               target.kind === 'vine' ? 'vine' : 'cluster',
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
    let vineEndpoint = null
    if (target.kind === 'vine') {
      // Vine target → the Vine's own endpoint (membership record or the object),
      // else the signed #invite= hand-off that targeted THIS Vine.
      const vm = (vault.memberships || []).find(m => !m.cluster_id &&
        (m.issuer_did === target.node_id || m.node_id === target.node_id))
      vineEndpoint = target.endpoint || (vm && vm.vine_endpoint) || null
      if (!vineEndpoint && appState.pendingInvite &&
          appState.pendingInvite.vine_id === target.node_id) {
        vineEndpoint = appState.pendingInvite.vine_endpoint
      }
    } else {
      const own = (vault.ownClusters || []).find(c => c.id === target.node_id)
      vineEndpoint = (own && own.vine_endpoint) || null
      if (!vineEndpoint) {
        const mem = (vault.memberships || []).find(m =>
          m.cluster_id === target.node_id || m.node_id === target.node_id)
        vineEndpoint = (mem && mem.vine_endpoint) || null
      }
      if (!vineEndpoint && appState.pendingInvite &&
          appState.pendingInvite.cluster_id === target.node_id) {
        vineEndpoint = appState.pendingInvite.vine_endpoint
      }
    }
    const vineBase = (typeof normalizeVineEndpoint === 'function')
      ? normalizeVineEndpoint(vineEndpoint) : null
    if (!vineBase) {
      throw new Error(target.kind === 'vine'
        ? 'No endpoint for this Vine. Open the invite from your Vine dashboard.'
        : 'This Cluster is not linked to a Vine yet — open the invite from your Vine dashboard.')
    }

    // Self-heal: when the endpoint came from a signed hand-off (#invite=), keep
    // it on the owned Cluster so the NEXT invite needs no hand-off.
    if (target.kind === 'cluster') {
      const own = (vault.ownClusters || []).find(c => c.id === target.node_id)
      if (own && !own.vine_endpoint) {
        own.vine_endpoint = vineBase
        try {
          const p = await saveVault(appState.vaultKey, vault, appState.stored.salt)
          await persist(p)
          appState.stored = p
        } catch (e) { console.warn('[Invite] could not remember vine_endpoint:', e) }
      }
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
    if (!refRes.ok) throw new Error('Could not connect to SP.id network')
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
      text:  `${handle} has invited you to join their community on SP.id.`,
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
// SIGNED FLOW HAND-OFFS — #newcluster= / #invite= from the Sovereign Passport dashboard.
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

/** Does this Passport hold a membership of this Vine (by DID or id)? */
function hasVineMembershipItem(vineId) {
  const vault = appState.vault
  if (!vault || !vineId) return false
  return (vault.credentials || []).some(c =>
    c.type === 'MembershipCredential' &&
    c.scope !== 'cluster' && c.scope !== 'vignard' && !c.cluster_id &&
    (c.issuer_did === vineId || c.node_id === vineId) &&
    (typeof relationCredentialActive !== 'function' || relationCredentialActive(vault, c)))
}

/** Call the Switchboard with a did:key SELF-PROOF (no device, no credential). */
async function sbSelfCall(base, service, action, data, scope) {
  if (!appState.vault || !appState.vaultKey) throw new Error('locked')
  const root = String(base).replace(/\/+$/, '')
  const n = await (await fetch(root + '/api/switch/nonce')).json()
  const key = await crypto.subtle.importKey('jwk', appState.vault.keys.privateKey,
    { name: 'Ed25519' }, false, ['sign'])
  const sigBuf = await crypto.subtle.sign('Ed25519', key, enc(n.nonce))
  const body = {
    did: appState.vault.identity.id,
    nonce: n.nonce,
    self_proof: { nonce: n.nonce, signature: toB64(sigBuf) },
    service: service,
    action: action,
    data: data || {},
  }
  if (scope && scope.type && scope.id) {
    body.scope_type = scope.type
    body.scope_id = scope.id
  }
  const r = await fetch(root + '/api/switch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await r.json().catch(function () { return null })
  return { status: r.status, body: json }
}

/** Push the Passport's own handle to the home Vine (display only). */
async function syncProfileHandle() {
  if (!appState.vault || !appState.vaultKey) return
  const handle = appState.vault.identity && appState.vault.identity.handle
  if (!handle) return
  try {
    const base = new URL(SYNC_ENDPOINT).origin
    const did = appState.vault.identity.id
    await sbSelfCall(base, 'relation', 'profile', { handle: handle },
      { type: 'did', id: did })
  } catch (e) { /* display-name sync is best effort */ }
}

function _decodeUnifiedInvite(raw) {
  try {
    let s = String(raw).replace(/-/g, '+').replace(/_/g, '/')
    while (s.length % 4) s += '='
    const bin = atob(s)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const obj = JSON.parse(new TextDecoder().decode(bytes))
    return (obj && obj.scope && obj.scope.type) ? obj : null
  } catch (e) { return null }
}

function _inviteConsentCard(name, type, wanted) {
  var typeLabel = type === 'cluster' ? 'Cluster' : type === 'vine' ? 'Vine' : type === 'vignard' ? 'Vignard' : type
  return new Promise(function (resolve) {
    const ov = document.createElement('div')
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(8,11,18,0.96);z-index:200;' +
      'display:flex;align-items:center;justify-content:center;padding:24px'
    const card = document.createElement('div')
    card.style.cssText = 'background:#14171c;border:1px solid rgba(201,169,97,0.4);border-radius:16px;' +
      'padding:22px;max-width:360px;width:100%'
    const h = document.createElement('p')
    h.textContent = 'Invitation'
    h.style.cssText = 'color:#c9a961;letter-spacing:.14em;text-transform:uppercase;font-size:11px'
    const b = document.createElement('p')
    b.textContent = 'Rejoindre « ' + name + ' » (' + typeLabel + ')'
    b.style.cssText = 'color:#eee;font-size:15px;margin-top:8px'
    const w = document.createElement('p')
    w.textContent = 'Statut relation demandé : ' + wanted
    w.style.cssText = 'color:#999;font-size:12px;margin-top:6px;font-style:italic'
    const row = document.createElement('div')
    row.style.cssText = 'display:flex;gap:8px;margin-top:16px'
    const no = document.createElement('button')
    no.className = 'btn btn-ghost'; no.type = 'button'; no.textContent = 'Refuser'
    const yes = document.createElement('button')
    yes.className = 'btn btn-primary'; yes.type = 'button'; yes.textContent = 'Accepter'
    const close = function (v) { ov.remove(); resolve(v) }
    no.addEventListener('click', function () { close(false) })
    yes.addEventListener('click', function () { close(true) })
    row.appendChild(no); row.appendChild(yes)
    card.appendChild(h); card.appendChild(b); card.appendChild(w); card.appendChild(row)
    ov.appendChild(card); document.body.appendChild(ov)
  })
}

async function _handleUnifiedInvite(p) {
  const name = p.name || (p.ref && p.ref.node_name) || (p.scope && p.scope.id) || '—'
  const typeLabel = p.scope.type === 'cluster' ? 'Cluster'
    : p.scope.type === 'vine' ? 'Vine'
    : p.scope.type === 'vignard' ? 'Vignard' : p.scope.type
  const wanted = (p.requested || []).join(', ') || '—'
  const ok = await _inviteConsentCard(name, p.scope.type, wanted)
  if (!ok) { showToast('Invitation declined.'); return }
  const base = p.anchor ? String(p.anchor).replace(/\/+$/, '') : null
  if (!base) { showToast('Invitation accepted (private — no server).'); return }
  try {
    const did = appState.vault.identity.id
    const r = await sbSelfCall(base, 'relation', 'accept', {
      scope: p.scope,
      handle: (appState.vault.identity && appState.vault.identity.handle) || null,
      types: p.requested || [],
    }, { type: 'did', id: did })
    if (r.status !== 200 || !r.body || !r.body.ok) {
      throw new Error((r.body && (r.body.error || r.body.message)) || ('HTTP ' + r.status))
    }
    if (typeof syncRelationsFromSwitchboard === 'function') {
      await syncRelationsFromSwitchboard()
    }
    showToast('Invitation ' + typeLabel + ' « ' + name + ' » acceptée — en attente d’approbation.')
  } catch (e) {
    showToast('Failed: ' + (e && e.message ? e.message : e))
  }
}

/** #invite= → unified invitee join, or legacy descriptor. */
function checkPendingInvite() {
  const raw = appState.pendingInviteRaw
  if (!raw) return false
  appState.pendingInviteRaw = null

  const uni = _decodeUnifiedInvite(raw)
  if (uni) { _handleUnifiedInvite(uni); return true }

  let demand = null
  try { demand = JSON.parse(new TextDecoder().decode(fromB64(raw))) } catch (e) { demand = null }
  const endpoint = demand && typeof demand === 'object'
    ? normalizeVineEndpoint(demand.vine_endpoint) : null

  clearApproveFragment()

  if (!endpoint) { showToast('Invalid or incomplete invite request.'); return false }

  // Vine (community) target — the Passport must be a member of that Vine.
  if (demand.vine_id) {
    if (!hasVineMembershipItem(demand.vine_id)) {
      showToast('This Vine is not linked to your Passport.')
      return false
    }
    appState.pendingInvite = demand
    openInviteFromCluster(demand.vine_id)   // preselects by node_id (Vine DID)
    return true
  }

  if (!demand.cluster_id) { showToast('Invite request missing cluster.'); return false }
  if (!hasCanonicalCluster(demand.cluster_id)) {
    showToast('This legacy cluster is not linked to your Passport.')
    return false
  }

  appState.pendingInvite = demand
  openInviteFromCluster(demand.cluster_id)   // opens + preselects the canonical cluster
  return true
}
