# SPID Vault Architecture
**Version:** draft-1  
**Branch:** feature/vault-architecture  
**Status:** design document — no code changes

---

## Purpose

This document defines the vault architecture for SPID at all three sovereignty layers: grape (individual), vine (community), and vignard (network). It serves as the contract that all vault feature branches must respect.

---

## Core Principle

> The vault is not a password manager. It is a sovereign container for identity, relationships, and chosen disclosures.

Every item in a vault has an owner, a visibility state, and a provenance record. Nothing leaves a vault without the owner's explicit action.

---

## Sovereignty Layers

### Grape Vault — Personal, Device-Sovereign

The grape vault lives on the individual's device (browser IndexedDB or native app storage). The vine server never sees its contents.

```
CONTENTS
  identity/
    did-keypair        ← Ed25519 private + public key. Never leaves device. Ever.
    did-document       ← Public DID document (did:key or did:web)

  credentials/
    membership-VCs/    ← Cluster membership credentials issued by vines
    referral-records/  ← Signed records of invitations made and received

  files/
    [file-id].enc      ← Encrypted files owned by this grape
    [file-id].meta     ← Unencrypted: name, type, visibility state, created_at

  shares/
    [share-id].vc      ← Share credentials received from other grapes
```

**Access rules:**
- System (SPID client): reads identity for signing operations only
- Grape: full read/write
- Vine: never
- Other grapes: never directly — only via share credentials

---

### Vine Vault — Community, Server-Sovereign

The vine vault lives on the vine's server. Encrypted at rest with AES-256-GCM derived from the vine's Ed25519 key.

```
CONTENTS
  vine.vault           ← Ed25519 keypair, AES key, PBKDF2 params
  vine.db              ← SQLite: grapes, clusters, members, weight events
  backups/
    vine-YYYYMMDD.db.enc   ← Encrypted DB snapshots (max 3, rotated)
    vine-YYYYMMDD.meta     ← Unencrypted: vine DID, timestamp, version
  logs/
    activity.log       ← Event log (already in DB, exportable)
  fragments/           ← Shamir shards (Level 4 — not yet implemented)
```

**Access rules:**
- Vine operator (admin): full access via unlocked vault
- Grapes: never access vine vault directly
- Vineyard: receives only public DID document and signed sync events

---

### Vignard Vault — Network, Consensus-Sovereign

Not yet implemented. Defined here for architectural continuity.

The vignard vault is distributed — no single server holds it. Consensus among 3+ vines required to reconstruct any vignard secret (Shamir Secret Sharing).

```
CONTENTS (distributed)
  vignard-did          ← Network identity (did:web on consensus domain)
  founder-credential   ← Issued to all grapes at creation (survives vine resets)
  sync-state           ← Last known state of each vine in the network
  fragments/           ← Each vine holds one Shamir shard
```

---

## File Visibility States

Every file in a grape vault has exactly one visibility state, chosen at creation or share time.

### Private
- Never leaves the grape's device
- Never shown in share UI
- No credential issued
- Invisible to all other parties

### Public
- Anonymous — grape's DID is not associated
- No tracking, no provenance tag, no credential required
- Recipient can save to their own vault freely
- Grape going offline has no effect — copies already exist
- Use for: celebration images, public announcements, open resources

### Copyright
- Signed by grape's DID + timestamp at creation
- Viewed on SPID only — UI renders in protected viewer
  - No download button
  - Right-click disabled on viewer
  - Text rendered as canvas (not selectable DOM)
  - Grape's DID + timestamp watermark in corner
- Requires a share credential to view
- Grape going offline = credential presentation fails = file unavailable
  - This is automatic — did:web dependency does the work
- Anomaly tracking: unusual credential presentation volume flagged at vineyard level
- If file leaks: provenance chain (who received it, when) points back

**Share moment UI — two options only:**
```
Share "[filename]" with [cluster name]

  ○ Public    — anonymous, free, no tracking
  ● Copyright — signed by your DID, SPID viewer only

  [ Share ]
```
Private files never appear in this UI.

---

## Share Credential Structure

When a grape shares a copyright file with a cluster, a share credential is issued:

