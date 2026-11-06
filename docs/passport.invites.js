/*
 * PASSPORT — Sovereign Identity System
 * passport.invites.js — invitation acceptance
 *
 * Invitation creation and sharing live in Portail → Relations.
 * This file verifies a signed #invite= descriptor and applies the result:
 *   - sovereign Cluster: local approved membership after founder proof
 *   - hosted Cluster/Vine/Vignard: existing Switchboard relation/accept
 */

// Invitation creation now lives in Portail → Relations.
// Passport keeps referral verification and the acceptance path only.

async function verifyInviteReferral(p, subjectDid) {
  try {
    const r = p && p.referral
    if (!r || r.type !== 'ReferralCredential' || !p.scope ||
        r.node_id !== p.scope.id || r.scope !== p.scope.type || !r.signature) return false
    if (r.to_did && subjectDid && r.to_did !== subjectDid) return false
    const signed = Object.assign({}, r)
    delete signed.signature
    const signer = await didKeyToPublicKey(r.from_did)
    return await crypto.subtle.verify(
      'Ed25519', signer, fromB64(r.signature), enc(JSON.stringify(signed))
    )
  } catch (e) { return false }
}

async function verifyPrivateInvite(p, subjectDid) {
  if (!(await verifyInviteReferral(p, subjectDid))) return false
  try {
    const r = p.referral
    const fp = p.founder_proof
    if (!fp || fp.type !== 'FounderCredential' || fp.issuer_did !== r.from_did) return false
    const claims = fp.claims || {}
    if (claims.cluster_id !== p.scope.id || claims.role !== 'founder') return false
    const founderKey = await didKeyToPublicKey(fp.issuer_did)
    return await crypto.subtle.verify(
      'Ed25519', founderKey, fromB64(fp.signature), enc(JSON.stringify(claims))
    )
  } catch (e) { return false }
}

/** Render an invite link, optional QR and the email action. */
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
    const base = SPID_SWITCH_HOST
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

function _shareTypeLabel(type) {
  var labels = {
    handle: 'Pseudo / handle',
    icons: 'Icônes',
    feedback: 'Feedback',
    relations: 'Relations',
    'data:read': 'Données — lecture',
    'data:write': 'Données — écriture',
  }
  return labels[type] || type
}

/** Prefer the signed referral.requested; legacy descriptors keep p.requested. */
function _inviteShareTypes(p) {
  var raw = (p.referral && Object.prototype.hasOwnProperty.call(p.referral, 'requested'))
    ? p.referral.requested
    : (p.requested || [])
  try {
    var C = window.SPIDRelations && window.SPIDRelations.contract
    if (C && typeof C.normalizeShareTypes === 'function') return C.normalizeShareTypes(raw)
    return Array.isArray(raw) ? raw.slice() : []
  } catch (e) { return null }
}

/**
 * The invitee chooses exactly what to share. Returns null on refusal, or the
 * selected capability list on acceptance. The choice is signed afterwards.
 */
function _inviteConsentCard(name, type, requested) {
  var typeLabel = type === 'cluster' ? 'Cluster' : type === 'vine' ? 'Vine' : type === 'vignard' ? 'Vignard' : type
  return new Promise(function (resolve) {
    const ov = document.createElement('div')
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(8,11,18,0.96);z-index:200;' +
      'display:flex;align-items:center;justify-content:center;padding:24px'
    const card = document.createElement('div')
    card.style.cssText = 'background:#14171c;border:1px solid rgba(201,169,97,0.4);border-radius:16px;' +
      'padding:22px;max-width:380px;width:100%'
    const h = document.createElement('p')
    h.textContent = 'Invitation'
    h.style.cssText = 'color:#c9a961;letter-spacing:.14em;text-transform:uppercase;font-size:11px'
    const b = document.createElement('p')
    b.textContent = 'Rejoindre « ' + name + ' » (' + typeLabel + ')'
    b.style.cssText = 'color:#eee;font-size:15px;margin-top:8px'
    const w = document.createElement('p')
    w.textContent = requested.length ? 'Données demandées :' : 'Aucun partage de données demandé.'
    w.style.cssText = 'color:#999;font-size:12px;margin-top:8px'

    const list = document.createElement('div')
    list.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-top:10px;'
    const boxes = requested.map(function (t) {
      const label = document.createElement('label')
      label.style.cssText = 'display:flex;align-items:center;gap:10px;color:#ddd;font-size:13px;'
      const input = document.createElement('input')
      input.type = 'checkbox'
      input.checked = true
      input.dataset.shareType = t
      input.style.cssText = 'width:16px;height:16px;accent-color:#c9a961;'
      const span = document.createElement('span')
      span.textContent = _shareTypeLabel(t)
      label.appendChild(input); label.appendChild(span)
      list.appendChild(label)
      return { type: t, input: input }
    })

    const note = document.createElement('p')
    note.textContent = 'Ces choix seront signés et conservés dans votre Passport. Le serveur n’en reçoit qu’une projection.'
    note.style.cssText = 'color:#777;font-size:11px;line-height:1.5;margin-top:12px;'

    const row = document.createElement('div')
    row.style.cssText = 'display:flex;gap:8px;margin-top:16px'
    const no = document.createElement('button')
    no.className = 'btn btn-ghost'; no.type = 'button'; no.textContent = 'Refuser'
    const yes = document.createElement('button')
    yes.className = 'btn btn-primary'; yes.type = 'button'; yes.textContent = 'Accepter'
    const close = function (v) { ov.remove(); resolve(v) }
    no.addEventListener('click', function () { close(null) })
    yes.addEventListener('click', function () {
      close(boxes.filter(function (x) { return x.input.checked }).map(function (x) { return x.type }))
    })
    row.appendChild(no); row.appendChild(yes)
    card.appendChild(h); card.appendChild(b); card.appendChild(w)
    if (requested.length) card.appendChild(list)
    card.appendChild(note); card.appendChild(row)
    ov.appendChild(card); document.body.appendChild(ov)
  })
}

