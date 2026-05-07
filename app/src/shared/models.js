/**
 * PASSPORT — Sovereign Identity System
 * shared/models.js
 *
 * Canonical data models. Single source of truth.
 * Every module in passport/, issuer/, verifier/, and vineyard/ imports from here.
 *
 * Naming convention:
 *   - System terms (code)  : identity, node, network, registry, referral, session
 *   - Default display names: grape, cluster, vine, vineyard (user-configurable)
 *   - All models are plain JS objects (no classes) — serializable to/from JSON
 *   - All IDs are strings (DID or UUID)
 *   - All timestamps are ISO 8601 strings
 */

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Member status within a node.
 * Ordered by trust weight (index = weight value).
 */
export const STATUS = {
  UNKNOWN:    'unknown',     // default — no contact with this node
  INVITED:    'invited',     // referred by an existing member
  TEMPORARY:  'temporary',   // roaming session member — time-limited
  CANDIDATE:  'candidate',   // physically presented at node location
  APPROVED:   'approved',    // full member
  SUSPENDED:  'suspended',   // temporary hold — reversible
  REVOKED:    'revoked',     // permanent removal
}

export const STATUS_WEIGHT = {
  [STATUS.UNKNOWN]:   0,
  [STATUS.INVITED]:   1,
  [STATUS.TEMPORARY]: 1,
  [STATUS.CANDIDATE]: 2,
  [STATUS.APPROVED]:  3,
  [STATUS.SUSPENDED]: 0,
  [STATUS.REVOKED]:   -1,
}

/**
 * Node location mode.
 * Stored as a field on the node, not as a status.
 */
export const LOCATION_MODE = {
  FIXED:    'fixed',    // registered GPS/address — physical presence can be verified
  SESSION:  'session',  // roaming — temporary GPS anchor, time-limited
  OPEN:     'open',     // virtual — no location requirement
}

/**
 * Network (vine) governance level.
 */
export const NETWORK_LEVEL = {
  ONE:   1,  // single node — governed by founder(s)
  TWO:   2,  // vine — multiple nodes, collective governance
  THREE: 3,  // vineyard — federation of vines, distributed
}

/**
 * Credential types issued within the system.
 */
export const CREDENTIAL_TYPE = {
  MEMBERSHIP:  'MembershipCredential',   // member of a node
  REFERRAL:    'ReferralCredential',     // vouch from one identity to another
  ISSUER:      'IssuerCredential',       // right to issue credentials in a node
  ROLE:        'RoleCredential',         // a specific role within a node/network
  RECOVERY:    'RecoveryCredential',     // used in Level 3 recovery (future)
}

/**
 * AI agent connection mode for node/vineyard images.
 */
export const AGENT_MODE = {
  LOCAL:   'local',   // Ollama running on same machine
  REMOTE:  'remote',  // Hostinger corporate API
  HYBRID:  'hybrid',  // local-first, fallback to remote
}

/**
 * Default display naming layer.
 * Each node/network can override these strings.
 * Code never uses these — UI layer only.
 */
export const DEFAULT_DISPLAY_NAMES = {
  identity:   'Grape',
  node:       'Cluster',
  network:    'Vine',
  registry:   'Vineyard',
  referral:   'Touch',
  session:    'Gathering',
  invited:    'Seedling',
  candidate:  'Visitor',
  approved:   'Member',
  suspended:  'Paused',
  revoked:    'Removed',
  temporary:  'Guest',
}


