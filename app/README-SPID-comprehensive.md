# Sovereign Passport — SPID

> *"The math is the authority. Not the institution."*

**Status:** Active development — live at https://mdusl.sovereign-passport.id
**Passport PWA:** https://sovereign-passport.github.io/passport/passport.html
**Verifier:** https://sovereign-passport.github.io/verifier/index.html
**Vision:** https://sovereign-passport.com
**Checkpoint:** L3A — May 21, 2026
**License:** MIT (code) · CC BY-SA 4.0 (content)

---

## What is this?

Every platform you use today knows who you are. They decide what you can access,
what you can say, who you can reach. Your identity is their asset.

SPID is built on a different premise.

Your identity is a cryptographic keypair generated on your device. It never leaves.
No company issued it. No server stores it. No password reset email can compromise it.

Communities — eco-villages, municipalities, cooperatives, families, chess clubs —
issue verifiable credentials to their members. You hold them. You present only
what you choose, to whom you choose, when you choose.

SPID is not a social network. It is not a platform. It is infrastructure —
like roads, like postal systems — that makes it possible for people who know each
other to recognize each other cryptographically across distance.

The math is the authority. Not the institution.

---

## The layer model

```
GRAPE (person)
  Ed25519 keypair — generated in browser, never leaves device
  did:key — self-sovereign, no ledger, no blockchain
  Passport PWA — installable on any phone, no app store
  Vault: identity, credentials, files (private/shared)
  Free forever

GRAPE CLUSTER (personal gathering)
  Founded by a grape — their did:key is the issuer
  Name and description permanent — on every member credential
  Soft leave/rejoin — founder can step back and return
  Members hold GrapeClusterCredential, self-verified via did:key
  3+ members triggers silent pre-vine flag
  Witnessed by regional vignard (fire and forget, not a dependency)
  No server required — lives in the founder's passport

VINE (community — spid-js)
  Issues MembershipCredential to grapes (signed SD-JWT)
  3-admin quorum governance
  did:web identity — resolvable at /.well-known/did.json
  Referral weight system — trust memory, not a score
  Encrypted backup — AES-256-GCM, 3-file rotation
  $100 CAD one-time network membership
  Runs on any Node.js 18+ machine or VPS

VIGNARD (regional witness layer)
  Ghost DID — generated on first call, stored permanently
  Witnesses grape clusters and vines in a region
  3-admin quorum — same governance as vine
  Geo-anchored by ISO 3166-2 (CA-QC, CA-ON, US-NC...)
  Currently: mdusl VPS hosts Quebec Vignard (ghost status)

VINEYARD (federation — not yet built)
  Vines recognizing each other
  Peer backup mesh — Shamir secret sharing
  Not purchased — earned through trust
```

---

## Architectural choices — deliberate, not default

| Choice | Why | What was considered and rejected |
|---|---|---|
| Modular source, single-file deploy | Maintainable source, sovereign artifact | React/Vue + bundler |
| did:key for grapes | Self-contained, offline, no registry | did:ion, did:ethr, blockchain |
| did:web for vines | Human-resolvable, no CA needed | did:peer, Hyperledger |
| SQLite for vine | Portable, simple backup, Raspberry Pi | PostgreSQL, MySQL |
| SD-JWT credentials | W3C standard, selective disclosure | AnonCreds, JSON-LD |
| Password vault | Universal, works everywhere | Passkeys (roadmap) |
| System fonts only | No external calls at all | Google Fonts |
| Sovereign QR generator | No external calls, pure JS | api.qrserver.com |
| ES2017 target | Safari iOS/macOS compatibility | Modern ES2020+ syntax |
| Custom offer URL | Simple, works today | Full OID4VCI (roadmap) |
| build.cjs assembler | No npm, no bundler, pure Node.js | webpack, vite, rollup |

---

## File structure — Checkpoint L3A

```
app/                          SOURCE (edit these)
  passport.html               HTML screens + §4–§6 + §9 + boot  (1953 lines)
  passport.css                All styles                          ( 669 lines)
  passport.crypto.js          §1 crypto & identity               ( 375 lines)
  passport.state.js           §2+§3 state & navigation           ( 118 lines)
  passport.qr.js              Sovereign QR generator             ( 335 lines)
  passport.ui.js              Shared UI utilities                (  39 lines)
  passport.sync.js            §8 backup, sync, restore           ( 348 lines)
  passport.files.js           §7 vault file manager              ( 260 lines)
  passport.clusters.js        §10a cluster lifecycle             ( 427 lines)
  passport.invites.js         §10b invite generation             ( 236 lines)
  passport.offers.js          §10c credential offer acceptance   ( 279 lines)
  build.cjs                   Assembler script

docs/                         DEPLOY ARTIFACT (never edit directly)
  passport.html               Single sovereign file — ~200KB, zero deps
```

Original passport.html was 4536 lines.
Source passport.html is now 1953 lines — 57% reduction.
Deploy artifact assembles all source into one file automatically.

---

## Deploy flow

```bash
# 1. Edit source files in app/
# 2. ES compatibility check
es-check es2017 passport.*.js
# 3. Assemble
node build.cjs
# 4. Commit
git add [changed files] ../docs/passport.html
git commit -m "..."
git push
```

GitHub Pages serves `docs/passport.html`.
No external script tags. No CSP issues. Fully sovereign.

---

## ES2017 compatibility — mandatory

Run `es-check es2017` before every JS commit. Never use:
- `?.` `??` `0n` `600_000` `catch {}` `{...obj}`

---

## Honest gaps

| Gap | Impact | Plan |
|---|---|---|
| No test suite | Unsafe for external contribution | Start with passport.crypto.js |
| No OID4VCI | Not interoperable with other wallets | Long-term roadmap |
| Passkeys not implemented | Vision says passkeys, code uses passwords | Roadmap |
| Sync on mdusl (temporary) | Wrong domain for the feature | DNS migration when ready |

---

## Roadmap

```
NOW
  Real user testing — 10-20 people on mdusl, real friction

NEXT
  Change handle
  Naming system — communities rename Grape/Cluster/Vine
  Test suite — passport.crypto.js pure functions first

THEN
  Passkeys
  sync.sovereign-passport.id DNS migration

LATER
  OID4VCI — interop with EU wallets
  Cluster calendar
  AI agent (Ollama local first)
  Vineyard federation
```

---

## Contributing

- Edit source files in `app/` only — never `docs/passport.html`
- Run `node build.cjs` after every change
- Run `es-check es2017` on all JS files before committing
- No test suite yet — changes require manual verification

Where help is most needed:
- Test suite for passport.crypto.js
- French translation
- OID4VCI compatibility
- Docker packaging for spid-js

---

*Built in Saint-Léon-de-Standon, Quebec, Canada*
*© 2026 JF Bertrand — Sovereign Passport ID*
*🍇*
