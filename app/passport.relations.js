/**
 * Passport — reconciliation of Switchboard relations into the local vault.
 *
 * The DID remains sovereign: the Switchboard returns the current relations of
 * THIS DID (Vine/Cluster/Vignard). We update only the local display state and
 * mark missing relations stale; signed proofs/credentials are never deleted.
 */


function _relUpsert(list, match, next) {
  var i = list.findIndex(match)
  if (i >= 0) list[i] = Object.assign({}, list[i], next)
  else list.push(next)
}

function _relMatchesScope(m, scopeType, scopeId) {
  if (!m || !scopeId) return false
  if (scopeType === 'cluster') return m.cluster_id === scopeId
  if (scopeType === 'vignard') {
    return m.scope === 'vignard' &&
      (m.node_id === scopeId || m.vignard_did === scopeId || m.issuer_did === scopeId)
  }
  return !m.cluster_id && m.scope !== 'vignard' &&
    (m.vine_id === scopeId || m.node_id === scopeId ||
     m.vine_did === scopeId || m.issuer_did === scopeId)
}

function _isDismissed(vault, scopeType, ids) {
  var list = (vault && vault.dismissedRelations) || []
  return list.some(function (d) {
    return d && d.scope === scopeType &&
      ids.some(function (id) { return id && d.id === id })
  })
}

/** Clear local departure/dismissal markers when a new invite is accepted. */
function clearLocalRelationLeft(scopeType, scopeId) {
  var vault = appState.vault
  if (!vault || !scopeId) return
  ;(vault.memberships || []).forEach(function (m) {
    if (_relMatchesScope(m, scopeType, scopeId)) {
      m.left_at = null
      m.status = 'invited'
    }
  })
}

function clearDismissedRelation(scopeType, scopeId) {
  var vault = appState.vault
  if (!vault || !scopeId) return
  vault.dismissedRelations = (vault.dismissedRelations || []).filter(function (d) {
    return !(d && d.scope === scopeType && d.id === scopeId)
  })
}

// ── SOVEREIGN SHARE GRANTS ────────────────────────────────────────────────
// The signed grant lives in the Passport vault. The server's share_grants row
// is only a projection; a failed projection stays `pendingSync` locally.

function _shareContract() {
  var c = window.SPIDRelations && window.SPIDRelations.contract
  if (!c || typeof c.canonicalShareGrantPayload !== 'function') {
    throw new Error('SHARE_CONTRACT_UNAVAILABLE')
  }
  return c
}

function _shareScopeKey(scope) {
  if (!scope || !scope.type || !scope.id) return ''
  return scope.type + '|' + scope.id
}

function getLocalShareGrant(scope) {
  var vault = appState.vault
  if (!vault || !scope) return null
  var key = _shareScopeKey(scope)
  return (vault.shareGrants || []).find(function (g) {
    return g && g.scope && _shareScopeKey(g.scope) === key
  }) || null
}

function _setLocalShareGrant(entry) {
  var vault = appState.vault
  if (!vault || !entry || !entry.scope) return null
  if (!Array.isArray(vault.shareGrants)) vault.shareGrants = []
  var key = _shareScopeKey(entry.scope)
  var idx = vault.shareGrants.findIndex(function (g) {
    return g && g.scope && _shareScopeKey(g.scope) === key
  })
  if (idx >= 0) vault.shareGrants[idx] = entry
  else vault.shareGrants.push(entry)
  return entry
}

async function _persistLocalShareGrants() {
  if (!appState.vault || !appState.vaultKey || !appState.stored) return
  var payload = await saveVault(appState.vaultKey, appState.vault, appState.stored.salt)
  await persist(payload)
  appState.stored = payload
}

async function signShareGrant(scope, types, expiresAt) {
  var C = _shareContract()
  var payload = C.canonicalShareGrantPayload({
    holder_did: appState.vault.identity.id,
    scope: scope,
    types: types,
    issued_at: new Date().toISOString(),
    expires_at: expiresAt || null,
  })
  var key = await crypto.subtle.importKey('jwk', appState.vault.keys.privateKey,
    { name: 'Ed25519' }, false, ['sign'])
  var sig = await crypto.subtle.sign('Ed25519', key, enc(JSON.stringify(payload)))
  return Object.assign({}, payload, { signature: toB64(sig) })
}

async function signShareRevocation(scope) {
  var C = _shareContract()
  var payload = C.canonicalShareRevocationPayload({
    holder_did: appState.vault.identity.id,
    scope: scope,
    issued_at: new Date().toISOString(),
  })
  var key = await crypto.subtle.importKey('jwk', appState.vault.keys.privateKey,
    { name: 'Ed25519' }, false, ['sign'])
  var sig = await crypto.subtle.sign('Ed25519', key, enc(JSON.stringify(payload)))
  return Object.assign({}, payload, { signature: toB64(sig) })
}