// ─────────────────────────────────────────────────────────────────────────────
// IDENTITY (the passport holder — "grape")
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} Identity
 *
 * The sovereign identity. Lives entirely on the user's device.
 * The DID keypair is generated once and never leaves the vault unencrypted.
 *
 * @property {string}   id              - did:key:z6Mk... (generated, permanent)
 * @property {string}   handle          - chosen username (local display)
 * @property {string}   [avatar]        - base64 image or IPFS/data URI
 * @property {Object}   [profile]       - optional personal info fields (selective)
 * @property {string}   [profile.name]  - real name (optional, never required)
 * @property {string}   [profile.bio]   - short bio
 * @property {string}   [profile.email] - contact (never shared without consent)
 * @property {Location} [location]      - GPS or address (optional data field)
 * @property {boolean}  virtual         - true = no location requirement for invitations
 * @property {string}   created_at      - ISO 8601
 * @property {string}   [updated_at]    - ISO 8601
 */
export const IdentityModel = {
  id:         '',         // did:key — set on creation
  handle:     '',
  avatar:     null,
  profile: {
    name:     null,
    bio:      null,
    email:    null,
  },
  location:   null,       // see LocationModel
  virtual:    true,       // default: open to virtual invitations
  created_at: '',
  updated_at: null,
}


// ─────────────────────────────────────────────────────────────────────────────
// VAULT (encrypted container on device)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} Vault
 *
 * Everything encrypted at rest in IndexedDB.
 * Unlocked by a key derived from the user's password (PBKDF2/Argon2).
 * Never leaves the device in plaintext.
 *
 * @property {string}       version       - vault schema version
 * @property {Identity}     identity      - the passport holder
 * @property {CryptoKeys}   keys          - DID keypair (extractable for backup)
 * @property {Credential[]} credentials   - all received SD-JWT credentials
 * @property {KeychainItem[]} keychain    - passwords, API keys, secrets
 * @property {FileLink[]}   files         - access links and permissions
 * @property {Session[]}    sessions      - active/recent roaming sessions
 * @property {string}       created_at
 * @property {string}       [updated_at]
 */
export const VaultModel = {
  version:     '1.0.0',
  identity:    null,      // IdentityModel
  keys: {
    publicKey:  null,     // exported CryptoKey (JWK)
    privateKey: null,     // exported CryptoKey (JWK) — encrypted
  },
  credentials: [],        // CredentialModel[]
  keychain:    [],        // KeychainItemModel[]
  files:       [],        // FileLinkModel[]
  sessions:    [],        // SessionModel[]
  created_at:  '',
  updated_at:  null,
}


// ─────────────────────────────────────────────────────────────────────────────
// KEYCHAIN ITEM
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} KeychainItem
 *
 * A single secret stored in the vault keychain.
 * All values encrypted as part of the vault.
 *
 * @property {string} id
 * @property {string} label       - human name ("GitHub API Key", "Netflix password")
 * @property {string} type        - 'password' | 'api_key' | 'note' | 'orb_key' | 'other'
 * @property {string} value       - the secret
 * @property {string} [url]       - associated URL or service
 * @property {string} [username]  - associated username if applicable
 * @property {string} [notes]
 * @property {string} created_at
 * @property {string} [updated_at]
 */
export const KeychainItemModel = {
  id:         '',
  label:      '',
  type:       'password',   // 'password' | 'api_key' | 'note' | 'orb_key' | 'other'
  value:      '',
  url:        null,
  username:   null,
  notes:      null,
  created_at: '',
  updated_at: null,
}


// ─────────────────────────────────────────────────────────────────────────────
// FILE LINK
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} FileLink
 *
 * A reference to a file + access token held in the vault.
 * The file itself may live anywhere (VPS, peer node, IPFS).
 * The vault holds the access key, not the file.
 *
 * @property {string}   id
 * @property {string}   label           - human name
 * @property {string}   url             - where the file lives
 * @property {string}   [access_token]  - bearer token or encrypted key
 * @property {string}   [shared_with[]} - identity IDs with access
 * @property {string}   [expires_at]    - if time-limited access
 * @property {string}   [node_id]       - if scoped to a node
 * @property {string}   created_at
 */
export const FileLinkModel = {
  id:           '',
  label:        '',
  url:          '',
  access_token: null,
  shared_with:  [],
  expires_at:   null,
  node_id:      null,
  created_at:   '',
}


