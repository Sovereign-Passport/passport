# 🛂 Sovereign Passport — SPID

**Sovereign digital identity for communities.**  
No central server. No company holds your data. Your keys live on your device.

[![License: MIT](https://img.shields.io/badge/License-MIT-gold.svg)](LICENSE)
[![Status: Active Development](https://img.shields.io/badge/Status-Active%20Development-green.svg)]()
[![Standards: W3C DID](https://img.shields.io/badge/W3C-DID%20Core-blue.svg)](https://www.w3.org/TR/did-core/)
[![Crypto: WebCrypto API](https://img.shields.io/badge/Crypto-WebCrypto%20API-purple.svg)]()

---

## What is Sovereign Passport?

Sovereign Passport (SPID) is an open-source sovereign digital identity system built for communities — eco-villages, municipalities, cooperatives, and any group of people who believe identity should belong to people, not platforms.

A **Passport** is a cryptographic keypair generated on your device. It never leaves. No company issues it, no server stores it, no password reset email can compromise it.

Communities issue **verifiable credentials** to their members — membership cards, roles, access rights — using open W3C standards. Members hold these credentials in their Passport wallet and selectively disclose only what they choose, to whom they choose, when they choose.

The math is the authority. Not the institution.

---

## Core Principles

| Principle | Implementation |
|---|---|
| **Self-sovereign** | Ed25519 keypair generated on-device. Your DID is derived from your public key. |
| **No passwords stored** | AES-256-GCM vault encrypted with PBKDF2-derived key. Password never touches a server. |
| **Selective disclosure** | SD-JWT credentials. Prove membership without revealing your name. Prove age without revealing your birthdate. |
| **No central server** | Credentials live in your wallet. Issuers sign and forget. Verifiers check math, not databases. |
| **Open standards** | W3C DID Core, SD-JWT, OID4VCI, OID4VP. Interoperable by design. |
| **Zero dependencies** | Wallet runs on WebCrypto API. No npm, no blockchain, no external libraries. |
| **Law 25 compliant** | Data minimization by architecture. No central breach surface. Consent is cryptographic. |

---

## How It Works

```
ISSUER                    HOLDER                      VERIFIER
(community server)        (your phone)                (gate, event, service)

Generates credential  →   Stores in vault         
Signs with DID key        Selectively discloses   →   Verifies issuer signature
Forgets the rest          Signs presentation           Checks math — no server call
```

Three actors. No middleman. The issuer's job ends at issuance.

---

## The Trust Model — Vines and Grapes

Sovereign Passport uses a **web of trust** — not a hierarchy of authorities.

```
Passport holder ("Grape")
  └── invited by an existing member
  └── presents at community location → becomes Candidate
  └── approved by community → becomes Member
  └── can invite others → becomes Referrer
  └── can found new communities → becomes Issuer

Single community ("Node / Cluster")
  └── grows to 2+ communities → forms a Network ("Vine")
  └── network of networks → forms a Registry ("Vineyard")
```

Every community names its own world. The system has canonical terms internally. Your community calls members "Grapes", "Villagers", or "Citizens" — it doesn't matter. The cryptography is the same.

---

## Repository Structure

```
Sovereign-Passport/
├── passport/          ← This repo — PWA wallet (runs on phone/browser)
├── issuer/            ← Docker issuer service (communities deploy this)
└── verifier/          ← Static verifier page (no server needed)
```

### This repo — `passport`

```
passport/
├── app/
│   ├── passport.html           ← Complete PWA (single file, no build step)
│   └── src/
│       ├── crypto/
│       │   └── vault.js        ← Key generation, encryption, DID derivation
│       ├── identity/
│       │   └── identity.js     ← Profile, memberships, referrals, keychain
│       ├── nodes/
│       │   └── node.js         ← Community lifecycle, members, sessions
│       └── credentials/
│           └── credentials.js  ← SD-JWT issue, present, verify
├── shared/
│   ├── models.js               ← Canonical data models
│   ├── status.js               ← State machine
│   └── rules.js                ← Governance logic
└── tests/
    ├── test-vault.html         ← Crypto layer (19 tests)
    ├── test-identity.html      ← Identity layer (34 tests)
    ├── test-node.html          ← Node layer (41 tests)
    └── test-credentials.html   ← Credentials layer (35 tests)
```

**129 tests. Zero failures.**

---

## Quick Start

### Run the wallet

No build step. No npm. No server required for the wallet itself.

```bash
# Clone
git clone https://github.com/Sovereign-Passport/passport.git
cd passport

# Open in browser — that's it
firefox app/passport.html
# or
open app/passport.html
```

### Run the tests

Open any test file directly in a modern browser:

```
tests/test-vault.html        → Crypto foundation
tests/test-identity.html     → Identity layer
tests/test-node.html         → Community layer
tests/test-credentials.html  → Credential layer
```

Click **Run Tests**. All 129 should pass.

### Deploy a community issuer

```bash
git clone https://github.com/Sovereign-Passport/issuer.git
cd issuer
cp .env.example .env
# Edit .env with your domain and settings
docker compose up -d
```

Your community can now issue verifiable credentials to Passport holders.

---

## Cryptographic Stack

| Component | Algorithm | Why |
|---|---|---|
| Identity keypair | Ed25519 | Fast, small, no parameter choices to misconfig |
| DID method | did:key | Self-contained — no ledger, no server |
| Vault encryption | AES-256-GCM | Authenticated encryption — tamper detection built in |
| Password KDF | PBKDF2-SHA256 (600k iterations) | OWASP 2023 recommendation |
| Credential format | SD-JWT | EU Digital Identity standard, selective disclosure |
| Credential transport | OID4VCI / OID4VP | Open standard, wallet-agnostic |
| Hash algorithm | SHA-256 | Disclosure commitments |

Everything runs in the browser via the **WebCrypto API**. No external crypto libraries. No blockchain. No trusted third party.

---

## Member Status Flow

```
UNKNOWN → INVITED → CANDIDATE → APPROVED ⇄ SUSPENDED
                                         → REVOKED (terminal)
UNKNOWN → TEMPORARY (session) → CANDIDATE or UNKNOWN (on expiry)
```

- **INVITED** — referred by an existing member
- **CANDIDATE** — physically presented at community location
- **APPROVED** — full member, can invite others
- **TEMPORARY** — roaming session guest (time-limited)

Referral weight is recorded at the time of invitation. An INVITED member referring someone carries less weight than an APPROVED member. This is transparent — communities see the full context.

---

## Governance Levels

```
Level 1 — Node      Single community. Founder-governed.
                    Free. Self-hosted or on shared infrastructure.

Level 2 — Network   2+ nodes forming a federation (Vine).
                    Triggered automatically. Collective governance.

Level 3 — Registry  Federation of federations (Vineyard).
                    Desktop software. Peer-to-peer backup mesh.
                    Embedded AI agent. $100 CAD one-time.
```

The $100 Vineyard license covers infrastructure costs and funds the project. Vineyards become load-bearing peers in the distributed backup network. As the network grows, the central infrastructure dependency drops away.

---

## Privacy & Law 25 (Quebec)

Sovereign Passport is designed for **Quebec Law 25 compliance by architecture**:

- **Data minimization** — credentials contain only what the issuer attests. Presentations contain only what the verifier needs.
- **Right to deletion** — credentials live in the user's wallet. The user deletes them. Issuers cannot.
- **No central breach surface** — no database of credential holders exists to breach.
- **Cryptographic consent** — every presentation requires the user to sign with their private key. Consent is a verifiable act, not a checkbox.

---

## Roadmap

```
✅ Phase 1 (now)
   Passport PWA wallet
   Vault crypto foundation (Ed25519, AES-256-GCM, PBKDF2)
   SD-JWT credential layer
   Community node logic
   129 tests passing

🔨 Phase 2 (building)
   Issuer Docker service
   Static verifier page
   PWA manifest + service worker (installable)
   Node UI screens (invite, scan, membership view)
   GitHub Pages deployment

⬜ Phase 3
   Level 2 network federation
   Device sync
   Roaming sessions UI

⬜ Phase 4 (Vineyard)
   Desktop software ($100 CAD)
   Peer-to-peer backup mesh
   Distributed recovery protocol
   Embedded AI agent
```

---

## Contributing

This project is in active early development. The core cryptographic and governance layers are complete and tested. The next phase is the issuer service and UI screens.

If you want to contribute:

1. Read the [architecture overview](docs/architecture.md) *(coming soon)*
2. Check [open issues](https://github.com/Sovereign-Passport/passport/issues)
3. Open a discussion before large PRs

**Areas where help is most welcome:**
- Issuer service (Node.js / Docker)
- PWA manifest and service worker
- Translations (French / Quebec context especially)
- Community deployment documentation

---

## Philosophy

Identity is not a product. It is not a service. It is not something a company grants you in exchange for your data.

Identity is the cryptographic proof that you are you — generated on your device, held by you, presented by you, on your terms.

Sovereign Passport exists because communities deserve infrastructure that serves them, not the other way around.

---

## License

MIT — see [LICENSE](LICENSE)

Built with care in Quebec, Canada.  
`sovereign-passport.id`

---

*"The math is the authority. Not the institution."*
