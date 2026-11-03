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

function _relUpsert(list, match, next) {
  var i = list.findIndex(match)
  if (i >= 0) list[i] = Object.assign({}, list[i], next)
  else list.push(next)
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
    var existing = next.some(function (m) { return m.cluster_id === c.id })
    var active = (c.cluster_status || 'active') === 'active'
    // Keep a revoked hosted Cluster as history, but never invent one locally.
    if (!active && !existing) return
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
    _relUpsert(next, function (m) { return m.node_id === g.id && m.scope === 'vignard' },
      { node_id: g.id, node_name: g.name, scope: 'vignard', status: g.status, role: g.role, stale: false })
  })

  // Ownership is carried by ownClusters + ownership proofs, never by a
  // duplicate "joined" row. Remove only the duplicate, never the Cluster.
  next = next.filter(function (m) { return !(m.cluster_id && ownIds[m.cluster_id]) })
  vault.memberships = next
  vault.relationSnapshot = {
    vines: vines, clusters: clusters, vignards: vignards,
    homeHost: new URL(SYNC_ENDPOINT).hostname.toLowerCase(),
    at: new Date().toISOString(),
  }

  // Keep history, but hide relations the home Vine no longer returns or has
  // revoked. Hosting revocation is not member departure or Cluster deletion.
  next.forEach(function (m) {
    if (m.cluster_id && clusterStatus[m.cluster_id]) {
      m.stale = clusterStatus[m.cluster_id] !== 'active'
      return
    }
    if (!_relLocalMembership(vault, m)) return
    if (m.scope === 'vignard') m.stale = !vignards.includes(m.node_id)
    else if (!m.cluster_id) {
      m.stale = !(vines.some(function (v) {
        return v.id === m.node_id || v.id === m.vine_id ||
          (v.did && (v.did === m.issuer_did || v.did === m.node_id))
      }))
    }
  })

  if (before === JSON.stringify(next) &&
      beforeOwn === JSON.stringify(vault.ownClusters || null) &&
      beforeSnapshot === JSON.stringify(vault.relationSnapshot)) return
  try {
    var payload = await saveVault(appState.vaultKey, vault, appState.stored.salt)
    await persist(payload)
    appState.stored = payload
  } catch (e) { /* keep in-memory state; next unlock retries */ }
}