// ─────────────────────────────────────────────────────────────────────────────
// LOCATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} Location
 *
 * Optional location data. A data field — never a hard gate unless
 * the node's location_mode requires it.
 *
 * @property {number} [lat]
 * @property {number} [lng]
 * @property {string} [address]   - human-readable
 * @property {number} [radius_m]  - acceptance radius in meters (node use)
 * @property {string} [recorded_at] - when GPS was captured
 */
export const LocationModel = {
  lat:         null,
  lng:         null,
  address:     null,
  radius_m:    100,         // default 100m
  recorded_at: null,
}


// ─────────────────────────────────────────────────────────────────────────────
// NODE (community — "cluster")
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} Node
 *
 * A single community unit. Created when a second identity joins a founder.
 * Governed by its APPROVED members with ISSUER credentials.
 *
 * @property {string}       id
 * @property {string}       name              - display name (default: "Cluster")
 * @property {string}       [description]
 * @property {string}       founded_by        - identity.id of creator
 * @property {string}       [parent_network]  - network.id if federated (Level 2)
 * @property {LOCATION_MODE} location_mode    - 'fixed' | 'session' | 'open'
 * @property {Location}     [location]        - if location_mode is 'fixed'
 * @property {boolean}      virtual           - inherited from founder or set manually
 * @property {boolean}      allow_temporary   - whether roaming sessions are allowed
 * @property {NodeMember[]} members           - all member records
 * @property {DisplayNames} [display_names]   - custom naming overrides
 * @property {string}       created_at
 * @property {string}       [updated_at]
 */
export const NodeModel = {
  id:             '',
  name:           'Cluster',
  description:    null,
  founded_by:     '',         // identity.id
  parent_network: null,       // network.id — null until Level 2
  location_mode:  LOCATION_MODE.OPEN,
  location:       null,       // LocationModel
  virtual:        true,
  allow_temporary: false,
  members:        [],         // NodeMemberModel[]
  display_names:  null,       // DisplayNamesModel — null = use defaults
  created_at:     '',
  updated_at:     null,
}


// ─────────────────────────────────────────────────────────────────────────────
// NODE MEMBER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} NodeMember
 *
 * A single identity's membership record within a node.
 *
 * @property {string}   identity_id       - passport holder's DID
 * @property {STATUS}   status            - current membership status
 * @property {string}   [referral_id]     - referral.id that brought them in
 * @property {number}   referral_weight   - weight of referral at time of joining
 * @property {boolean}  can_invite        - computed: status >= APPROVED in this node
 * @property {boolean}  is_issuer         - holds IssuerCredential for this node
 * @property {string}   [session_id]      - if status === TEMPORARY
 * @property {string}   [expires_at]      - if status === TEMPORARY
 * @property {string}   joined_at         - when status first became non-UNKNOWN
 * @property {string}   [updated_at]
 */
export const NodeMemberModel = {
  identity_id:      '',
  status:           STATUS.UNKNOWN,
  referral_id:      null,
  referral_weight:  0,        // STATUS_WEIGHT of referrer at time of referral
  can_invite:       false,    // recomputed on status change
  is_issuer:        false,
  session_id:       null,
  expires_at:       null,
  joined_at:        '',
  updated_at:       null,
}


// ─────────────────────────────────────────────────────────────────────────────
// REFERRAL (vouch — "touch")
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} Referral
 *
 * A signed vouch from one identity to another, scoped to a node.
 * The referrer's status at time of referral is recorded — this is the weight.
 * A referral from an INVITED member carries less weight than from APPROVED.
 *
 * @property {string}   id
 * @property {string}   from_identity_id      - referrer's DID
 * @property {string}   to_identity_id        - referred person's DID
 * @property {string}   node_id               - which node this referral is for
 * @property {STATUS}   from_status_at_time   - referrer's status when referral was made
 * @property {number}   weight                - STATUS_WEIGHT[from_status_at_time]
 * @property {Object}   [disclosed]           - what referrer chose to share
 * @property {boolean}  [disclosed.handle]
 * @property {boolean}  [disclosed.memberships]
 * @property {boolean}  [disclosed.role]
 * @property {boolean}  [disclosed.since]
 * @property {string}   [note]                - optional message from referrer
 * @property {string}   signature             - referrer's DID signature over referral
 * @property {string}   created_at
 * @property {string}   [expires_at]          - optional expiry
 */
