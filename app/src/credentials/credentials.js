/**
 * PASSPORT — Sovereign Identity System
 * app/src/credentials/credentials.js
 *
 * The credential layer. Implements a simplified SD-JWT (Selective Disclosure JWT)
 * scheme using WebCrypto only — no external libraries.
 *
 * SD-JWT in brief:
 *   A credential is a signed JSON payload. Some fields are "selectively disclosable"
 *   — they are hashed in the main payload and only revealed when the holder chooses.
 *   The verifier sees only the fields the holder explicitly shares.
 *
 * Our implementation:
 *   - Pure WebCrypto Ed25519 signatures (same as vault.js)
 *   - SHA-256 hashes for selective disclosure commitments
 *   - Base64url encoding throughout
 *   - No external JWT library — we implement the minimal subset we need
 *   - Interoperable with the SD-JWT spec at the structural level
 *
 * Three actors:
 *   ISSUER  — signs the credential (node server or peer issuer)
 *   HOLDER  — stores it, selectively discloses fields, signs presentations
 *   VERIFIER — checks the signature chain without contacting the issuer
 *
 * Responsibilities:
 *   1. buildCredential()     — construct SD-JWT payload with disclosure hashes
 *   2. issueCredential()     — issuer signs the credential
 *   3. parseCredential()     — holder parses and stores incoming credential
 *   4. verifyCredential()    — verify issuer signature (holder or verifier)
 *   5. buildPresentation()   — holder selects fields + signs VP
 *   6. verifyPresentation()  — verifier checks full chain
 *   7. revokeCredential()    — issuer marks credential revoked (status list)
 *   8. isCredentialValid()   — check expiry + revocation
 */

import { CREDENTIAL_TYPE } from '../../shared/models.js'


// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

function toBase64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64url(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/')
    .padEnd(str.length + (4 - str.length % 4) % 4, '=')
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0))
}

function encodeJSON(obj) {
  return toBase64url(new TextEncoder().encode(JSON.stringify(obj)))
}

function decodeJSON(b64url) {
  return JSON.parse(new TextDecoder().decode(fromBase64url(b64url)))
}

function now()  { return new Date().toISOString() }
function uuid() { return crypto.randomUUID() }

/**
 * SHA-256 hash of a string → base64url
 * Used to commit to a disclosure value without revealing it.
 */
async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
  return toBase64url(buf)
}

/**
 * Sign arbitrary bytes with an Ed25519 key → base64url signature
 */
async function edSign(privateKey, data) {
  const buf = await crypto.subtle.sign('Ed25519', privateKey, new TextEncoder().encode(data))
  return toBase64url(buf)
}

/**
 * Verify an Ed25519 signature
 */
async function edVerify(publicKey, data, signature) {
  return crypto.subtle.verify(
    'Ed25519', publicKey,
    fromBase64url(signature),
    new TextEncoder().encode(data)
  )
}

/**
 * Import a JWK public key for verification
 */
async function importPublicKey(jwk) {
  return crypto.subtle.importKey('jwk', jwk, { name: 'Ed25519' }, true, ['verify'])
}

/**
 * Import a JWK private key for signing
 */
async function importPrivateKey(jwk) {
  return crypto.subtle.importKey('jwk', jwk, { name: 'Ed25519' }, true, ['sign'])
}


// ─────────────────────────────────────────────────────────────────────────────
// DISCLOSURE — the selective disclosure mechanism
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A Disclosure is a salted claim that can be selectively revealed.
 *
 * Structure: [ salt, key, value ]
 * Hash:      SHA-256(base64url(JSON([ salt, key, value ])))
 *
 * The issuer puts the HASH in the credential.
 * The holder keeps the DISCLOSURE (salt + key + value).
 * When presenting, the holder includes chosen disclosures.
 * The verifier recomputes the hash and confirms it matches.
 *
 * @param {string} key    - claim name
 * @param {*}      value  - claim value
 * @returns {Promise<{ disclosure: string, hash: string, key: string, value: * }>}
 */
async function createDisclosure(key, value) {
  const salt        = toBase64url(crypto.getRandomValues(new Uint8Array(16)))
  const array       = [salt, key, value]
  const disclosure  = toBase64url(new TextEncoder().encode(JSON.stringify(array)))
  const hash        = await sha256(disclosure)
  return { disclosure, hash, key, value, salt }
}

