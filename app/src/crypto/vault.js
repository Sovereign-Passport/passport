/**
 * PASSPORT — Sovereign Identity System
 * app/src/crypto/vault.js
 *
 * The cryptographic foundation of the entire system.
 * Everything runs in the browser via the WebCrypto API (window.crypto.subtle).
 * Zero external dependencies. Zero network calls. Zero telemetry.
 *
 * Responsibilities:
 *   1. Generate an Ed25519 identity keypair (the DID)
 *   2. Derive a vault encryption key from the user's password (PBKDF2)
 *   3. Encrypt and decrypt the vault (AES-256-GCM)
 *   4. Derive a did:key identifier from the public key
 *   5. Export / import keys for backup (encrypted)
 *   6. Produce and verify Ed25519 signatures (for referrals, credentials)
 *
 * Security notes:
 *   - Private keys are NEVER stored in plaintext anywhere
 *   - The password itself is NEVER stored — only a derived key
 *   - Salt and IV are always random, always stored alongside ciphertext
 *   - PBKDF2 iterations set to 600,000 (OWASP 2023 recommendation for SHA-256)
 *   - AES-GCM provides both confidentiality and integrity (authenticated encryption)
 *   - Ed25519 is used for signatures (fast, small, secure)
 *
 * Browser support: Chrome 100+, Firefox 100+, Safari 15.4+
 * All modern phones support this. No polyfills needed.
 */

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const PBKDF2_ITERATIONS  = 600_000
const PBKDF2_HASH        = 'SHA-256'
const AES_KEY_LENGTH     = 256
const SALT_LENGTH        = 32    // bytes
const IV_LENGTH          = 12    // bytes — standard for AES-GCM
const VAULT_VERSION      = '1.0.0'

// did:key multicodec prefix for Ed25519 public keys
// 0xed01 in varint encoding
const ED25519_MULTICODEC = new Uint8Array([0xed, 0x01])


// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Encode Uint8Array to base64url string (no padding).
 * Used throughout — DID keys, encrypted blobs, salts, IVs.
 */
function toBase64url(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/**
 * Decode base64url string to Uint8Array.
 */
function fromBase64url(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/').padEnd(
    str.length + (4 - (str.length % 4)) % 4, '='
  )
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0))
}

/**
 * Encode Uint8Array to hex string (for readable IDs, debugging).
 */
function toHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Generate cryptographically random bytes.
 */
function randomBytes(length) {
  return crypto.getRandomValues(new Uint8Array(length))
}

/**
 * Encode a string to UTF-8 bytes.
 */
function encode(str) {
  return new TextEncoder().encode(str)
}

/**
 * Decode UTF-8 bytes to string.
 */
function decode(bytes) {
  return new TextDecoder().decode(bytes)
}

/**
 * Base58btc encode (used in did:key identifiers).
 * Bitcoin alphabet: 123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz
 */
function toBase58(bytes) {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
  let num = BigInt('0x' + toHex(bytes))
  let result = ''
  const base = BigInt(58)

  while (num > 0n) {
    result = ALPHABET[Number(num % base)] + result
    num = num / base
  }

  // Leading zeros
  for (const byte of bytes) {
    if (byte !== 0) break
    result = '1' + result
  }

  return result
}


// ─────────────────────────────────────────────────────────────────────────────
// 1. IDENTITY KEYPAIR GENERATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a new Ed25519 identity keypair.
 *
 * Ed25519 is chosen because:
 *   - Fast signing and verification
 *   - Small key and signature sizes (32-byte keys, 64-byte signatures)
 *   - No parameter choices that can be misconfigured (unlike ECDSA)
 *   - W3C DID and SD-JWT ecosystem standard
 *
 * @returns {Promise<CryptoKeyPair>}
 */
export async function generateKeypair() {
  return crypto.subtle.generateKey(
    { name: 'Ed25519' },
    true,                        // extractable — needed for backup export
    ['sign', 'verify']
  )
}