export const ReferralModel = {
  id:                   '',
  from_identity_id:     '',
  to_identity_id:       '',
  node_id:              '',
  from_status_at_time:  STATUS.UNKNOWN,
  weight:               0,
  disclosed: {
    handle:       false,
    memberships:  false,
    role:         false,
    since:        false,
  },
  note:       null,
  signature:  '',
  created_at: '',
  expires_at: null,
}


// ─────────────────────────────────────────────────────────────────────────────
// SESSION (roaming / temporary — "gathering")
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} Session
 *
 * A time-limited roaming context. Created by an APPROVED member.
 * Members invited into a session get STATUS_TEMPORARY.
 * Session expiry reverts all TEMPORARY members to STATUS_UNKNOWN
 * unless manually promoted before expiry.
 *
 * @property {string}     id
 * @property {string}     created_by      - identity.id of session creator
 * @property {string}     node_id         - which node context this belongs to
 * @property {Location}   [location]      - GPS at session creation
 * @property {number}     duration_min    - session length in minutes (default: 30)
 * @property {string}     created_at
 * @property {string}     expires_at      - created_at + duration_min
 * @property {string[]}   members         - identity.id[] invited into session
 * @property {string}     [purpose]       - optional description
 * @property {boolean}    active          - false when expired or manually closed
 */
export const SessionModel = {
  id:           '',
  created_by:   '',
  node_id:      '',
  location:     null,       // LocationModel
  duration_min: 30,
  created_at:   '',
  expires_at:   '',
  members:      [],
  purpose:      null,
  active:       true,
}


// ─────────────────────────────────────────────────────────────────────────────
// NETWORK (federation of nodes — "vine") — Level 2
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} Network
 *
 * A Level 2 federation of nodes. Created automatically when:
 *   - A single founder identity has 2+ nodes, OR
 *   - Two nodes mutually recognize each other
 * Governed collectively — no single identity owns it.
 *
 * @property {string}     id
 * @property {string}     name            - display name (default: "Vine")
 * @property {string}     [description]
 * @property {string[]}   nodes           - node.id[] in this network
 * @property {string[]}   founded_by      - identity.id[] (collective)
 * @property {string}     [parent_registry] - registry.id if in a vineyard (Level 3)
 * @property {DisplayNames} [display_names]
 * @property {string}     created_at
 * @property {string}     [updated_at]
 */
export const NetworkModel = {
  id:               '',
  name:             'Vine',
  description:      null,
  nodes:            [],       // node.id[]
  founded_by:       [],       // identity.id[] — collective governance
  parent_registry:  null,     // registry.id — null until Level 3
  display_names:    null,
  created_at:       '',
  updated_at:       null,
}


// ─────────────────────────────────────────────────────────────────────────────
// REGISTRY (federation of networks — "vineyard") — Level 3
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} Registry
 *
 * A Level 3 peer node in the distributed federation.
 * Installed as desktop software ($100 CAD one-time).
 * Participates in the distributed backup mesh.
 * Runs an embedded AI agent (public Orbit variant).
 *
 * @property {string}     id              - did:web of the vineyard host
 * @property {string}     name            - display name (default: "Vineyard")
 * @property {string[]}   networks        - network.id[] it federates
 * @property {string[]}   peers           - other registry.id[] it knows
 * @property {AGENT_MODE} agent_mode      - 'local' | 'remote' | 'hybrid'
 * @property {string}     [agent_endpoint] - remote API endpoint if not local
 * @property {BackupShard[]} shards       - encrypted backup fragments held
 * @property {string}     licensed_at     - when the $100 license was activated
 * @property {string}     [license_key]
 * @property {string}     created_at
 * @property {string}     [updated_at]
 */
