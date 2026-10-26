/**
 * Passport — reconciliation of Switchboard relations into the local vault.
 *
 * The DID remains sovereign: the Switchboard returns the current relations of
 * THIS DID (Vine/Cluster/Vignard). We update only the local display state and
 * mark missing relations stale; signed proofs/credentials are never deleted.
 */

function _relSnapshot(vault) {
  return (vault && vault.relationSnapshot) || null
}

function _relActiveIds(vault) {
  var snap = _relSnapshot(vault)
  if (!snap) return null
  return {
    vines: new Set((snap.vines || []).map(function (v) { return v.id })),
    vineDids: new Set((snap.vines || []).map(function (v) { return v.did }).filter(Boolean)),
    clusters: new Set(snap.clusters || []),
    vignards: new Set(snap.vignards || []),
    homeHost: snap.homeHost || null,
  }
}

function _relHost(value) {
  if (typeof value !== 'string' || !value) return null
  if (value.indexOf('did:web:') === 0) {
    return value.slice('did:web:'.length).split(':')[0].split('/')[0].toLowerCase()
  }
  try { return new URL(value).hostname.toLowerCase() } catch (e) { return null }
}

function _relIsHome(ids, value) {
  return !!ids.homeHost && _relHost(value) === ids.homeHost
}

/** Whether this membership row belongs to the home Vine being synced. */
function _relLocalMembership(vault, m) {
  var ids = _relActiveIds(vault)
  if (!ids) return false
  if (m.cluster_id) return ids.clusters.has(m.cluster_id) || _relIsHome(ids, m.vine_endpoint)
  if (m.scope === 'vignard') return ids.vignards.has(m.node_id) || _relIsHome(ids, m.vine_endpoint)
  return ids.vines.has(m.node_id) || ids.vines.has(m.vine_id) ||
         ids.vineDids.has(m.node_id) || ids.vineDids.has(m.issuer_did) ||
         _relIsHome(ids, m.vine_endpoint)
}

/** Whether a credential still corresponds to an active server relation. */
function relationCredentialActive(vault, cred) {
  var ids = _relActiveIds(vault)
  if (!ids) return true
  if (!cred) return false

  var isLocal = false
  if (cred.cluster_id) {
    isLocal = ids.clusters.has(cred.cluster_id) || _relIsHome(ids, cred.vine_endpoint)
  } else if (cred.scope === 'vignard') {
    isLocal = ids.vignards.has(cred.node_id || cred.vignard_did) || _relIsHome(ids, cred.vine_endpoint)
  } else {
    isLocal = ids.vines.has(cred.node_id) || ids.vines.has(cred.issuer_did) ||
      ids.vineDids.has(cred.issuer_did) || ids.vineDids.has(cred.node_id) ||
      _relIsHome(ids, cred.vine_endpoint) || _relIsHome(ids, cred.offer_endpoint) ||
      _relIsHome(ids, cred.issuer_did)
  }
  if (!isLocal) return true   // another Vine: not judged by the home snapshot

  if (cred.cluster_id) return ids.clusters.has(cred.cluster_id)
  if (cred.scope === 'vignard') return ids.vignards.has(cred.node_id || cred.vignard_did)
  if (cred.scope === 'cluster') return false
  return ids.vines.has(cred.node_id) || ids.vines.has(cred.issuer_did) ||
         ids.vineDids.has(cred.issuer_did) || ids.vineDids.has(cred.node_id)
}

function _relUpsert(list, match, next) {
  var i = list.findIndex(match)
  if (i >= 0) list[i] = Object.assign({}, list[i], next)
  else list.push(next)
}

async function syncRelationsFromSwitchboard() {
  if (!appState.vault || !appState.vaultKey || !appState.stored) return
  var did = appState.vault.identity.id
  var base = new URL(SYNC_ENDPOINT).origin
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
  var beforeSnapshot = JSON.stringify(vault.relationSnapshot || null)

  var vines = (rel.vines || []).map(function (v) {
    return { id: v.id, did: v.did || null, name: v.name || v.id, endpoint: v.endpoint || null, status: v.status, role: v.role }
  })
  vines.forEach(function (v) {
    _relUpsert(next, function (m) {
      return m.vine_id === v.id || m.node_id === v.id ||
             (v.did && (m.issuer_did === v.did || m.node_id === v.did))
    }, {
      node_id: v.id, vine_id: v.id, vine_did: v.did, node_name: v.name,
      vine_endpoint: v.endpoint, scope: 'vine', status: v.status, role: v.role, stale: false,
    })
  })

  var clusters = (rel.clusters || []).map(function (c) { return c.id })
  ;(rel.clusters || []).forEach(function (c) {
    _relUpsert(next, function (m) { return m.cluster_id === c.id },
      {
        cluster_id: c.id, node_id: c.id, cluster_name: c.name, node_name: c.name,
        scope: 'cluster', status: c.status, is_issuer: !!c.is_issuer, stale: false,
      })
  })

  var vignards = (rel.vignards || []).map(function (g) { return g.id })
  ;(rel.vignards || []).forEach(function (g) {
    _relUpsert(next, function (m) { return m.node_id === g.id && m.scope === 'vignard' },
      { node_id: g.id, node_name: g.name, scope: 'vignard', status: g.status, role: g.role, stale: false })
  })

  vault.memberships = next
  vault.relationSnapshot = {
    vines: vines, clusters: clusters, vignards: vignards,
    homeHost: new URL(SYNC_ENDPOINT).hostname.toLowerCase(),
    at: new Date().toISOString(),
  }

  // Keep history, but hide relations the home Vine no longer returns.
  next.forEach(function (m) {
    if (!_relLocalMembership(vault, m)) return
    if (m.cluster_id) m.stale = !clusters.includes(m.cluster_id)
    else if (m.scope === 'vignard') m.stale = !vignards.includes(m.node_id)
    else {
      m.stale = !(vines.some(function (v) {
        return v.id === m.node_id || v.id === m.vine_id ||
          (v.did && (v.did === m.issuer_did || v.did === m.node_id))
      }))
    }
  })

  if (before === JSON.stringify(next) &&
      beforeSnapshot === JSON.stringify(vault.relationSnapshot)) return
  try {
    var payload = await saveVault(appState.vaultKey, vault, appState.stored.salt)
    await persist(payload)
    appState.stored = payload
  } catch (e) { /* keep in-memory state; next unlock retries */ }
}
