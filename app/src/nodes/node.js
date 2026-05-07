/**
 * PASSPORT — Sovereign Identity System
 * app/src/nodes/node.js
 *
 * The community layer. Manages nodes, members, sessions, and Level 2 detection.
 *
 * A node is created the moment a second identity joins a founder.
 * Before that, a single passport holder is just a passport holder — not yet a node.
 *
 * Responsibilities:
 *   1. Node lifecycle  — create, update settings, retrieve
 *   2. Member management — add, transition status, remove
 *   3. Permission guards — only APPROVED issuers can promote members
 *   4. Naming prompt — fires at NAMING_PROMPT_THRESHOLD approved members
 *   5. Level 2 trigger — detects multi-node founders, returns formation prompt
 *   6. Session management — roaming/temporary sessions, expiry, promotion
 *   7. Node summary — full picture for UI rendering
 *
 * Node state is stored in a nodes[] array in the vault for the node admin.
 * For regular members, node info arrives via credentials and referrals.
 *
 * A node admin is any APPROVED member with is_issuer === true.
 */

import {
  STATUS,
  STATUS_WEIGHT,
  LOCATION_MODE,
  NETWORK_LEVEL,
  CREDENTIAL_TYPE,
  DEFAULT_DISPLAY_NAMES,
  getReferralWarning,
  shouldPromptNetworkFormation,
} from '../../shared/models.js'

import {
  isValidTransition,
  isActive,
  isBlocked,
  displayStatus,
} from '../../shared/status.js'

import {
  canIssue,
  canPromote,
  shouldPromptNaming,
  isSessionActive,
  isWithinRadius,
  DEFAULT_SESSION_DURATION_MIN,
  MAX_SESSION_DURATION_MIN,
  resolveNetworkFormationPrompt,
  NAMING_PROMPT_THRESHOLD,
} from '../../shared/rules.js'


// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function uuid()  { return crypto.randomUUID() }
function now()   { return new Date().toISOString() }

function addMinutes(isoString, minutes) {
  return new Date(new Date(isoString).getTime() + minutes * 60_000).toISOString()
}

/**
 * Get a member record from a node by identity ID.
 * @param {Object} node
 * @param {string} identityId
 * @returns {Object|null}
 */
function getMember(node, identityId) {
  return node.members.find(m => m.identity_id === identityId) ?? null
}

/**
 * Assert that an actor has issuer rights in a node.
 * Throws with a clear error code if not.
 * @param {Object} node
 * @param {string} actorId
 */