/** Save a signed grant in the vault. `pendingSync` is for offline projection. */
async function saveLocalShareGrant(grant, options) {
  var opts = options || {}
  var entry = Object.assign({}, grant, {
    saved_at: new Date().toISOString(),
    pendingSync: !!opts.pendingSync,
    local: !!opts.local,
  })
  _setLocalShareGrant(entry)
  await _persistLocalShareGrants()
  return entry
}

/** Save a signed revocation locally, preserving the last committed grant types. */
async function saveLocalShareRevocation(scope, revocation, options) {
  var opts = options || {}
  var prev = getLocalShareGrant(scope)
  var entry = {
    type: 'ShareGrant',
    holder_did: appState.vault.identity.id,
    scope: scope,
    types: prev ? (prev.types || []) : [],
    issued_at: prev ? prev.issued_at : revocation.issued_at,
    expires_at: prev ? (prev.expires_at || null) : null,
    revoked_at: revocation.issued_at,
    revocation: revocation,
    saved_at: new Date().toISOString(),
    pendingSync: !!opts.pendingSync,
    local: !!(prev && prev.local),
  }
  _setLocalShareGrant(entry)
  await _persistLocalShareGrants()
  return entry
}

async function removeLocalShareGrant(scope) {
  var vault = appState.vault
  if (!vault || !scope) return
  var key = _shareScopeKey(scope)
  var before = (vault.shareGrants || []).length
  vault.shareGrants = (vault.shareGrants || []).filter(function (g) {
    return !(g && g.scope && _shareScopeKey(g.scope) === key)
  })
  if (vault.shareGrants.length !== before) await _persistLocalShareGrants()
}

/** Best-effort projection of local pending choices after reconnect. */
async function flushPendingShareGrants() {
  if (!appState.vault || !appState.vaultKey || !appState.stored) return
  var did = appState.vault.identity.id
  var changed = false
  var list = (appState.vault.shareGrants || []).slice()
  for (var i = 0; i < list.length; i++) {
    var g = list[i]
    if (!g || !g.pendingSync || g.local) continue
    try {
      var r
      if (g.revocation) {
        r = await sbSelfCall(SPID_SWITCH_HOST, 'relation', 'revoke', {
          scope: g.scope, revocation: g.revocation,
        }, { type: 'did', id: did })
      } else if (g.signature) {
        r = await sbSelfCall(SPID_SWITCH_HOST, 'relation', 'share', {
          scope: g.scope, grant: g,
        }, { type: 'did', id: did })
      } else { continue }
      if (r.status === 200 && r.body && r.body.ok) {
        g.pendingSync = false
        changed = true
      }
    } catch (e) { /* keep pending for the next visibility/unlock */ }
  }
  if (changed) await _persistLocalShareGrants()
}