/**
 * Export a CryptoKey to JWK format (JSON Web Key).
 * Used when storing keys in the vault or in a backup.
 *
 * @param {CryptoKey} key
 * @returns {Promise<JsonWebKey>}
 */
export async function exportKey(key) {
  return crypto.subtle.exportKey('jwk', key)
}

/**
 * Import a JWK back into a CryptoKey.
 *
 * @param {JsonWebKey} jwk
 * @param {'sign'|'verify'} usage
 * @returns {Promise<CryptoKey>}
 */
export async function importKey(jwk, usage) {
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'Ed25519' },
    true,
    [usage]
  )
}

/**
 * Derive a did:key identifier from an Ed25519 public key.
 *
 * Format: did:key:z<base58btc(multicodec_prefix + raw_public_key_bytes)>
 * The 'z' prefix indicates base58btc encoding (multibase).
 *
 * This DID is self-contained — it encodes the public key directly.
 * No ledger, no server, no resolution needed.
 *
 * @param {CryptoKey} publicKey
 * @returns {Promise<string>}  e.g. "did:key:z6Mkf5rGMoatrSj1f4CyvuHBeXJELe9y84..."
 */
export async function deriveDID(publicKey) {
  const rawBytes = await crypto.subtle.exportKey('raw', publicKey)
  const keyBytes = new Uint8Array(rawBytes)

  // Prepend the Ed25519 multicodec prefix
  const multicodecKey = new Uint8Array(ED25519_MULTICODEC.length + keyBytes.length)
  multicodecKey.set(ED25519_MULTICODEC)
  multicodecKey.set(keyBytes, ED25519_MULTICODEC.length)

  return 'did:key:z' + toBase58(multicodecKey)
}

/**
 * Generate a complete new identity — keypair + DID.
 * This is called ONCE per user, ever.
 * The result must be immediately encrypted into the vault.
 *
 * @returns {Promise<{
 *   did:        string,
 *   keypair:    CryptoKeyPair,
 *   publicJwk:  JsonWebKey,
 *   privateJwk: JsonWebKey,
 * }>}
 */
export async function generateIdentity() {
  const keypair    = await generateKeypair()
  const did        = await deriveDID(keypair.publicKey)
  const publicJwk  = await exportKey(keypair.publicKey)
  const privateJwk = await exportKey(keypair.privateKey)

  return { did, keypair, publicJwk, privateJwk }
}


// ─────────────────────────────────────────────────────────────────────────────
// 2. PASSWORD KEY DERIVATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derive an AES-256-GCM encryption key from a password.
 *
 * Uses PBKDF2 with SHA-256 and 600,000 iterations.
 * The salt must be stored alongside the encrypted vault —
 * it is NOT secret but MUST be unique per vault.
 *
 * @param {string}     password
 * @param {Uint8Array} salt       - 32 random bytes, stored with vault
 * @returns {Promise<CryptoKey>}  - AES-GCM key, not extractable
 */
export async function deriveVaultKey(password, salt) {
  // Import password as raw key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encode(password),
    'PBKDF2',
    false,            // not extractable — only used to derive
    ['deriveKey']
  )

  // Derive the AES key
  return crypto.subtle.deriveKey(
    {
      name:       'PBKDF2',
      salt:       salt,
      iterations: PBKDF2_ITERATIONS,
      hash:       PBKDF2_HASH,
    },
    keyMaterial,
    { name: 'AES-GCM', length: AES_KEY_LENGTH },
    false,            // vault key is not extractable — stays in memory only
    ['encrypt', 'decrypt']
  )
}

/**
 * Generate a new random salt for a new vault.
 * Call this ONCE when creating a vault. Store alongside the vault.
 *
 * @returns {Uint8Array}  32 random bytes
 */
export function generateSalt() {
  return randomBytes(SALT_LENGTH)
}