/**
 * Verify a disclosure against its hash.
 * @param {string} disclosure  - base64url encoded [salt, key, value]
 * @param {string} hash        - expected SHA-256 hash
 * @returns {Promise<{ valid: boolean, key: string, value: * }>}
 */
async function verifyDisclosure(disclosure, hash) {
  const computed = await sha256(disclosure)
  if (computed !== hash) return { valid: false, key: null, value: null }

  const [salt, key, value] = JSON.parse(new TextDecoder().decode(fromBase64url(disclosure)))
  return { valid: true, key, value }
}


// ─────────────────────────────────────────────────────────────────────────────
// 1. BUILD CREDENTIAL — construct the SD-JWT payload
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build an SD-JWT credential payload ready for signing.
 *
 * Claims are split into:
 *   - Always visible (bound claims): issuer, subject, type, dates, node/network IDs
 *   - Selectively disclosable: everything in `selectiveClaims`
 *
 * The issuer retains the full disclosures.
 * The holder receives the full disclosures to store in their vault.
 * The signed credential only contains hashes of the selective claims.
 *
 * @param {Object} params
 * @param {string}            params.issuerDid       - did:web of issuing node
 * @param {string}            params.subjectDid      - holder's did:key
 * @param {CREDENTIAL_TYPE}   params.type
 * @param {Object}            params.boundClaims     - always visible (node_id, memberOf, role...)
 * @param {Object}            params.selectiveClaims - selectively disclosed (name, email, dob...)
 * @param {string}            [params.expiresAt]     - ISO 8601
 * @returns {Promise<CredentialPayload>}
 */
