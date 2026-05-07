/**
 * PASSPORT — Sovereign Identity System
 * app/src/identity/identity.js
 *
 * The identity layer. Sits directly on top of vault.js.
 * Manages the passport holder's profile, node memberships, and referral signing.
 *
 * This module never touches crypto primitives directly —
 * it calls vault.js for all signing and persistence.
 *
 * Responsibilities:
 *   1. Profile — read and update handle, avatar, personal info
 *   2. Membership — track which nodes Eva belongs to, her status in each
 *   3. Referrals — build, sign, and package a referral credential
 *   4. Disclosure — compute what Eva is allowed/choosing to share
 *   5. Invitation context — full permission check before offering an invite
 *   6. Import — receive and store an inbound referral or credential
 *
 * All state lives in the vault. This module reads from and writes to it.
 * Call saveVault() after any mutation and persist the result.
 */

import { sign, saveVault, persistVault } from '../crypto/vault.js'
import {
  STATUS,
  STATUS_WEIGHT,
  CREDENTIAL_TYPE,
  DEFAULT_DISPLAY_NAMES,
  canInvite,
  getReferralWarning,
} from '../../shared/models.js'
import { isValidTransition, isActive, isBlocked } from '../../shared/status.js'
import {
  canIssue,
  resolveInvitationContext,
  shouldPromptNaming,
  NAMING_PROMPT_THRESHOLD,
} from '../../shared/rules.js'


// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function uuid() {
  return crypto.randomUUID()
}

function now() {
  return new Date().toISOString()
}

/**
 * Find this identity's membership record in a specific node.
 * Returns null if not a member.
 *
 * @param {Object} vault
 * @param {string} nodeId
 * @returns {Object|null}  NodeMember record from vault.memberships
 */
function getMembership(vault, nodeId) {
  return vault.memberships?.find(m => m.node_id === nodeId) ?? null
}

/**
 * Is this identity approved in at least one node?
 * Used for invitation permission checks.
 *
 * @param {Object} vault
 * @returns {boolean}
 */
function isApprovedAnywhere(vault) {
  return (vault.memberships ?? []).some(m => m.status === STATUS.APPROVED)
}


// ─────────────────────────────────────────────────────────────────────────────
// 1. PROFILE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the current identity profile from the vault.
 *
 * @param {Object} vault
 * @returns {Object}  The identity object
 */
export function getProfile(vault) {
  return { ...vault.identity }
}

/**
 * Update the identity profile.
 * Only updates fields explicitly provided — no accidental overwrites.
 *
 * Updatable fields: handle, avatar, profile.name, profile.bio, profile.email,
 *                   location, virtual
 *
 * NOT updatable here: id (DID), created_at
 *
 * @param {Object}   vault
 * @param {CryptoKey} vaultKey
 * @param {string}   salt
 * @param {Object}   updates    - partial identity fields
 * @returns {Promise<VaultPayload>}  saved payload, ready for persistVault()
 */
export async function updateProfile(vault, vaultKey, salt, updates) {
  const allowed = ['handle', 'avatar', 'location', 'virtual']
  const profileAllowed = ['name', 'bio', 'email']

  // Apply top-level fields
  for (const key of allowed) {
    if (key in updates) {
      vault.identity[key] = updates[key]
    }
  }

  // Apply nested profile fields
  if (updates.profile) {
    for (const key of profileAllowed) {
      if (key in updates.profile) {
        vault.identity.profile[key] = updates.profile[key]
      }
    }
  }

  vault.identity.updated_at = now()
  const payload = await saveVault(vaultKey, vault, salt)
  await persistVault(payload)
  return payload
}

/**
 * Set the avatar from a File (image).
 * Converts to base64 data URI for storage in vault.
 *
 * @param {Object}    vault
 * @param {CryptoKey} vaultKey
 * @param {string}    salt
 * @param {File}      file      - image file from input[type=file]
 * @returns {Promise<VaultPayload>}
 */