// ─────────────────────────────────────────────────────────────────────────────
// 3. VAULT ENCRYPTION / DECRYPTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Encrypt plaintext data with an AES-256-GCM key.
 * A new random IV is generated for every encryption operation.
 *
 * AES-GCM is authenticated encryption — it detects tampering.
 * If the ciphertext or IV is modified, decryption will throw.
 *
 * @param {CryptoKey} vaultKey    - derived from deriveVaultKey()
 * @param {string}    plaintext   - JSON string of vault contents
 * @returns {Promise<{ iv: string, ciphertext: string }>}
 *   Both values are base64url strings, safe to store in IndexedDB or export.
 */
export async function encryptVault(vaultKey, plaintext) {
  const iv         = randomBytes(IV_LENGTH)
  const encoded    = encode(plaintext)

  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    vaultKey,
    encoded
  )

  return {
    iv:         toBase64url(iv),
    ciphertext: toBase64url(new Uint8Array(cipherBuffer)),
  }
}

/**
 * Decrypt an encrypted vault payload.
 * Throws if the password is wrong or the data has been tampered with.
 * NEVER catch this silently — a throw means wrong password or corrupted data.
 *
 * @param {CryptoKey} vaultKey
 * @param {string}    iv          - base64url IV from encryptVault()
 * @param {string}    ciphertext  - base64url ciphertext from encryptVault()
 * @returns {Promise<string>}     - plaintext JSON string
 * @throws {Error}                - if decryption fails (wrong key or tampered data)
 */
export async function decryptVault(vaultKey, iv, ciphertext) {
  const ivBytes         = fromBase64url(iv)
  const ciphertextBytes = fromBase64url(ciphertext)

  const plainBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBytes },
    vaultKey,
    ciphertextBytes
  )

  return decode(new Uint8Array(plainBuffer))
}


// ─────────────────────────────────────────────────────────────────────────────
// 4. VAULT LIFECYCLE — CREATE, UNLOCK, LOCK, SAVE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a brand new vault for a new user.
 *
 * Flow:
 *   1. Generate identity (DID + keypair)
 *   2. Generate salt
 *   3. Derive vault key from password + salt
 *   4. Build vault object
 *   5. Encrypt vault
 *   6. Return encrypted payload + salt for storage
 *
 * @param {string} password
 * @param {string} handle       - chosen username
 * @param {Object} [profile]    - optional personal info
 * @returns {Promise<VaultPayload>}
 */
export async function createVault(password, handle, profile = {}) {
  const identity  = await generateIdentity()
  const salt      = generateSalt()
  const vaultKey  = await deriveVaultKey(password, salt)
  const now       = new Date().toISOString()

  const vault = {
    version:  VAULT_VERSION,
    identity: {
      id:       identity.did,
      handle,
      avatar:   null,
      profile:  { name: null, bio: null, email: null, ...profile },
      location: null,
      virtual:  true,
      created_at: now,
      updated_at: null,
    },
    keys: {
      publicKey:  identity.publicJwk,
      privateKey: identity.privateJwk,   // encrypted as part of vault
    },
    credentials: [],
    keychain:    [],
    files:       [],
    sessions:    [],
    created_at:  now,
    updated_at:  null,
  }

  const plaintext = JSON.stringify(vault)
  const { iv, ciphertext } = await encryptVault(vaultKey, plaintext)

  return {
    // Store this in IndexedDB
    salt:       toBase64url(salt),
    iv,
    ciphertext,
    did:        identity.did,    // store unencrypted — it's a public identifier
    created_at: now,
  }
}

/**
 * Unlock an existing vault with the user's password.
 *
 * @param {string} password
 * @param {string} salt         - base64url salt from stored VaultPayload
 * @param {string} iv           - base64url IV from stored VaultPayload
 * @param {string} ciphertext   - base64url ciphertext from stored VaultPayload
 * @returns {Promise<{ vault: Object, vaultKey: CryptoKey }>}
 * @throws {Error}              - 'WRONG_PASSWORD' if decryption fails
 */