async function _handleUnifiedInvite(p) {
  const name = p.name || (p.ref && p.ref.node_name) || (p.scope && p.scope.id) || '—'
  const typeLabel = p.scope.type === 'cluster' ? 'Cluster'
    : p.scope.type === 'vine' ? 'Vine'
    : p.scope.type === 'vignard' ? 'Vignard' : p.scope.type
  const requested = _inviteShareTypes(p)
  if (requested === null) { showToast('Invalid sharing request.'); return }
  const subjectDid = appState.vault && appState.vault.identity && appState.vault.identity.id
  if (!(await verifyInviteReferral(p, subjectDid))) {
    showToast('Invalid invitation.')
    return
  }
  const selected = await _inviteConsentCard(name, p.scope.type, requested)
  if (selected === null) { showToast('Invitation declined.'); return }

  let signedGrant = null
  if (selected.length) {
    try {
      signedGrant = await signShareGrant(p.scope, selected, null)
    } catch (e) {
      showToast('Could not sign data sharing: ' + (e && e.message ? e.message : e))
      return
    }
  }

  const base = p.anchor ? String(p.anchor).replace(/\/+$/, '') : null
  if (!base) {
    if (!(await verifyPrivateInvite(p, subjectDid))) {
      showToast('Invalid private invitation.')
      return
    }
    const vault = appState.vault
    const clusterId = p.scope && p.scope.id
    if (!vault || !clusterId) { showToast('Private invitation incomplete.'); return }
    if (typeof clearDismissedRelation === 'function') clearDismissedRelation('cluster', clusterId)
    if (!vault.memberships) vault.memberships = []
    const now = new Date().toISOString()
    const row = {
      cluster_id: clusterId,
      node_id: clusterId,
      node_name: p.name || clusterId,
      cluster_name: p.name || clusterId,
      scope: 'cluster',
      status: 'approved',
      is_issuer: false,
      left_at: null,
      joined_at: now,
      invited_by_did: p.referral.from_did,
      referral_id: p.referral.id || null,
      vine_endpoint: null,
      local_private: true, // legacy internal name: no server host cache; not a privacy claim
    }
    const prev = vault.memberships.find(m => m.cluster_id === clusterId)
    if (prev) Object.assign(prev, row)
    else vault.memberships.push(row)
    // A Vine-less Cluster keeps its signed sharing choice locally. No server
    // projection exists until the Cluster is hosted.
    if (signedGrant) {
      _setLocalShareGrant(Object.assign({}, signedGrant, {
        local: true, pendingSync: false, saved_at: now,
      }))
    }
    try {
      const saved = await saveVault(appState.vaultKey, vault, appState.stored.salt)
      await persist(saved)
      appState.stored = saved
      populateHome()
      if (typeof openNodes === 'function') openNodes()
      showToast('Invitation accepted — sovereign Cluster membership approved.')
    } catch (e) {
      showToast('Could not save the private membership.')
    }
    return
  }
  try {
    const did = appState.vault.identity.id
    const r = await sbSelfCall(base, 'relation', 'accept', {
      scope: p.scope,
      handle: (appState.vault.identity && appState.vault.identity.handle) || null,
      types: selected,
      grant: signedGrant || undefined,
      referral: p.referral,
    }, { type: 'did', id: did })
    if (r.status !== 200 || !r.body || !r.body.ok) {
      throw new Error((r.body && (r.body.error || r.body.message)) || ('HTTP ' + r.status))
    }
    if (signedGrant) {
      try {
        await saveLocalShareGrant(signedGrant, { pendingSync: false })
      } catch (e) {
        showToast('Relation accepted, but the local sharing choice could not be saved.')
      }
    } else if (typeof removeLocalShareGrant === 'function') {
      await removeLocalShareGrant(p.scope)
    }
    if (typeof clearLocalRelationLeft === 'function') {
      clearLocalRelationLeft(p.scope.type, p.scope.id)
    }
    if (typeof clearDismissedRelation === 'function') {
      clearDismissedRelation(p.scope.type, p.scope.id)
    }
    if (typeof syncRelationsFromSwitchboard === 'function') {
      await syncRelationsFromSwitchboard()
    }
    // Refresh the local views immediately: the accepted relation is already
    // in the vault, even before any MembershipCredential is issued.
    if (typeof populateHome === 'function') populateHome()
    if (typeof openNodes === 'function') openNodes()
    if (typeof openCredentials === 'function' && _currentScreen === 'screen-credentials') {
      openCredentials()
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
  if (!uni) { showToast('Invalid or unsupported invitation.'); return false }
  _handleUnifiedInvite(uni)
  return true
}