export async function setAvatar(vault, vaultKey, salt, file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = async e => {
      const dataUri = e.target.result
      resolve(await updateProfile(vault, vaultKey, salt, { avatar: dataUri }))
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}


// ─────────────────────────────────────────────────────────────────────────────
// 2. MEMBERSHIP — what nodes this identity belongs to
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get all node memberships for this identity.
 *
 * @param {Object} vault
 * @returns {Array}  NodeMembership[]
 */
export function getMemberships(vault) {
  return [...(vault.memberships ?? [])]
}

/**
 * Get membership in a specific node.
 *
 * @param {Object} vault
 * @param {string} nodeId
 * @returns {Object|null}
 */
export function getMembershipInNode(vault, nodeId) {
  return getMembership(vault, nodeId)
}

/**
 * Get all nodes where this identity is APPROVED.
 *
 * @param {Object} vault
 * @returns {Array}
 */
export function getApprovedMemberships(vault) {
  return (vault.memberships ?? []).filter(m => m.status === STATUS.APPROVED)
}

/**
 * Add or update a membership record in the vault.
 * Called when:
 *   - A credential is received (new membership)
 *   - Status changes are received from a node issuer
 *
 * @param {Object}   vault
 * @param {CryptoKey} vaultKey
 * @param {string}   salt
 * @param {Object}   membership  - NodeMembership fields
 * @returns {Promise<VaultPayload>}
 */
export async function upsertMembership(vault, vaultKey, salt, membership) {
  if (!vault.memberships) vault.memberships = []

  const idx = vault.memberships.findIndex(m => m.node_id === membership.node_id)

  const record = {
    node_id:          membership.node_id,
    node_name:        membership.node_name ?? 'Unknown',
    status:           membership.status ?? STATUS.UNKNOWN,
    referral_id:      membership.referral_id ?? null,
    referral_weight:  membership.referral_weight ?? 0,
    can_invite:       membership.status === STATUS.APPROVED,
    is_issuer:        membership.is_issuer ?? false,
    session_id:       membership.session_id ?? null,
    expires_at:       membership.expires_at ?? null,
    joined_at:        membership.joined_at ?? now(),
    updated_at:       now(),
  }

  if (idx >= 0) {
    vault.memberships[idx] = { ...vault.memberships[idx], ...record }
  } else {
    vault.memberships.push(record)
  }

  const payload = await saveVault(vaultKey, vault, salt)
  await persistVault(payload)
  return payload
}


// ─────────────────────────────────────────────────────────────────────────────
// 3. REFERRALS — building and signing an invitation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute the disclosure options available to the referrer.
 * What Eva can choose to share when inviting someone.
 *
 * Always available:   nothing (minimum is just the DID signature)
 * Optional fields:    handle, memberships, role, since date
 *
 * @param {Object} vault          - Eva's vault
 * @param {string} nodeId         - which node the referral is for
 * @returns {DisclosureOptions}
 */
export function getDisclosureOptions(vault, nodeId) {
  const membership = getMembership(vault, nodeId)

  return {
    // What Eva can optionally share
    available: {
      handle:       !!vault.identity.handle,
      name:         !!vault.identity.profile?.name,
      avatar:       !!vault.identity.avatar,
      memberships:  (vault.memberships ?? []).length > 0,
      role:         membership?.is_issuer ?? false,
      since:        !!membership?.joined_at,
    },
    // Suggested defaults (handle + since are on by default, rest off)
    defaults: {
      handle:       true,
      name:         false,
      avatar:       false,
      memberships:  false,
      role:         false,
      since:        true,
    },
  }
}

/**
 * Build a referral payload (unsigned).
 * Used to show Eva a preview of what she's about to sign.
 *
 * @param {Object}  vault
 * @param {string}  toIdentityId    - the invitee's DID (or temp placeholder)
 * @param {string}  nodeId          - target node
 * @param {Object}  disclosures     - what Eva chose to share (from UI)
 * @param {string}  [note]          - optional personal message
 * @returns {Object}  unsigned referral payload
 */
export function buildReferralPayload(vault, toIdentityId, nodeId, disclosures, note) {
  const membership   = getMembership(vault, nodeId)
  const currentStatus = membership?.status ?? STATUS.UNKNOWN
  const weight        = STATUS_WEIGHT[currentStatus]

  const payload = {
    id:                   uuid(),
    type:                 CREDENTIAL_TYPE.REFERRAL,
    from_identity_id:     vault.identity.id,
    to_identity_id:       toIdentityId,
    node_id:              nodeId,
    from_status_at_time:  currentStatus,
    weight,
    disclosed:            {},
    note:                 note ?? null,
    created_at:           now(),
    expires_at:           null,
  }

  // Apply Eva's disclosure choices
  if (disclosures.handle && vault.identity.handle) {
    payload.disclosed.handle = vault.identity.handle
  }
  if (disclosures.name && vault.identity.profile?.name) {
    payload.disclosed.name = vault.identity.profile.name
  }
  if (disclosures.avatar && vault.identity.avatar) {
    payload.disclosed.avatar = vault.identity.avatar
  }
  if (disclosures.role && membership?.is_issuer) {
    payload.disclosed.role = 'issuer'
  }
  if (disclosures.since && membership?.joined_at) {
    payload.disclosed.since = membership.joined_at
  }
  if (disclosures.memberships) {
    // Share node names only — not internal IDs
    payload.disclosed.memberships = (vault.memberships ?? [])
      .filter(m => isActive(m.status))
      .map(m => m.node_name)
  }

  return payload
}

/**
 * Sign and finalize a referral.
 * This is the act of invitation — Eva signs with her private key.
 *
 * The signed referral is:
 *   - Stored in Eva's vault (her record of who she invited)
 *   - Encoded as a QR code / deep link for the invitee to scan
 *
 * @param {Object}   vault
 * @param {CryptoKey} privateKey   - from loadKeypair(vault)
 * @param {CryptoKey} vaultKey
 * @param {string}   salt
 * @param {Object}   payload       - from buildReferralPayload()
 * @returns {Promise<{ referral: Object, inviteLink: string, qrData: string }>}
 */
export async function signReferral(vault, privateKey, vaultKey, salt, payload) {
  const signature = await sign(privateKey, payload)

  const referral = { ...payload, signature }

  // Store in vault's referrals_sent list
  if (!vault.referrals_sent) vault.referrals_sent = []
  vault.referrals_sent.push(referral)

  await saveVault(vaultKey, vault, salt).then(persistVault)

  // Encode as a deep link / QR payload
  // Format: passport://invite?r=<base64url(JSON)>
  const encoded    = btoa(JSON.stringify(referral))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const inviteLink = `passport://invite?r=${encoded}`

  return { referral, inviteLink, qrData: encoded }
}

/**
 * Check if Eva is allowed to invite someone to a given node.
 * Returns the full context the UI needs to render the invitation flow.
 *
 * @param {Object}   vault            - Eva's vault
 * @param {string}   nodeId           - target node
 * @param {Object}   node             - the node object (from node store)
 * @param {Object}   [currentLocation] - Eva's GPS if available
 * @returns {InvitationContext}
 */
export function checkInvitationPermission(vault, nodeId, node, currentLocation) {
  const membership            = getMembership(vault, nodeId)
  const approvedElsewhere     = isApprovedAnywhere(vault)

  return resolveInvitationContext({
    inviter:                    vault.identity,
    inviterMembership:          membership,
    inviterApprovedElsewhere:   approvedElsewhere,
    node,
    inviterLocation:            currentLocation ?? vault.identity.location,
  })
}


// ─────────────────────────────────────────────────────────────────────────────
// 4. INBOUND — receiving a referral or credential
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse an inbound invite link / QR scan.
 * Decodes the referral payload. Does NOT verify — verification happens separately.
 *
 * @param {string} qrData   - base64url encoded referral JSON
 * @returns {Object}        - the referral payload (unsigned verification pending)
 * @throws {Error}          - 'INVALID_INVITE' if malformed
 */
export function parseInviteQR(qrData) {
  try {
    const padded = qrData.replace(/-/g, '+').replace(/_/g, '/')
      .padEnd(qrData.length + (4 - (qrData.length % 4)) % 4, '=')
    return JSON.parse(atob(padded))
  } catch {
    throw Object.assign(new Error('INVALID_INVITE'), { code: 'INVALID_INVITE' })
  }
}

/**
 * Accept an inbound referral — store it in the vault.
 * This records that someone has vouched for this identity.
 * Status remains INVITED until the node confirms.
 *
 * @param {Object}   vault
 * @param {CryptoKey} vaultKey
 * @param {string}   salt
 * @param {Object}   referral    - the verified referral payload
 * @returns {Promise<VaultPayload>}
 */
export async function acceptReferral(vault, vaultKey, salt, referral) {
  if (!vault.referrals_received) vault.referrals_received = []

  // Avoid duplicates
  const exists = vault.referrals_received.some(r => r.id === referral.id)
  if (!exists) {
    vault.referrals_received.push({ ...referral, received_at: now() })
  }

  // Create a pending membership record for this node
  await upsertMembership(vault, vaultKey, salt, {
    node_id:         referral.node_id,
    node_name:       referral.node_name ?? 'Unknown',
    status:          STATUS.INVITED,
    referral_id:     referral.id,
    referral_weight: referral.weight,
    joined_at:       now(),
  })

  const payload = await saveVault(vaultKey, vault, salt)
  await persistVault(payload)
  return payload
}

/**
 * Store a received verifiable credential in the vault.
 *
 * @param {Object}   vault
 * @param {CryptoKey} vaultKey
 * @param {string}   salt
 * @param {Object}   credential   - CredentialModel with sd_jwt
 * @returns {Promise<VaultPayload>}
 */
export async function storeCredential(vault, vaultKey, salt, credential) {
  if (!vault.credentials) vault.credentials = []

  const exists = vault.credentials.some(c => c.id === credential.id)
  if (!exists) {
    vault.credentials.push({ ...credential, stored_at: now() })
  }

  // If it's a membership credential, upsert the membership record
  if (credential.type === CREDENTIAL_TYPE.MEMBERSHIP && credential.claims) {
    await upsertMembership(vault, vaultKey, salt, {
      node_id:    credential.claims.node_id,
      node_name:  credential.claims.memberOf,
      status:     STATUS.APPROVED,
      is_issuer:  credential.claims.role === 'issuer',
      joined_at:  credential.issued_at,
    })
  }

  const payload = await saveVault(vaultKey, vault, salt)
  await persistVault(payload)
  return payload
}


// ─────────────────────────────────────────────────────────────────────────────
// 5. KEYCHAIN — passwords, API keys, secrets
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get all keychain items.
 * @param {Object} vault
 * @returns {Array}
 */
export function getKeychain(vault) {
  return [...(vault.keychain ?? [])]
}

/**
 * Add a new keychain item.
 *
 * @param {Object}   vault
 * @param {CryptoKey} vaultKey
 * @param {string}   salt
 * @param {Object}   item  - { label, type, value, url?, username?, notes? }
 * @returns {Promise<VaultPayload>}
 */
export async function addKeychainItem(vault, vaultKey, salt, item) {
  if (!vault.keychain) vault.keychain = []

  vault.keychain.push({
    id:         uuid(),
    label:      item.label,
    type:       item.type ?? 'password',
    value:      item.value,
    url:        item.url ?? null,
    username:   item.username ?? null,
    notes:      item.notes ?? null,
    created_at: now(),
    updated_at: null,
  })

  const payload = await saveVault(vaultKey, vault, salt)
  await persistVault(payload)
  return payload
}

/**
 * Update a keychain item by ID.
 *
 * @param {Object}   vault
 * @param {CryptoKey} vaultKey
 * @param {string}   salt
 * @param {string}   itemId
 * @param {Object}   updates
 * @returns {Promise<VaultPayload>}
 */
export async function updateKeychainItem(vault, vaultKey, salt, itemId, updates) {
  const idx = (vault.keychain ?? []).findIndex(k => k.id === itemId)
  if (idx < 0) throw Object.assign(new Error('ITEM_NOT_FOUND'), { code: 'ITEM_NOT_FOUND' })

  const editable = ['label', 'type', 'value', 'url', 'username', 'notes']
  for (const key of editable) {
    if (key in updates) vault.keychain[idx][key] = updates[key]
  }
  vault.keychain[idx].updated_at = now()

  const payload = await saveVault(vaultKey, vault, salt)
  await persistVault(payload)
  return payload
}

/**
 * Delete a keychain item by ID.
 *
 * @param {Object}   vault
 * @param {CryptoKey} vaultKey
 * @param {string}   salt
 * @param {string}   itemId
 * @returns {Promise<VaultPayload>}
 */
export async function deleteKeychainItem(vault, vaultKey, salt, itemId) {
  vault.keychain = (vault.keychain ?? []).filter(k => k.id !== itemId)
  const payload  = await saveVault(vaultKey, vault, salt)
  await persistVault(payload)
  return payload
}


// ─────────────────────────────────────────────────────────────────────────────
// 6. FILE LINKS — access tokens and shared file references
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get all file links.
 * @param {Object} vault
 * @returns {Array}
 */
export function getFileLinks(vault) {
  return [...(vault.files ?? [])]
}

/**
 * Add a file link to the vault.
 *
 * @param {Object}   vault
 * @param {CryptoKey} vaultKey
 * @param {string}   salt
 * @param {Object}   fileLink  - { label, url, access_token?, shared_with?, expires_at?, node_id? }
 * @returns {Promise<VaultPayload>}
 */
export async function addFileLink(vault, vaultKey, salt, fileLink) {
  if (!vault.files) vault.files = []

  vault.files.push({
    id:           uuid(),
    label:        fileLink.label,
    url:          fileLink.url,
    access_token: fileLink.access_token ?? null,
    shared_with:  fileLink.shared_with ?? [],
    expires_at:   fileLink.expires_at ?? null,
    node_id:      fileLink.node_id ?? null,
    created_at:   now(),
  })

  const payload = await saveVault(vaultKey, vault, salt)
  await persistVault(payload)
  return payload
}

/**
 * Remove a file link by ID.
 *
 * @param {Object}   vault
 * @param {CryptoKey} vaultKey
 * @param {string}   salt
 * @param {string}   fileId
 * @returns {Promise<VaultPayload>}
 */
export async function removeFileLink(vault, vaultKey, salt, fileId) {
  vault.files   = (vault.files ?? []).filter(f => f.id !== fileId)
  const payload = await saveVault(vaultKey, vault, salt)
  await persistVault(payload)
  return payload
}


// ─────────────────────────────────────────────────────────────────────────────
// 7. PROMPTS — things the UI needs to know to show the right screen
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Should the naming prompt be shown?
 * Fires when a node reaches NAMING_PROMPT_THRESHOLD approved members
 * and hasn't been named yet.
 *
 * This is called by the node layer — exposed here for completeness.
 *
 * @param {Object} node
 * @returns {boolean}
 */
export { shouldPromptNaming }

/**
 * Get the referral warning to show when a candidate presents at a node.
 * Wraps the shared rules function with vault context.
 *
 * @param {Object} vault              - candidate's vault (or node member record)
 * @param {Object} referral           - the referral that brought them
 * @param {Object} referrerMembership - referrer's CURRENT status in this node
 * @returns {string|null}
 */
export function getInboundReferralWarning(referral, referrerMembership) {
  return getReferralWarning(referral, referrerMembership)
}

/**
 * Get a summary of this identity's current state.
 * Used by the home screen / dashboard.
 *
 * @param {Object} vault
 * @returns {Object}
 */
export function getIdentitySummary(vault) {
  const memberships   = vault.memberships ?? []
  const approved      = memberships.filter(m => m.status === STATUS.APPROVED)
  const invited       = memberships.filter(m => m.status === STATUS.INVITED)
  const credentials   = vault.credentials ?? []
  const keychain      = vault.keychain ?? []
  const files         = vault.files ?? []
  const referralsSent = vault.referrals_sent ?? []

  return {
    did:              vault.identity.id,
    handle:           vault.identity.handle,
    avatar:           vault.identity.avatar,
    virtual:          vault.identity.virtual,
    created_at:       vault.identity.created_at,

    // Membership summary
    totalNodes:       memberships.length,
    approvedNodes:    approved.length,
    invitedNodes:     invited.length,
    isIssuerAnywhere: approved.some(m => m.is_issuer),

    // Vault contents
    credentialCount:  credentials.length,
    keychainCount:    keychain.length,
    fileCount:        files.length,
    referralsSent:    referralsSent.length,

    // What they can do
    canInviteAnywhere: approved.length > 0,
  }
}
