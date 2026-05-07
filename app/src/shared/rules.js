/**
 * PASSPORT — Sovereign Identity System
 * shared/rules.js
 *
 * Business logic rules that govern the system.
 * Pure functions — no side effects, no async, no I/O.
 * Fully testable in isolation.
 *
 * These rules are the constitution of the network.
 * Any UI, API, or agent that makes governance decisions imports from here.
 */

import {
  STATUS,
  STATUS_WEIGHT,
  LOCATION_MODE,
  canInvite,
  getReferralWarning,
  shouldPromptNetworkFormation,
} from './models.js'

export {
  canInvite,
  getReferralWarning,
  shouldPromptNetworkFormation,
}

/**
 * Can `identity` act as an issuer in `node`?
 * Requires: APPROVED status + IssuerCredential for this node.
 *
 * @param {NodeMember} membership
 * @returns {boolean}
 */
export function canIssue(membership) {
  return membership?.status === STATUS.APPROVED && membership?.is_issuer === true
}

/**
 * Can `identity` promote another member in `node`?
 * Only APPROVED issuers can change member status.
 *
 * @param {NodeMember} actorMembership
 * @returns {boolean}
 */
export function canPromote(actorMembership) {
  return canIssue(actorMembership)
}

/**
 * Minimum node member count before naming prompt fires.
 * When a node reaches this count, founders are prompted to
 * set custom display names (grape, vine, etc.)
 */
export const NAMING_PROMPT_THRESHOLD = 3

/**
 * Should the naming prompt be shown?
 * @param {Node} node
 * @returns {boolean}
 */
export function shouldPromptNaming(node) {
  const approvedCount = node.members.filter(
    m => m.status === STATUS.APPROVED
  ).length
  return approvedCount >= NAMING_PROMPT_THRESHOLD && !node.display_names
}

/**
 * Default session duration in minutes.
 */
export const DEFAULT_SESSION_DURATION_MIN = 30

/**
 * Maximum session duration in minutes.
 */
export const MAX_SESSION_DURATION_MIN = 480  // 8 hours

/**
 * Is a session still active?
 * @param {Session} session
 * @returns {boolean}
 */
export function isSessionActive(session) {
  if (!session.active) return false
  return new Date(session.expires_at) > new Date()
}

/**
 * GPS proximity check — is a user within a node's acceptance radius?
 * @param {Location} userLocation
 * @param {Location} nodeLocation
 * @returns {boolean}
 */
export function isWithinRadius(userLocation, nodeLocation) {
  if (!userLocation?.lat || !nodeLocation?.lat) return false

  const R = 6371000  // Earth radius in meters
  const dLat = toRad(nodeLocation.lat - userLocation.lat)
  const dLng = toRad(nodeLocation.lng - userLocation.lng)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(userLocation.lat)) *
    Math.cos(toRad(nodeLocation.lat)) *
    Math.sin(dLng / 2) ** 2
  const distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return distance <= (nodeLocation.radius_m ?? 100)
}

function toRad(deg) {
  return deg * (Math.PI / 180)
}

/**
 * Compute the full invitation context for a UI prompt.
 * Returns everything the UI needs to render the invitation flow.
 *
 * @param {Object} params
 * @param {Identity}   params.inviter
 * @param {NodeMember} params.inviterMembership      - in target node (may be null)
 * @param {boolean}    params.inviterApprovedElsewhere
 * @param {Node}       params.node
 * @param {Location}   [params.inviterLocation]
 * @returns {InvitationContext}
 */
export function resolveInvitationContext({
  inviter,
  inviterMembership,
  inviterApprovedElsewhere,
  node,
  inviterLocation,
}) {
  const { allowed, warning } = canInvite(
    inviterMembership,
    inviterApprovedElsewhere,
    node
  )

  const locationMatch = node.location_mode === LOCATION_MODE.FIXED
    ? isWithinRadius(inviterLocation, node.location)
    : true

  const locationWarning =
    node.location_mode === LOCATION_MODE.FIXED && !locationMatch
      ? `You appear to be outside this node's location radius. ` +
        `The invitation will be marked as remote.`
      : null

  return {
    allowed,
    warning,
    locationWarning,
    referralWeight: STATUS_WEIGHT[inviterMembership?.status ?? STATUS.UNKNOWN],
    disclosureOptions: {
      handle:       true,   // always available to share
      memberships:  true,
      role:         inviterMembership?.is_issuer ?? false,
      since:        !!inviterMembership?.joined_at,
    },
  }
}

/**
 * Resolve what prompt to show when forming a Level 2 network.
 * Called when a second node is about to be created by the same founder.
 *
 * @param {Node[]} existingFounderNodes
 * @param {string} newNodeName
 * @returns {NetworkFormationPrompt}
 */
export function resolveNetworkFormationPrompt(existingFounderNodes, newNodeName) {
  return {
    trigger:      'second_node_creation',
    message:      `Creating "${newNodeName}" will link it with your existing ` +
                  `node "${existingFounderNodes[0]?.name}". ` +
                  `This initiates a Level 2 Network (Vine). ` +
                  `All approved members of both nodes will be notified ` +
                  `and invited to participate in collective governance.`,
    existingNodes: existingFounderNodes.map(n => ({ id: n.id, name: n.name })),
    requiresConsent: true,
  }
}
