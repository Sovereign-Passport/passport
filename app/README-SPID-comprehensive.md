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
  Autonomous, self-hosted community node (any Node.js 18+ machine or Pi)
  MduSL is the FIRST Vine — bootstrap infrastructure, never the center
  Issues MembershipCredential to grapes (signed SD-JWT)
  3-admin quorum governance
  did:web identity — resolvable at /.well-known/did.json
  Referral weight system — trust memory, not a score
  Encrypted backup — AES-256-GCM, 3-file rotation
  $100 CAD one-time network membership
  Runs on any Node.js 18+ machine or VPS

VIGNARD (regional layer linking Vines) — FUTURE
  The "Quebec Vignard" exists today only as a GHOST placeholder:
    visible in the bootstrap, but NOT active and NOT operational.
  Do not claim or invent an active Vignard DID.
  Future activation does not change the hierarchy.

VINEYARD (federation of Vignards — not yet built)
  Vines recognizing each other
  Peer backup mesh — Shamir secret sharing
  Not purchased — earned through trust
```

---

## Architecture status & sovereignty (after Axis Mundi)

- **Canonical hierarchy:** Grape → Cluster → Vine → Vignard → Vineyard.
- **A Cluster exists without a server.** It lives first in Passports. Linking it to a Vine is **optional** and only enables that Vine's services.
- **Switchboard is stateless** and is deployed **locally with each Vine**: signed DID presentation + fresh nonce on every request. It is **not** a global authority and **not** a central database.
- **Orbit is an optional MduSL service**, never a SPID authority.
- **MduSL services are an alpha implementation**; they do not define a universal dependency on MduSL.
- **Existing:** Billboard `[existant · alpha MduSL]`. **Future:** Calendar, Messages.
- **Issuer signs and forgets:** the holder keeps the proof; the verifier checks the math. A temporary delivery or a minimal log must never become a central identity database.
- **The SPID network is the chain of relations and signed proofs between DIDs** — not a registry, not a database; the **signature is the authority**, not the server.
- **The Passport `did:key` is sovereign and self-referential:** it holds the **only valid metadata** of its own identity and its Clusters. Every other DID — **including a device DID** — carries its reference by **signed credential** (parent, level, role, membership), proven, never declared.
- **A Vine signs only the statuses it grants inside its own Vine.** The **Passport holds those proofs**; the **Switchboard verifies them at each protected operation** and keeps only the **authorized fragments**.
- **Referrals are relational proofs and a soft audit** — never a central registry, never an automatic authorization.
- **MduSL is a prototype / bootstrap, not a root of trust.** No dependency on MduSL is universal.

---

## Fragmentation fédérée future — réseau SPID

- Fragmentation becomes possible as soon as **two distinct sovereign SPID servers** establish an **authorized network relation**.
- The servers may **negotiate which fragments** each one keeps.
- **Two Vines** can fragment **directly**, with no Vignard required.
- A **Vine and a Vignard**, or **several Vignards**, may use the **same principle**.
- **No party** may **durably** hold the whole dataset.
- Each server keeps only the **consented fragments**.
- The **Switchboard** verifies the **proofs**, retrieves the **needed fragments**, **composes the authorized response temporarily**, transmits it, then **forgets** that composition.
- The **Vignard** coordinates this mechanism at the **regional scale**.
- The **Vineyard** is the **broader federation of Vignards**.
- This mechanism remains **future / not implemented**.

---

## Cluster lifecycle & relations (practical)

- A **Cluster** is created inside a **Passport**; it has one canonical **`cluster_id`** and **belongs to the Passport DID that created it**.
- The founder is the **founding authority**: it may grant or revoke **administration** to other DIDs using **signed proofs**. A delegated **administrator** acts on the Cluster but does **not** own it.
- **Membership** (member DIDs) is distinct from **ownership** and **administration**.
- A Cluster can live **only in Passports (no server)**. Later it may **use a Vine's services** (service hosting), be **recognised** through network relations, and take part in a **regional Vignard** — without ever creating a new Cluster or changing its `cluster_id`.
- **Hosting is not ownership:** a Vine that hosts a Cluster's services does **not** own the Cluster; a Vignard is an **affiliation**, never an owner.
- The **Passport's local Cluster** and the **Cluster a Vine sees** are the **same canonical object**, viewed from two layers — not two copies.
- A Cluster **never automatically becomes a Vine** as it grows.

---

## Architectural choices — deliberate, not default

| Choice | Why | What was considered and rejected |
|---|---|---|
| Modular source, separate-file deploy | Maintainable source, small index | React/Vue + bundler |
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