export async function unlockVault(password, salt, iv, ciphertext) {
  const saltBytes = fromBase64url(salt)
  const vaultKey  = await deriveVaultKey(password, saltBytes)

  let plaintext
  try {
    plaintext = await decryptVault(vaultKey, iv, ciphertext)
  } catch {
    // AES-GCM authentication failure = wrong password or corrupted data
    const err = new Error('WRONG_PASSWORD')
    err.code  = 'WRONG_PASSWORD'
    throw err
  }

  const vault = JSON.parse(plaintext)
  return { vault, vaultKey }
}

/**
 * Save (re-encrypt) a modified vault with the existing vault key.
 * Call this after any change to vault contents.
 *
 * @param {CryptoKey} vaultKey    - the in-memory key from unlockVault()
 * @param {Object}    vault       - the modified vault object
 * @param {string}    salt        - original base64url salt (unchanged)
 * @returns {Promise<VaultPayload>}
 */
export async function saveVault(vaultKey, vault, salt) {
  vault.updated_at = new Date().toISOString()
  const plaintext  = JSON.stringify(vault)
  const { iv, ciphertext } = await encryptVault(vaultKey, plaintext)

  return {
    salt,
    iv,
    ciphertext,
    did:        vault.identity.id,
    created_at: vault.created_at,
    updated_at: vault.updated_at,
  }
}

/**
 * Change the vault password.
 * Decrypts with old password, re-encrypts with new password + new salt.
 *
 * @param {string} oldPassword
 * @param {string} newPassword
 * @param {VaultPayload} stored   - current stored payload
 * @returns {Promise<VaultPayload>}
 * @throws {Error}                - 'WRONG_PASSWORD' if old password is wrong
 */