export const RegistryModel = {
  id:               '',       // did:web
  name:             'Vineyard',
  networks:         [],       // network.id[]
  peers:            [],       // registry.id[]
  agent_mode:       AGENT_MODE.HYBRID,
  agent_endpoint:   null,     // Hostinger corporate API URL
  shards:           [],       // BackupShardModel[]
  licensed_at:      '',
  license_key:      null,
  created_at:       '',
  updated_at:       null,
}


// ─────────────────────────────────────────────────────────────────────────────
// BACKUP SHARD — Level 3
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} BackupShard
 *
 * An encrypted fragment of an identity's recovery data.
 * Uses Shamir's Secret Sharing — no single shard is sufficient.
 * A vineyard never holds enough to reconstruct alone.
 *
 * @property {string} id
 * @property {string} identity_id   - which identity this shard belongs to (hashed)
 * @property {string} shard_data    - encrypted fragment (base64)
 * @property {number} threshold     - how many shards needed to reconstruct
 * @property {number} index         - this shard's index in the set
 * @property {string} created_at
 * @property {string} [expires_at]
 */
export const BackupShardModel = {
  id:           '',
  identity_id:  '',       // hashed — vineyard cannot link to real identity
  shard_data:   '',
  threshold:    3,        // default: 3 of 5 required
  index:        0,
  created_at:   '',
  expires_at:   null,
}


// ─────────────────────────────────────────────────────────────────────────────
// CREDENTIAL (SD-JWT verifiable credential)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} Credential
 *
 * A signed verifiable credential received from an issuer.
 * Stored in the vault. Presented via OID4VP.
 *
 * @property {string}           id
 * @property {CREDENTIAL_TYPE}  type
 * @property {string}           issuer_did      - did:web of issuing node/network
 * @property {string}           subject_did     - holder's did:key
 * @property {Object}           claims          - the attested facts
 * @property {string}           [claims.memberOf]
 * @property {string}           [claims.role]
 * @property {string}           [claims.node_id]
 * @property {string}           [claims.network_id]
 * @property {string}           sd_jwt          - the raw signed SD-JWT string
 * @property {string}           issued_at
 * @property {string}           [expires_at]
 * @property {boolean}          [revoked]
 */
export const CredentialModel = {
  id:           '',
  type:         CREDENTIAL_TYPE.MEMBERSHIP,
  issuer_did:   '',
  subject_did:  '',
  claims:       {},
  sd_jwt:       '',
  issued_at:    '',
  expires_at:   null,
  revoked:      false,
}


// ─────────────────────────────────────────────────────────────────────────────
// DISPLAY NAMES (per-node/network customization)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} DisplayNames
 *
 * Community-specific naming. UI layer only.
 * Falls back to DEFAULT_DISPLAY_NAMES for any unset field.
 * Code never uses these strings — only the UI renderer does.
 */
export const DisplayNamesModel = {
  identity:   null,   // e.g. "Villager", "Member", "Grape"
  node:       null,   // e.g. "Grove", "Circle", "Cluster"
  network:    null,   // e.g. "Nation", "House", "Vine"
  registry:   null,   // e.g. "Vineyard", "Federation"
  referral:   null,   // e.g. "Blessing", "Handshake", "Touch"
  session:    null,   // e.g. "Gathering", "Circle"
  invited:    null,   // e.g. "Seedling", "Guest"
  candidate:  null,   // e.g. "Visitor", "Seeker"
  approved:   null,   // e.g. "Rooted", "Citizen", "Member"
  suspended:  null,
  revoked:    null,
  temporary:  null,
}