```json
{
  "type": "FileShareCredential",
  "credentialSubject": {
    "id": "did:key:z6Mk...(Eva)",
    "file_hash": "sha256:abc123...",
    "file_name": "chess-notes.pdf",
    "cluster_id": "sunday-chess-cluster-id",
    "visibility": "copyright",
    "expires_at": null
  },
  "issuer": "did:key:z6Mk...(Eva)",
  "issuanceDate": "2026-05-14T10:00:00Z",
  "proof": {
    "type": "Ed25519Signature2020",
    "verificationMethod": "did:key:z6Mk...(Eva)",
    "signature": "..."
  }
}
```

**Revocation:** Eva revokes the share credential. Clients can no longer fetch new copies. Copies already received cannot be deleted — but the provenance chain records receipt post-revocation. Weight ledger logs the revocation event.

---

## The Spy Problem

Any sharing system faces this: once data arrives on someone else's device, technical controls cannot prevent copying.

SPID's response is not DRM. It is **signed memory**:

- Every file share is a signed event in the weight ledger
- Every receipt is acknowledged by the recipient's client
- Unusual credential presentation volume is detectable at vineyard level
- If a file leaks, the provenance chain identifies the point of origin
- Social consequence enforced by community, not software

> SPID doesn't prevent copying. SPID makes copying a signed, traceable, socially costly act. The community is the enforcement layer.

---

## Vault UI — File Rows

Each file row in the vault UI shows:

```
[icon]  filename.ext          [visibility badge]   [actions]
```

**Actions by file type:**

| File | Download | Share | Delete | Notes |
|------|----------|-------|--------|-------|
| vine.vault | — | — | — | Protected. No actions. |
| vine.db | ✓ | — | — | Download only. |
| backup .enc | ✓ | — | ✓ | Confirm before delete. |
| grape file (private) | ✓ | — | ✓ | Local only. |
| grape file (public) | ✓ | ✓ | ✓ | Share opens cluster picker. |
| grape file (copyright) | — | ✓ | ✓ | No download — share only. |
| received share (copyright) | — | — | ✓ | View in protected viewer. |

---

## Backup Architecture

**Encryption:** AES-256-GCM key derived from vault private key:
```js
const backupKey = crypto.createHash('sha256')
  .update(vaultPrivateKey)
  .update('spid-backup-v1')   // domain separator
  .digest()                   // 32-byte key
```

**Rotation:** Maximum 3 backup files. Oldest deleted automatically on new backup creation.

**Triggers:**
- On SIGTERM (pm2 shutdown) — safety net
- Daily cron at 03:00 VPS time — primary backup
- Manual — "Backup now" button in Advanced settings

**Restore flow:**
1. Vault must be unlocked first (key required for decryption)
2. Upload .enc file via Advanced settings UI
3. System decrypts → writes vine.db → restarts

**Backup files are safe to store anywhere.** Without the vault password they are unreadable bytes.

---

## Implementation Phases

### Now (Level 2D — current)
- Vine vault: backup encryption, rotation, SIGTERM handler, daily cron
- Vine vault UI: file rows with action icons, backup section in Advanced settings
- Grape vault: structure defined, not yet implemented in client

### Level 3A
- Grape vault: personal file store in browser (IndexedDB)
- Share credential issuance and revocation
- Protected viewer for copyright files
- Vault file UI on grape passport screen

### Level 3B
- Cluster file sharing — share credentials to cluster members
- Receipt acknowledgement signing
- Anomaly detection on credential presentation volume

### Level 4
- Vignard vault: Shamir Secret Sharing across 3+ vines
- Fragment sync on startup
- Distributed backup via network fragments

---

## Non-Goals

These will never be part of the vault:

- Password manager for external services (xyz.com passwords)
- Biometric storage
- Behavioral tracking of any kind
- Global reputation scores
- Content moderation or filtering

---

## Interoperability

The minimum SPID network interoperability requirement is:

```
did:key               → W3C standard, any implementation can verify
Ed25519 signature     → standard, any implementation can verify
membership VC schema  → defined by SPID-js, other implementations may adopt
```

Vault contents above this minimum are implementation-specific. A Pokemon SPID fork and a MduSL SPID vine can verify each other's grape credentials. Neither needs to understand the other's vault internals.

---

*Salted. Signed. Alive.*

© 2026 JF Bertrand — Sovereign Passport ID
Built in Saint-Léon-de-Standon, Quebec, Canada
Prior use established publicly: May 2026