export async function changePassword(oldPassword, newPassword, stored) {
  // Decrypt with old password
  const { vault } = await unlockVault(
    oldPassword, stored.salt, stored.iv, stored.ciphertext
  )

  // New salt + new key
  const newSalt    = generateSalt()
  const newKey     = await deriveVaultKey(newPassword, newSalt)

  vault.updated_at = new Date().toISOString()
  const plaintext  = JSON.stringify(vault)
  const { iv, ciphertext } = await encryptVault(newKey, plaintext)

  return {
    salt:       toBase64url(newSalt),
    iv,
    ciphertext,
    did:        vault.identity.id,
    created_at: vault.created_at,
    updated_at: vault.updated_at,
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// 5. SIGNATURES — REFERRALS, CREDENTIALS, PRESENTATIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sign a payload with the identity's private key.
 * Used for: referrals, credential requests, verifiable presentations.
 *
 * The payload is JSON-stringified and signed as UTF-8 bytes.
 * Returns a base64url signature string.
 *
 * @param {CryptoKey} privateKey    - Ed25519 private key from vault
 * @param {Object}    payload       - the data to sign
 * @returns {Promise<string>}       - base64url signature
 */
export async function sign(privateKey, payload) {
  const data      = encode(JSON.stringify(payload))
  const sigBuffer = await crypto.subtle.sign('Ed25519', privateKey, data)
  return toBase64url(new Uint8Array(sigBuffer))
}

/**
 * Verify a signature against a payload and public key.
 *
 * @param {CryptoKey} publicKey     - Ed25519 public key
 * @param {Object}    payload       - the original payload
 * @param {string}    signature     - base64url signature from sign()
 * @returns {Promise<boolean>}
 */
export async function verify(publicKey, payload, signature) {
  const data    = encode(JSON.stringify(payload))
  const sigBytes = fromBase64url(signature)
  return crypto.subtle.verify('Ed25519', publicKey, sigBytes, data)
}

/**
 * Reconstruct the signing key from the vault for active use.
 * Called after unlockVault() to get a usable CryptoKey for signing.
 *
 * @param {Object} vault    - decrypted vault object
 * @returns {Promise<{ publicKey: CryptoKey, privateKey: CryptoKey }>}
 */
export async function loadKeypair(vault) {
  const [publicKey, privateKey] = await Promise.all([
    importKey(vault.keys.publicKey,  'verify'),
    importKey(vault.keys.privateKey, 'sign'),
  ])
  return { publicKey, privateKey }
}


// ─────────────────────────────────────────────────────────────────────────────
// 6. BACKUP — EXPORT AND IMPORT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Export the vault as an encrypted backup file.
 *
 * The backup is the full encrypted VaultPayload as JSON.
 * It is ALREADY encrypted — the backup file itself is safe to store anywhere.
 * To restore, the user needs this file AND their password.
 *
 * File extension: .passport
 * MIME type: application/x-passport-vault
 *
 * @param {VaultPayload} payload    - the stored encrypted vault
 * @returns {Blob}                  - downloadable file
 */
export function exportBackup(payload) {
  const exportData = {
    format:     'passport-vault',
    version:    VAULT_VERSION,
    exported_at: new Date().toISOString(),
    payload,
  }
  const json = JSON.stringify(exportData, null, 2)
  return new Blob([json], { type: 'application/x-passport-vault' })
}

/**
 * Parse an imported backup file.
 * Does NOT decrypt — returns the encrypted payload for unlockVault().
 *
 * @param {File} file       - the .passport file
 * @returns {Promise<VaultPayload>}
 * @throws {Error}          - 'INVALID_BACKUP' if file is malformed
 */
export async function importBackup(file) {
  const text = await file.text()
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    throw Object.assign(new Error('INVALID_BACKUP'), { code: 'INVALID_BACKUP' })
  }

  if (parsed.format !== 'passport-vault' || !parsed.payload) {
    throw Object.assign(new Error('INVALID_BACKUP'), { code: 'INVALID_BACKUP' })
  }

  return parsed.payload
}

/**
 * Export just the public DID document.
 * This is safe to share publicly — contains only the public key.
 * Used for did:web resolution and verifier lookups.
 *
 * @param {Object} vault
 * @returns {Object}   W3C DID Document
 */
export function exportDIDDocument(vault) {
  const did = vault.identity.id
  return {
    '@context':         ['https://www.w3.org/ns/did/v1'],
    id:                 did,
    verificationMethod: [{
      id:                 `${did}#key-1`,
      type:               'JsonWebKey2020',
      controller:         did,
      publicKeyJwk:       vault.keys.publicKey,
    }],
    authentication:     [`${did}#key-1`],
    assertionMethod:    [`${did}#key-1`],
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// 7. INDEXEDDB STORAGE
// ─────────────────────────────────────────────────────────────────────────────

const DB_NAME    = 'passport'
const DB_VERSION = 1
const STORE_NAME = 'vault'

/**
 * Open (or create) the IndexedDB database.
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)

    req.onupgradeneeded = e => {
      const db = e.target.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' })
      }
    }

    req.onsuccess = e => resolve(e.target.result)
    req.onerror   = e => reject(e.target.error)
  })
}

/**
 * Save the encrypted vault payload to IndexedDB.
 * @param {VaultPayload} payload
 * @returns {Promise<void>}
 */
export async function persistVault(payload) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.put({ key: 'current', ...payload })
    tx.oncomplete = resolve
    tx.onerror    = e => reject(e.target.error)
  })
}

/**
 * Load the encrypted vault payload from IndexedDB.
 * Returns null if no vault exists (first-time user).
 *
 * @returns {Promise<VaultPayload|null>}
 */
export async function loadPersistedVault() {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const req   = store.get('current')
    req.onsuccess = e => resolve(e.target.result ?? null)
    req.onerror   = e => reject(e.target.error)
  })
}

/**
 * Delete the vault from IndexedDB.
 * DESTRUCTIVE — only call on explicit user request.
 * After this, the vault is gone unless the user has a backup file.
 *
 * @returns {Promise<void>}
 */
export async function deletePersistedVault() {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.delete('current')
    tx.oncomplete = resolve
    tx.onerror    = e => reject(e.target.error)
  })
}

/**
 * Check if a vault exists in IndexedDB.
 * @returns {Promise<boolean>}
 */
export async function vaultExists() {
  const payload = await loadPersistedVault()
  return payload !== null
}