// ─────────────────────────────────────────────────────────────────────────────
// RULES ENGINE (invitation permission logic)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Can `inviter` invite someone to `node`?
 *
 * Rules:
 * - Inviter must have STATUS_APPROVED in at least one node (any node)
 * - OR inviter is the node founder
 * - OR node.virtual === true AND inviter has any active membership anywhere
 *
 * Warning (not block) if:
 * - Inviter is only STATUS_INVITED in the target node
 *   → referral weight will be recorded as low
 *
 * @param {NodeMember}  inviterMembership   - inviter's record in THIS node
 * @param {boolean}     inviterApprovedElsewhere - approved in any other node
 * @param {Node}        node
 * @returns {{ allowed: boolean, warning: string|null }}
 */
export function canInvite(inviterMembership, inviterApprovedElsewhere, node) {
  // Revoked members can never invite
  if (inviterMembership?.status === STATUS.REVOKED) {
    return { allowed: false, warning: null }
  }

  // Suspended members can never invite
  if (inviterMembership?.status === STATUS.SUSPENDED) {
    return { allowed: false, warning: null }
  }

  // Approved in this node — full permission
  if (inviterMembership?.status === STATUS.APPROVED) {
    return { allowed: true, warning: null }
  }

  // Approved elsewhere + node is virtual — allowed with weight warning
  if (inviterApprovedElsewhere && node.virtual) {
    const warning = inviterMembership?.status === STATUS.INVITED
      ? `Your referral will be recorded, but your status in this node is INVITED. ` +
        `This referral carries reduced weight.`
      : null
    return { allowed: true, warning }
  }

  // Approved elsewhere + node has fixed/session location
  // → inviter must be physically present OR approved in this node
  if (inviterApprovedElsewhere && !node.virtual) {
    if (inviterMembership?.status === STATUS.INVITED) {
      return {
        allowed: true,
        warning: `You are only INVITED in this node. Your referral will be recorded ` +
                 `with reduced weight. The candidate will be notified when they arrive.`
      }
    }
    return { allowed: false, warning: null }
  }

  // No approval anywhere — cannot invite
  return { allowed: false, warning: null }
}

/**
 * Compute the warning shown when a candidate presents at a node.
 *
 * @param {Referral}    referral        - the referral that brought them
 * @param {NodeMember}  referrerMember  - referrer's CURRENT status in this node
 * @returns {string|null}
 */
export function getReferralWarning(referral, referrerMember) {
  if (!referral) return null

  const currentWeight = STATUS_WEIGHT[referrerMember?.status ?? STATUS.UNKNOWN]
  const originalWeight = referral.weight

  if (referrerMember?.status === STATUS.REVOKED) {
    return `⚠️ Referrer has been REVOKED from this node. Proceed with caution.`
  }
  if (referrerMember?.status === STATUS.SUSPENDED) {
    return `⚠️ Referrer is currently SUSPENDED in this node.`
  }
  if (originalWeight <= STATUS_WEIGHT[STATUS.INVITED]) {
    return `ℹ️ Referrer was INVITED (not yet approved) at the time of this referral. ` +
           `Reduced weight. Current referrer status: ${referrerMember?.status ?? 'unknown'}.`
  }
  if (currentWeight < originalWeight) {
    return `ℹ️ Referrer's status has decreased since the referral was made.`
  }

  return null
}

/**
 * Should a Level 2 network prompt be triggered?
 *
 * Fires when a founder identity is about to create their second node,
 * OR when two existing nodes mutually recognize each other.
 *
 * @param {string}    founderIdentityId
 * @param {Node[]}    allNodes          - all nodes in the system
 * @returns {boolean}
 */
export function shouldPromptNetworkFormation(founderIdentityId, allNodes) {
  const founderNodes = allNodes.filter(
    n => n.founded_by === founderIdentityId && !n.parent_network
  )
  return founderNodes.length >= 2
}