function assertCanIssue(node, actorId) {
  const actor = getMember(node, actorId)
  if (!canIssue(actor)) {
    throw Object.assign(
      new Error(`Identity ${actorId} does not have issuer rights in node ${node.id}`),
      { code: 'INSUFFICIENT_PERMISSIONS' }
    )
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// 1. NODE LIFECYCLE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a new node.
 *
 * Called when:
 *   - A founder invites a second person (first node auto-creation)
 *   - An APPROVED issuer deliberately creates a new sub-node
 *
 * The founder is automatically added as APPROVED + is_issuer.
 *
 * @param {string}  founderIdentityId
 * @param {Object}  [options]
 * @param {string}  [options.name]            - display name (default: 'Cluster')
 * @param {string}  [options.description]
 * @param {string}  [options.location_mode]   - LOCATION_MODE value
 * @param {Object}  [options.location]        - LocationModel
 * @param {boolean} [options.virtual]         - default: true
 * @param {boolean} [options.allow_temporary] - default: false
 * @returns {Object}  NodeModel
 */
export function createNode(founderIdentityId, options = {}) {
  const nodeId = uuid()
  const ts     = now()

  const node = {
    id:             nodeId,
    name:           options.name ?? 'Cluster',
    description:    options.description ?? null,
    founded_by:     founderIdentityId,
    parent_network: null,
    location_mode:  options.location_mode ?? LOCATION_MODE.OPEN,
    location:       options.location ?? null,
    virtual:        options.virtual ?? true,
    allow_temporary: options.allow_temporary ?? false,
    members:        [],
    display_names:  null,
    sessions:       [],
    created_at:     ts,
    updated_at:     null,
  }

  // Founder is auto-approved as issuer
  node.members.push({
    identity_id:      founderIdentityId,
    status:           STATUS.APPROVED,
    referral_id:      null,
    referral_weight:  STATUS_WEIGHT[STATUS.APPROVED],
    can_invite:       true,
    is_issuer:        true,
    session_id:       null,
    expires_at:       null,
    joined_at:        ts,
    updated_at:       null,
    handle:           options.founderHandle ?? null,
  })

  return node
}

/**
 * Update node settings.
 * Only an APPROVED issuer can change settings.
 *
 * @param {Object} node
 * @param {string} actorId        - identity performing the update
 * @param {Object} updates        - fields to update
 * @returns {Object}  updated node
 */
export function updateNodeSettings(node, actorId, updates) {
  assertCanIssue(node, actorId)

  const allowed = ['name', 'description', 'location_mode', 'location',
                   'virtual', 'allow_temporary', 'display_names']

  for (const key of allowed) {
    if (key in updates) node[key] = updates[key]
  }

  node.updated_at = now()
  return node
}

/**
 * Get a node summary suitable for display.
 *
 * @param {Object}  node
 * @param {Object}  [displayNames]  - custom names override
 * @returns {Object}
 */
export function getNodeSummary(node, displayNames) {
  const dn      = displayNames ?? node.display_names ?? DEFAULT_DISPLAY_NAMES
  const members = node.members

  const byStatus = Object.fromEntries(
    Object.values(STATUS).map(s => [s, members.filter(m => m.status === s).length])
  )

  return {
    id:             node.id,
    name:           node.name,
    description:    node.description,
    founded_by:     node.founded_by,
    parent_network: node.parent_network,
    location_mode:  node.location_mode,
    virtual:        node.virtual,
    allow_temporary: node.allow_temporary,
    created_at:     node.created_at,

    // Member counts
    totalMembers:     members.length,
    approvedCount:    byStatus[STATUS.APPROVED]  ?? 0,
    invitedCount:     byStatus[STATUS.INVITED]   ?? 0,
    candidateCount:   byStatus[STATUS.CANDIDATE] ?? 0,
    temporaryCount:   byStatus[STATUS.TEMPORARY] ?? 0,
    suspendedCount:   byStatus[STATUS.SUSPENDED] ?? 0,

    // Prompts
    showNamingPrompt:   shouldPromptNaming(node),
    activeSessions:     (node.sessions ?? []).filter(isSessionActive).length,

    // Display
    displayNames:  dn,
    memberLabel:   dn.approved  ?? DEFAULT_DISPLAY_NAMES.approved,
    nodeLabel:     dn.node      ?? DEFAULT_DISPLAY_NAMES.node,
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// 2. MEMBER MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Add a new member to a node.
 * Called when an invitation is accepted and the candidate first appears.
 * Initial status is always INVITED unless overridden (e.g. admin direct-add).
 *
 * @param {Object} node
 * @param {string} actorId          - identity performing the add (must be issuer)
 * @param {Object} newMember        - { identity_id, referral_id?, referral_weight?, handle? }
 * @param {string} [initialStatus]  - default STATUS.INVITED
 * @returns {Object}  updated node
 */
export function addMember(node, actorId, newMember, initialStatus = STATUS.INVITED) {
  assertCanIssue(node, actorId)

  // No duplicates
  if (getMember(node, newMember.identity_id)) {
    throw Object.assign(
      new Error(`Identity ${newMember.identity_id} is already a member of node ${node.id}`),
      { code: 'ALREADY_A_MEMBER' }
    )
  }

  const ts = now()
  node.members.push({
    identity_id:      newMember.identity_id,
    status:           initialStatus,
    referral_id:      newMember.referral_id ?? null,
    referral_weight:  newMember.referral_weight ?? 0,
    can_invite:       initialStatus === STATUS.APPROVED,
    is_issuer:        false,
    session_id:       null,
    expires_at:       null,
    joined_at:        ts,
    updated_at:       null,
    handle:           newMember.handle ?? null,
  })

  node.updated_at = now()
  return node
}

/**
 * Transition a member's status.
 * Only APPROVED issuers can perform transitions.
 * Validates against the state machine in shared/status.js.
 *
 * @param {Object} node
 * @param {string} actorId      - issuer performing the change
 * @param {string} targetId     - member being changed
 * @param {string} newStatus    - STATUS value
 * @returns {{ node: Object, warning: string|null }}
 */
export function transitionMemberStatus(node, actorId, targetId, newStatus) {
  assertCanIssue(node, actorId)

  // Cannot change own status
  if (actorId === targetId) {
    throw Object.assign(
      new Error('An issuer cannot change their own status'),
      { code: 'SELF_TRANSITION_FORBIDDEN' }
    )
  }

  const member = getMember(node, targetId)
  if (!member) {
    throw Object.assign(
      new Error(`Member ${targetId} not found in node ${node.id}`),
      { code: 'MEMBER_NOT_FOUND' }
    )
  }

  if (!isValidTransition(member.status, newStatus)) {
    throw Object.assign(
      new Error(`Invalid status transition: ${member.status} → ${newStatus}`),
      { code: 'INVALID_TRANSITION' }
    )
  }

  const oldStatus    = member.status
  member.status      = newStatus
  member.can_invite  = newStatus === STATUS.APPROVED
  member.updated_at  = now()

  // Clear session data if leaving TEMPORARY
  if (oldStatus === STATUS.TEMPORARY && newStatus !== STATUS.TEMPORARY) {
    member.session_id = null
    member.expires_at = null
  }

  node.updated_at = now()

  // Get referral warning for candidate arrival
  let warning = null
  if (newStatus === STATUS.CANDIDATE && member.referral_id) {
    const referral       = { id: member.referral_id, weight: member.referral_weight }
    const referrerMember = getMember(node, member.referral_id) // may be null
    warning = getReferralWarning(referral, referrerMember)
  }

  return { node, warning }
}

/**
 * Grant issuer rights to an APPROVED member.
 * Only existing issuers can grant issuer rights.
 *
 * @param {Object} node
 * @param {string} actorId    - issuer granting rights
 * @param {string} targetId   - member receiving issuer rights
 * @returns {Object}  updated node
 */
export function grantIssuerRights(node, actorId, targetId) {
  assertCanIssue(node, actorId)

  if (actorId === targetId) {
    throw Object.assign(
      new Error('Cannot grant issuer rights to yourself'),
      { code: 'SELF_GRANT_FORBIDDEN' }
    )
  }

  const target = getMember(node, targetId)
  if (!target) {
    throw Object.assign(
      new Error(`Member ${targetId} not found`),
      { code: 'MEMBER_NOT_FOUND' }
    )
  }

  if (target.status !== STATUS.APPROVED) {
    throw Object.assign(
      new Error(`Member must be APPROVED before receiving issuer rights`),
      { code: 'MEMBER_NOT_APPROVED' }
    )
  }

  target.is_issuer  = true
  target.updated_at = now()
  node.updated_at   = now()
  return node
}

/**
 * Revoke issuer rights from a member.
 * Cannot revoke the last issuer — node must always have at least one.
 *
 * @param {Object} node
 * @param {string} actorId
 * @param {string} targetId
 * @returns {Object}  updated node
 */
export function revokeIssuerRights(node, actorId, targetId) {
  assertCanIssue(node, actorId)

  const issuers = node.members.filter(m => m.is_issuer && m.status === STATUS.APPROVED)
  if (issuers.length <= 1) {
    throw Object.assign(
      new Error('Cannot revoke the last issuer. Promote another member first.'),
      { code: 'LAST_ISSUER' }
    )
  }

  const target = getMember(node, targetId)
  if (!target) {
    throw Object.assign(new Error(`Member ${targetId} not found`), { code: 'MEMBER_NOT_FOUND' })
  }

  target.is_issuer  = false
  target.updated_at = now()
  node.updated_at   = now()
  return node
}

/**
 * Get the referral warning for a candidate presenting at the node.
 * Called when a member transitions INVITED → CANDIDATE.
 *
 * @param {Object} node
 * @param {string} candidateId
 * @returns {string|null}
 */
export function getCandidateArrivalWarning(node, candidateId) {
  const candidate = getMember(node, candidateId)
  if (!candidate || !candidate.referral_id) return null

  // Find the referrer's CURRENT membership in this node
  // Note: referral_id stores the referrer's identity_id (not a referral UUID)
  const referrerMember = getMember(node, candidate.referral_id)

  const referral = {
    id:     candidate.referral_id,
    weight: candidate.referral_weight,
  }

  return getReferralWarning(referral, referrerMember)
}


// ─────────────────────────────────────────────────────────────────────────────
// 3. NAMING PROMPT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if the naming prompt should be shown.
 * Returns prompt data if yes, null if no.
 *
 * @param {Object} node
 * @returns {Object|null}
 */
export function checkNamingPrompt(node) {
  if (!shouldPromptNaming(node)) return null

  return {
    trigger:    'member_threshold',
    threshold:  NAMING_PROMPT_THRESHOLD,
    message:    `Your community has grown to ${NAMING_PROMPT_THRESHOLD}+ members. ` +
                `What would you like to call your members, your community, and your groups?`,
    fields: [
      { key: 'identity',  label: 'What do you call a member?',     placeholder: 'Grape, Villager, Member...' },
      { key: 'node',      label: 'What do you call your community?', placeholder: 'Cluster, Grove, Circle...' },
      { key: 'network',   label: 'What do you call a group of communities?', placeholder: 'Vine, Nation, House...' },
      { key: 'referral',  label: 'What do you call an invitation?', placeholder: 'Touch, Blessing, Handshake...' },
      { key: 'approved',  label: 'What do you call a full member?', placeholder: 'Rooted, Citizen, Member...' },
      { key: 'invited',   label: 'What do you call a pending member?', placeholder: 'Seedling, Guest, Visitor...' },
    ],
  }
}

/**
 * Save custom display names for a node.
 *
 * @param {Object} node
 * @param {string} actorId
 * @param {Object} names    - partial DisplayNamesModel
 * @returns {Object}  updated node
 */
export function setDisplayNames(node, actorId, names) {
  assertCanIssue(node, actorId)

  node.display_names = {
    ...(node.display_names ?? {}),
    ...names,
  }
  node.updated_at = now()
  return node
}


// ─────────────────────────────────────────────────────────────────────────────
// 4. LEVEL 2 TRIGGER — NETWORK FORMATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if a founder's second node creation should trigger a Level 2 prompt.
 * Call this BEFORE creating a second node for the same founder.
 *
 * @param {string}  founderIdentityId
 * @param {Object[]} allNodes           - all known nodes in the system
 * @param {string}  newNodeName         - name of the node being created
 * @returns {Object|null}  prompt data, or null if no Level 2 needed
 */
export function checkNetworkFormationPrompt(founderIdentityId, allNodes, newNodeName) {
  const founderNodes = allNodes.filter(
    n => n.founded_by === founderIdentityId && !n.parent_network
  )

  if (founderNodes.length === 0) return null  // first node — no prompt

  return resolveNetworkFormationPrompt(founderNodes, newNodeName)
}

/**
 * Form a Level 2 network from two or more nodes.
 * Called after the founder confirms the Level 2 prompt.
 * Returns the new network object (to be stored separately).
 *
 * @param {string}    networkName
 * @param {Object[]}  nodes           - nodes to include
 * @param {string[]}  founderIds      - collective governance (all node founders)
 * @returns {Object}  NetworkModel
 */
export function formNetwork(networkName, nodes, founderIds) {
  const networkId = uuid()
  const ts        = now()

  const network = {
    id:               networkId,
    name:             networkName ?? 'Vine',
    description:      null,
    nodes:            nodes.map(n => n.id),
    founded_by:       [...new Set(founderIds)],
    parent_registry:  null,
    display_names:    null,
    created_at:       ts,
    updated_at:       null,
  }

  // Link nodes to network
  for (const node of nodes) {
    node.parent_network = networkId
    node.updated_at     = ts
  }

  return { network, nodes }
}


// ─────────────────────────────────────────────────────────────────────────────
// 5. SESSION MANAGEMENT — roaming / temporary
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a roaming session within a node.
 * Only APPROVED members can create sessions.
 * Requires node.allow_temporary === true.
 *
 * @param {Object}  node
 * @param {string}  creatorId         - must be APPROVED in this node
 * @param {Object}  [options]
 * @param {Object}  [options.location]      - GPS at session creation
 * @param {number}  [options.duration_min]  - session length (default 30, max 480)
 * @param {string}  [options.purpose]
 * @returns {Object}  session object
 */
export function createSession(node, creatorId, options = {}) {
  if (!node.allow_temporary) {
    throw Object.assign(
      new Error('This node does not allow temporary sessions'),
      { code: 'SESSIONS_DISABLED' }
    )
  }

  const creator = getMember(node, creatorId)
  if (!creator || creator.status !== STATUS.APPROVED) {
    throw Object.assign(
      new Error('Only APPROVED members can create sessions'),
      { code: 'INSUFFICIENT_PERMISSIONS' }
    )
  }

  const duration = Math.min(
    options.duration_min ?? DEFAULT_SESSION_DURATION_MIN,
    MAX_SESSION_DURATION_MIN
  )

  const ts      = now()
  const session = {
    id:           uuid(),
    created_by:   creatorId,
    node_id:      node.id,
    location:     options.location ?? null,
    duration_min: duration,
    created_at:   ts,
    expires_at:   addMinutes(ts, duration),
    members:      [],
    purpose:      options.purpose ?? null,
    active:       true,
  }

  if (!node.sessions) node.sessions = []
  node.sessions.push(session)
  node.updated_at = now()

  return session
}

/**
 * Add a temporary member to a session.
 * They get STATUS.TEMPORARY with the session's expiry.
 *
 * @param {Object} node
 * @param {Object} session
 * @param {string} creatorId    - session creator (must be APPROVED)
 * @param {Object} newMember    - { identity_id, handle? }
 * @returns {Object}  updated node
 */
export function addSessionMember(node, session, creatorId, newMember) {
  if (!isSessionActive(session)) {
    throw Object.assign(
      new Error('Session has expired'),
      { code: 'SESSION_EXPIRED' }
    )
  }

  const creator = getMember(node, creatorId)
  if (!creator || creator.status !== STATUS.APPROVED) {
    throw Object.assign(
      new Error('Only APPROVED members can add session members'),
      { code: 'INSUFFICIENT_PERMISSIONS' }
    )
  }

  // If already a member, don't downgrade them
  const existing = getMember(node, newMember.identity_id)
  if (existing && isActive(existing.status)) {
    // Already has a real status — just add to session roster
    if (!session.members.includes(newMember.identity_id)) {
      session.members.push(newMember.identity_id)
    }
    return node
  }

  const ts = now()

  if (existing) {
    // Update existing record to TEMPORARY
    existing.status     = STATUS.TEMPORARY
    existing.session_id = session.id
    existing.expires_at = session.expires_at
    existing.updated_at = ts
  } else {
    // Add new TEMPORARY member
    node.members.push({
      identity_id:      newMember.identity_id,
      status:           STATUS.TEMPORARY,
      referral_id:      null,
      referral_weight:  0,
      can_invite:       false,
      is_issuer:        false,
      session_id:       session.id,
      expires_at:       session.expires_at,
      joined_at:        ts,
      updated_at:       null,
      handle:           newMember.handle ?? null,
    })
  }

  if (!session.members.includes(newMember.identity_id)) {
    session.members.push(newMember.identity_id)
  }

  node.updated_at = now()
  return node
}

/**
 * Expire sessions and revert TEMPORARY members to UNKNOWN.
 * Call this on node load to clean up stale sessions.
 *
 * @param {Object} node
 * @returns {{ node: Object, expiredCount: number }}
 */
export function expireSessions(node) {
  if (!node.sessions) return { node, expiredCount: 0 }

  let expiredCount = 0

  for (const session of node.sessions) {
    if (!session.active) continue
    if (isSessionActive(session)) continue

    // Session has expired
    session.active = false
    expiredCount++

    // Revert TEMPORARY members back to UNKNOWN
    for (const memberId of session.members) {
      const member = getMember(node, memberId)
      if (member && member.status === STATUS.TEMPORARY && member.session_id === session.id) {
        member.status     = STATUS.UNKNOWN
        member.session_id = null
        member.expires_at = null
        member.updated_at = now()
      }
    }
  }

  if (expiredCount > 0) node.updated_at = now()
  return { node, expiredCount }
}

/**
 * Manually close a session before it expires.
 *
 * @param {Object} node
 * @param {string} sessionId
 * @param {string} actorId    - must be session creator or APPROVED issuer
 * @returns {Object}  updated node
 */
export function closeSession(node, sessionId, actorId) {
  const session = (node.sessions ?? []).find(s => s.id === sessionId)
  if (!session) {
    throw Object.assign(new Error('Session not found'), { code: 'SESSION_NOT_FOUND' })
  }

  const actor = getMember(node, actorId)
  if (session.created_by !== actorId && !canIssue(actor)) {
    throw Object.assign(
      new Error('Only the session creator or an issuer can close a session'),
      { code: 'INSUFFICIENT_PERMISSIONS' }
    )
  }

  session.active    = false
  session.closed_at = now()

  // Revert TEMPORARY members
  for (const memberId of session.members) {
    const member = getMember(node, memberId)
    if (member && member.status === STATUS.TEMPORARY && member.session_id === sessionId) {
      member.status     = STATUS.UNKNOWN
      member.session_id = null
      member.expires_at = null
      member.updated_at = now()
    }
  }

  node.updated_at = now()
  return node
}


// ─────────────────────────────────────────────────────────────────────────────
// 6. MEMBER QUERIES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get all members filtered by status.
 * @param {Object}   node
 * @param {string}   [status]  - if omitted, returns all
 * @returns {Array}
 */
export function getMembers(node, status) {
  if (!status) return [...node.members]
  return node.members.filter(m => m.status === status)
}

/**
 * Get all APPROVED issuers in a node.
 * @param {Object} node
 * @returns {Array}
 */
export function getIssuers(node) {
  return node.members.filter(m => m.status === STATUS.APPROVED && m.is_issuer)
}

/**
 * Get a specific member with their full context.
 * Includes the referral warning if they are a CANDIDATE.
 *
 * @param {Object} node
 * @param {string} identityId
 * @returns {Object|null}
 */
export function getMemberWithContext(node, identityId) {
  const member = getMember(node, identityId)
  if (!member) return null

  let arrivalWarning = null
  if (member.status === STATUS.CANDIDATE) {
    arrivalWarning = getCandidateArrivalWarning(node, identityId)
  }

  return {
    ...member,
    arrivalWarning,
    isActive:  isActive(member.status),
    isBlocked: isBlocked(member.status),
  }
}

/**
 * Check if an identity is a member of a node with at least a given status weight.
 *
 * @param {Object} node
 * @param {string} identityId
 * @param {string} minimumStatus  - STATUS value
 * @returns {boolean}
 */
export function hasMemberStatus(node, identityId, minimumStatus) {
  const member = getMember(node, identityId)
  if (!member) return false
  return STATUS_WEIGHT[member.status] >= STATUS_WEIGHT[minimumStatus]
}