async function syncRelationsFromSwitchboard() {
  if (!appState.vault || !appState.vaultKey || !appState.stored) return
  var did = appState.vault.identity.id
  var base = SPID_SWITCH_HOST
  var r
  try {
    r = await sbSelfCall(base, 'relation', 'list', {}, { type: 'did', id: did })
  } catch (e) {
    return
  }
  if (r.status !== 200 || !r.body || !r.body.relations) return

  var vault = appState.vault
  var rel = r.body.relations
  var next = Array.isArray(vault.memberships) ? vault.memberships.slice() : []
  var before = JSON.stringify(vault.memberships || null)
  var beforeOwn = JSON.stringify(vault.ownClusters || null)

  var vines = (rel.vines || []).map(function (v) {
    return { id: v.id, did: v.did || null, name: v.name || v.id, endpoint: v.endpoint || null, status: v.status, role: v.role }
  })
  vines.forEach(function (v) {
    if (_isDismissed(vault, 'vine', [v.id, v.did])) return
    var existing = next.find(function (m) {
      return m.vine_id === v.id || m.node_id === v.id ||
             (v.did && (m.issuer_did === v.did || m.node_id === v.did))
    })
    if (existing && existing.status === 'left' && existing.left_at) {
      existing.node_name = v.name
      existing.vine_endpoint = v.endpoint
      existing.role = v.role
      existing.stale = false
      return
    }
    _relUpsert(next, function (m) {
      return m.vine_id === v.id || m.node_id === v.id ||
             (v.did && (m.issuer_did === v.did || m.node_id === v.did))
    }, {
      node_id: v.id, vine_id: v.id, vine_did: v.did, node_name: v.name,
      vine_endpoint: v.endpoint, scope: 'vine', status: v.status, role: v.role, stale: false,
    })
  })

  var ownIds = {}
  ;(vault.ownClusters || []).forEach(function (c) { if (c && c.id) ownIds[c.id] = true })

  var clusterStatus = {}
  ;(rel.clusters || []).forEach(function (c) {
    if (c && c.id) clusterStatus[c.id] = c.cluster_status || 'active'
  })
  var activeClusters = (rel.clusters || []).filter(function (c) {
    return c && c.id && (c.cluster_status || 'active') === 'active'
  })
  var clusters = activeClusters.map(function (c) { return c.id })

  ;(rel.clusters || []).forEach(function (c) {
    if (!c || !c.id) return
    if (ownIds[c.id]) {
      // Ownership remains in ownClusters; only refresh the existing hosting
      // hint when the Vine explicitly provides one.
      if (c.vine_endpoint && (c.cluster_status || 'active') === 'active') {
        var own = (vault.ownClusters || []).find(function (x) { return x.id === c.id })
        if (own && !own.vine_endpoint) own.vine_endpoint = c.vine_endpoint
      }
      return
    }
    if (_isDismissed(vault, 'cluster', [c.id])) return
    var existing = next.find(function (m) { return m.cluster_id === c.id })
    var active = (c.cluster_status || 'active') === 'active'
    // Keep a revoked hosted Cluster as history, but never invent one locally.
    if (!active && !existing) return
    // A local departure is the holder's decision. Do not let the next server
    // projection silently rejoin the Cluster; a new invite clears left_at.
    if (existing && existing.status === 'left' && existing.left_at) {
      existing.cluster_name = c.name
      existing.node_name = c.name
      existing.cluster_status = c.cluster_status || 'active'
      existing.stale = !active
      if (c.vine_endpoint && active) existing.vine_endpoint = c.vine_endpoint
      return
    }
    var patch = {
      cluster_id: c.id, node_id: c.id, cluster_name: c.name, node_name: c.name,
      scope: 'cluster', status: c.status, is_issuer: !!c.is_issuer,
      cluster_status: c.cluster_status || 'active', stale: !active,
    }
    if (c.vine_endpoint && active) patch.vine_endpoint = c.vine_endpoint
    _relUpsert(next, function (m) { return m.cluster_id === c.id }, patch)
  })

  var vignards = (rel.vignards || []).map(function (g) { return g.id })
  ;(rel.vignards || []).forEach(function (g) {
    if (_isDismissed(vault, 'vignard', [g.id])) return
    var existing = next.find(function (m) { return m.node_id === g.id && m.scope === 'vignard' })
    if (existing && existing.status === 'left' && existing.left_at) {
      existing.node_name = g.name
      existing.role = g.role
      existing.stale = false
      return
    }
    _relUpsert(next, function (m) { return m.node_id === g.id && m.scope === 'vignard' },
      { node_id: g.id, node_name: g.name, scope: 'vignard', status: g.status, role: g.role, stale: false })
  })

  // Ownership is carried by ownClusters + ownership proofs, never by a
  // duplicate "joined" row. Remove only the duplicate, never the Cluster.
  next = next.filter(function (m) { return !(m.cluster_id && ownIds[m.cluster_id]) })
  vault.memberships = next

  // Keep history, but hide relations the home Vine no longer returns or has
  // revoked. Hosting revocation is not member departure or Cluster deletion.
  next.forEach(function (m) {
    if (m.cluster_id) {
      if (clusterStatus[m.cluster_id]) {
        m.stale = clusterStatus[m.cluster_id] !== 'active'
        return
      }
      // A legacy Cluster without a Switchboard scope is not expected in
      // relation/list. A server-backed Cluster missing from the projection
      // is stale.
      if (m.local_private) return
      m.stale = true
      return
    }
    if (m.scope === 'vignard') {
      m.stale = !vignards.includes(m.node_id)
      return
    }
    m.stale = !(vines.some(function (v) {
      return v.id === m.node_id || v.id === m.vine_id ||
        (v.did && (v.did === m.issuer_did || v.did === m.node_id))
    }))
  })

  if (before === JSON.stringify(next) &&
      beforeOwn === JSON.stringify(vault.ownClusters || null)) return
  try {
    var payload = await saveVault(appState.vaultKey, vault, appState.stored.salt)
    await persist(payload)
    appState.stored = payload
  } catch (e) { /* keep in-memory state; next unlock retries */ }
}