export async function buildCredential({
  issuerDid,
  subjectDid,
  type,
  boundClaims,
  selectiveClaims,
  expiresAt,
}) {
  // Create disclosures for all selective claims
  const disclosures = []
  const sdHashes    = []

  for (const [key, value] of Object.entries(selectiveClaims ?? {})) {
    const d = await createDisclosure(key, value)
    disclosures.push(d)
    sdHashes.push(d.hash)
  }

  const issuedAt = now()

  // The credential header
  const header = {
    alg: 'EdDSA',
    typ: 'sd-jwt',
  }

  // The credential payload (what gets signed)
  const payload = {
    jti:         uuid(),              // credential ID
    iss:         issuerDid,           // issuer DID
    sub:         subjectDid,          // subject (holder) DID
    iat:         issuedAt,            // issued at
    exp:         expiresAt ?? null,   // expiry
    type,                             // credential type
    _sd:         sdHashes,            // hashes of selective claims
    _sd_alg:     'sha-256',           // hash algorithm
    ...boundClaims,                   // always-visible claims
  }

  return {
    header,
    payload,
    disclosures,   // full [salt, key, value] — kept by issuer and holder
    sdHashes,      // just the hashes — embedded in payload
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// 2. ISSUE CREDENTIAL — issuer signs and packages
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Issue a credential — sign the payload and produce the full SD-JWT token.
 *
 * SD-JWT format:
 *   <header_b64>.<payload_b64>.<signature_b64>~<disclosure1>~<disclosure2>~...
 *
 * The ~ separated disclosures are the full [salt, key, value] arrays.
 * In a presentation, the holder only includes chosen disclosures.
 *
 * @param {Object}    credentialPayload  - from buildCredential()
 * @param {CryptoKey} issuerPrivateKey   - Ed25519 private key of the issuing node
 * @returns {Promise<IssuedCredential>}
 */
export async function issueCredential(credentialPayload, issuerPrivateKey) {
  const { header, payload, disclosures } = credentialPayload

  const headerB64  = encodeJSON(header)
  const payloadB64 = encodeJSON(payload)
  const sigInput   = `${headerB64}.${payloadB64}`
  const signature  = await edSign(issuerPrivateKey, sigInput)

  // Full SD-JWT: header.payload.signature~disclosure1~disclosure2~...
  const disclosureStrings = disclosures.map(d => d.disclosure)
  const sdJwt = [
    `${headerB64}.${payloadB64}.${signature}`,
    ...disclosureStrings,
  ].join('~')

  return {
    id:           payload.jti,
    type:         payload.type,
    issuer_did:   payload.iss,
    subject_did:  payload.sub,
    issued_at:    payload.iat,
    expires_at:   payload.exp,
    bound_claims: extractBoundClaims(payload),
    sd_jwt:       sdJwt,
    disclosures,  // stored in holder's vault — never sent to verifier directly
    revoked:      false,
  }
}

/**
 * Extract the always-visible claims from a payload (everything except JWT fields).
 */
function extractBoundClaims(payload) {
  const reserved = new Set(['jti','iss','sub','iat','exp','type','_sd','_sd_alg'])
  return Object.fromEntries(
    Object.entries(payload).filter(([k]) => !reserved.has(k))
  )
}


// ─────────────────────────────────────────────────────────────────────────────
// 3. PARSE CREDENTIAL — holder receives and stores
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse an incoming SD-JWT string into a structured credential object.
 * Does NOT verify the signature — call verifyCredential() after.
 *
 * @param {string} sdJwt   - full SD-JWT string from issuer
 * @returns {ParsedCredential}
 */
export function parseCredential(sdJwt) {
  const parts          = sdJwt.split('~')
  const jwtPart        = parts[0]
  const disclosureParts = parts.slice(1).filter(Boolean)

  const [headerB64, payloadB64, signature] = jwtPart.split('.')

  const header  = decodeJSON(headerB64)
  const payload = decodeJSON(payloadB64)

  // Parse each disclosure: base64url([salt, key, value])
  const disclosures = disclosureParts.map(d => {
    try {
      const [salt, key, value] = JSON.parse(new TextDecoder().decode(fromBase64url(d)))
      return { disclosure: d, salt, key, value }
    } catch {
      return { disclosure: d, salt: null, key: null, value: null, malformed: true }
    }
  })

  return {
    raw:          sdJwt,
    headerB64,
    payloadB64,
    signature,
    header,
    payload,
    disclosures,
    id:           payload.jti,
    type:         payload.type,
    issuer_did:   payload.iss,
    subject_did:  payload.sub,
    issued_at:    payload.iat,
    expires_at:   payload.exp,
    sd_hashes:    payload._sd ?? [],
    bound_claims: extractBoundClaims(payload),
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// 4. VERIFY CREDENTIAL — check issuer signature
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verify a credential's issuer signature.
 *
 * Resolves the issuer's public key from:
 *   1. A provided JWK (from a cached did:web document)
 *   2. A provided CryptoKey directly
 *
 * Does NOT check revocation here — call isCredentialValid() for full check.
 *
 * @param {ParsedCredential} parsed        - from parseCredential()
 * @param {JsonWebKey|CryptoKey} issuerKey - issuer's public key
 * @returns {Promise<{ valid: boolean, reason: string|null }>}
 */
export async function verifyCredential(parsed, issuerKey) {
  try {
    // Import if JWK, use directly if CryptoKey
    const publicKey = issuerKey instanceof CryptoKey
      ? issuerKey
      : await importPublicKey(issuerKey)

    const sigInput = `${parsed.headerB64}.${parsed.payloadB64}`
    const valid    = await edVerify(publicKey, sigInput, parsed.signature)

    if (!valid) return { valid: false, reason: 'SIGNATURE_INVALID' }

    // Verify all disclosures hash correctly
    for (const d of parsed.disclosures) {
      if (d.malformed) return { valid: false, reason: 'MALFORMED_DISCLOSURE' }
      const computed = await sha256(d.disclosure)
      if (!parsed.sd_hashes.includes(computed)) {
        return { valid: false, reason: 'DISCLOSURE_HASH_MISMATCH' }
      }
    }

    return { valid: true, reason: null }
  } catch (err) {
    return { valid: false, reason: `VERIFICATION_ERROR: ${err.message}` }
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// 5. BUILD PRESENTATION — holder selects fields and signs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a Verifiable Presentation (VP).
 *
 * The holder:
 *   1. Selects which selective claims to reveal (by key name)
 *   2. Includes only those disclosures in the presentation
 *   3. Signs the presentation with their own private key
 *   4. The verifier can check both the issuer sig AND the holder sig
 *
 * Format:
 *   <issuer_header>.<issuer_payload>.<issuer_sig>~<chosen_disclosure1>~...
 *   + a separate holder_proof object signed over the presentation
 *
 * @param {Object} params
 * @param {IssuedCredential}  params.credential         - the stored credential
 * @param {string[]}          params.revealKeys         - which selective claims to reveal
 * @param {string}            params.holderDid          - holder's DID
 * @param {CryptoKey}         params.holderPrivateKey   - holder's signing key
 * @param {string}            [params.verifierDid]      - intended audience
 * @param {string}            [params.nonce]            - anti-replay nonce from verifier
 * @returns {Promise<VerifiablePresentation>}
 */
export async function buildPresentation({
  credential,
  revealKeys,
  holderDid,
  holderPrivateKey,
  verifierDid,
  nonce,
}) {
  // Find the disclosures the holder wants to reveal
  const chosenDisclosures = (credential.disclosures ?? []).filter(
    d => revealKeys.includes(d.key)
  )

  // Build the selective SD-JWT (without unchosen disclosures)
  const [jwtPart] = credential.sd_jwt.split('~')
  const presentedSdJwt = [
    jwtPart,
    ...chosenDisclosures.map(d => d.disclosure),
  ].join('~')

  // Build the holder proof
  const proofPayload = {
    iss:   holderDid,
    aud:   verifierDid ?? null,
    nonce: nonce ?? null,
    iat:   now(),
    vp:    presentedSdJwt,   // binds the proof to this specific presentation
  }

  const proofB64  = encodeJSON(proofPayload)
  const proofSig  = await edSign(holderPrivateKey, proofB64)

  return {
    id:               uuid(),
    type:             'VerifiablePresentation',
    holder_did:       holderDid,
    credential_id:    credential.id,
    credential_type:  credential.type,
    presented_at:     now(),
    verifier_did:     verifierDid ?? null,
    nonce:            nonce ?? null,

    // The selective SD-JWT (only chosen disclosures included)
    sd_jwt:           presentedSdJwt,

    // The holder's proof (binds holder identity to this presentation)
    holder_proof: {
      payload:   proofPayload,
      payload_b64: proofB64,
      signature: proofSig,
    },

    // Metadata for the verifier UI
    revealed_claims:  chosenDisclosures.map(d => ({ key: d.key, value: d.value })),
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// 6. VERIFY PRESENTATION — verifier checks full chain
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verify a Verifiable Presentation.
 *
 * Checks:
 *   1. Issuer signature on the credential (SD-JWT)
 *   2. All included disclosures hash correctly
 *   3. Holder proof signature (binds holder to this presentation)
 *   4. Nonce matches (anti-replay)
 *   5. Credential not expired
 *   6. Subject DID matches holder DID
 *
 * @param {Object} params
 * @param {VerifiablePresentation}  params.presentation
 * @param {JsonWebKey|CryptoKey}    params.issuerPublicKey   - from did:web resolution
 * @param {JsonWebKey|CryptoKey}    params.holderPublicKey   - from credential subject DID
 * @param {string}                  [params.expectedNonce]
 * @param {string}                  [params.expectedVerifierDid]
 * @returns {Promise<VerificationResult>}
 */
export async function verifyPresentation({
  presentation,
  issuerPublicKey,
  holderPublicKey,
  expectedNonce,
  expectedVerifierDid,
}) {
  const result = {
    valid:           false,
    issuerValid:     false,
    holderValid:     false,
    disclosuresValid: false,
    nonceValid:      false,
    expiryValid:     false,
    subjectMatch:    false,
    reason:          null,
    revealedClaims:  {},
  }

  try {
    // Parse the credential from the presentation
    const parsed = parseCredential(presentation.sd_jwt)

    // 1. Verify issuer signature
    const issuerCheck = await verifyCredential(parsed, issuerPublicKey)
    result.issuerValid = issuerCheck.valid
    if (!issuerCheck.valid) {
      result.reason = `ISSUER_${issuerCheck.reason}`
      return result
    }

    // 2. Verify all included disclosures
    result.disclosuresValid = true
    const revealedClaims    = {}
    for (const d of parsed.disclosures) {
      const check = await verifyDisclosure(d.disclosure, await sha256(d.disclosure))
      if (!check.valid) {
        result.disclosuresValid = false
        result.reason = 'DISCLOSURE_INVALID'
        return result
      }
      revealedClaims[d.key] = d.value
    }
    result.revealedClaims = revealedClaims

    // 3. Verify holder proof
    const holderKey   = holderPublicKey instanceof CryptoKey
      ? holderPublicKey
      : await importPublicKey(holderPublicKey)
    const proofValid  = await edVerify(
      holderKey,
      presentation.holder_proof.payload_b64,
      presentation.holder_proof.signature
    )
    result.holderValid = proofValid
    if (!proofValid) {
      result.reason = 'HOLDER_PROOF_INVALID'
      return result
    }

    // 4. Nonce check (anti-replay)
    if (expectedNonce) {
      result.nonceValid = presentation.holder_proof.payload.nonce === expectedNonce
      if (!result.nonceValid) {
        result.reason = 'NONCE_MISMATCH'
        return result
      }
    } else {
      result.nonceValid = true
    }

    // 5. Expiry check
    if (parsed.payload.exp) {
      result.expiryValid = new Date(parsed.payload.exp) > new Date()
      if (!result.expiryValid) {
        result.reason = 'CREDENTIAL_EXPIRED'
        return result
      }
    } else {
      result.expiryValid = true
    }

    // 6. Subject DID must match holder DID
    result.subjectMatch = parsed.subject_did === presentation.holder_did
    if (!result.subjectMatch) {
      result.reason = 'SUBJECT_MISMATCH'
      return result
    }

    // All checks passed
    result.valid  = true
    result.reason = null
    return result

  } catch (err) {
    result.reason = `VERIFICATION_ERROR: ${err.message}`
    return result
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// 7. CREDENTIAL VALIDITY — expiry + revocation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if a stored credential is still valid (not expired, not revoked).
 *
 * @param {IssuedCredential} credential
 * @returns {{ valid: boolean, reason: string|null }}
 */
export function isCredentialValid(credential) {
  if (credential.revoked) {
    return { valid: false, reason: 'REVOKED' }
  }

  if (credential.expires_at && new Date(credential.expires_at) <= new Date()) {
    return { valid: false, reason: 'EXPIRED' }
  }

  return { valid: true, reason: null }
}

/**
 * Mark a credential as revoked in the holder's vault.
 * (Server-side: the issuer updates their revocation status list.)
 *
 * @param {IssuedCredential} credential
 * @returns {IssuedCredential}
 */
export function revokeCredential(credential) {
  return { ...credential, revoked: true, revoked_at: now() }
}


// ─────────────────────────────────────────────────────────────────────────────
// 8. CREDENTIAL STORE HELPERS — vault integration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get all credentials of a specific type from the vault.
 *
 * @param {Object} vault
 * @param {string} [type]  - CREDENTIAL_TYPE value, or omit for all
 * @returns {IssuedCredential[]}
 */
export function getCredentials(vault, type) {
  const creds = vault.credentials ?? []
  if (!type) return [...creds]
  return creds.filter(c => c.type === type)
}

/**
 * Get a single credential by ID.
 *
 * @param {Object} vault
 * @param {string} credentialId
 * @returns {IssuedCredential|null}
 */
export function getCredentialById(vault, credentialId) {
  return (vault.credentials ?? []).find(c => c.id === credentialId) ?? null
}

/**
 * Get all valid (non-expired, non-revoked) credentials.
 *
 * @param {Object} vault
 * @returns {IssuedCredential[]}
 */
export function getValidCredentials(vault) {
  return (vault.credentials ?? []).filter(c => isCredentialValid(c).valid)
}

/**
 * Build a disclosure selection for a verifier request.
 * Given what a verifier is asking for, determine which disclosures
 * from which credential can satisfy the request.
 *
 * @param {Object} vault
 * @param {Object} request  - verifier request: { type, requiredClaims, optionalClaims }
 * @returns {{ credential: IssuedCredential|null, canSatisfy: boolean, available: string[] }}
 */
export function resolveDisclosureRequest(vault, request) {
  const matching = getValidCredentials(vault).filter(c => c.type === request.type)

  if (matching.length === 0) {
    return { credential: null, canSatisfy: false, available: [] }
  }

  // Use the most recently issued matching credential
  const credential = matching.sort(
    (a, b) => new Date(b.issued_at) - new Date(a.issued_at)
  )[0]

  // What claims are available in this credential
  const available = [
    ...Object.keys(credential.bound_claims ?? {}),
    ...(credential.disclosures ?? []).map(d => d.key),
  ]

  // Can we satisfy all required claims?
  const canSatisfy = (request.requiredClaims ?? []).every(k => available.includes(k))

  return { credential, canSatisfy, available }
}
