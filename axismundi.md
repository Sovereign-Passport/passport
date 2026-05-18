# Axis Mundi — SPID Strategic Compass

> The center that holds. Return here when the project feels complex.

*Captured May 18, 2026 — from three vision sources and one honest second opinion.*

---

## What SPID actually is

Not a product. Not a platform. Not a web3 project.

Infrastructure — like roads, like postal systems — that makes it possible
for people who know each other to recognize each other cryptographically
across distance. Without any company mediating that relationship.

The math is the authority. Not the institution.

---

## What makes SPID unusual

Most identity systems choose one of two paths:
- Corporate identity (convenient, centralized, revocable)
- Anarchic pseudonymity (free, unaccountable, untrustworthy)

SPID explores a third path:
- Persistent identity
- Voluntary trust
- Community-scale federation
- Local sovereignty
- Non-tokenized legitimacy

That combination is rare. Protect it.

What was deliberately avoided:
- Token economics
- Consensus obsession
- Chain dependency
- Speculative architecture
- Web3 jargon gravity

What was kept:
- Sovereign identity
- Cryptographic trust
- Federation
- Portable credentials
- Peer recognition

---

## The strongest sentence in the project

> "Weight is memory, not judgment."

This is not a tagline. It is a constitutional rule.

The moment weight becomes ranking, optimization, platform influence,
or social scoring — the spirit of SPID changes completely.

**Make this explicit in the codebase. Document it. Protect it.**

Weight is:
- local (per cluster, never global)
- contextual (same grape, different weight in different clusters)
- relational (earned through vouching, not calculated)
- append-only (history, not score)
- explainable (any grape can see why)

Weight is never:
- a global score
- a ranking system
- a recommendation engine
- an optimization target

---

## The constitutional rules

These are not preferences. They are load-bearing walls.

1. **No global score.** Weight is local and contextual. Always.

2. **AI is optional.** SPID functions fully without it. AI is never
   required trust infrastructure, governance authority, or ranking authority.
   Sovereignty quietly collapses otherwise.

3. **The SPID rule.** A .passport backup restores successfully regardless
   of where it was created. Cross-origin restore is a hard requirement. Always.

4. **Issuer forgets.** The vine signs and forgets. The grape holds.
   The verifier checks math. The issuer never knows when a credential is presented.

5. **Sovereign at every layer.** No layer accesses another without consent.

6. **Simple is beautiful.** Complexity is earned, not assumed.
   Every added feature must justify itself against this.

---

## The human metaphor — not cosmetic

Grape. Cluster. Vine. Vignard. Vineyard. Gathering. Touch.

People dismiss this as cosmetic. It is not.

It shapes governance intuition, onboarding psychology, and social expectations.
The terminology feels communal, organic, federated, non-corporate.

Protect the metaphor. Every community names their own world on top of it —
but the underlying metaphor stays alive.

---

## Architectural choices — locked

These were deliberate. Discuss before changing them.

| Choice | Why | What was rejected |
|---|---|---|
| Single-file passport | Inspectable, sovereign, no build pipeline | React/Vue + bundler |
| did:key for grapes | Self-contained, offline, no registry | did:ion, did:ethr, blockchain |
| did:web for vines | Human-resolvable, no CA | did:peer, Hyperledger |
| SQLite | Portable, simple backup, Raspberry Pi | PostgreSQL, MySQL |
| SD-JWT credentials | W3C standard, selective disclosure | AnonCreds, JSON-LD |
| Password vault | Universal, device-agnostic | Passkeys (roadmap) |
| System fonts | Sovereign, no Google dependency | Google Fonts |

---

## Honest gaps — acknowledged, not hidden

**No test suite.** 129 tests are described in the README. None exist yet.
External contribution is unsafe without them. This is priority 4.

**No OID4VCI.** Current invite flow is not interoperable with other wallets.
EU Digital Identity wallets cannot receive credentials from spid-js today.
Long-term roadmap.

**Passkeys not implemented.** Vision describes them. Code uses passwords.
Right long-term answer. Not yet done.

**Single-file passport is technical debt.** Not immediately. Later.
3800+ lines will become fragile and contributor-hostile.
Solution: internal modularization without a build step — clear regions,
isolated sections, pure functions, strict naming conventions.
Preserve deploy simplicity. Improve maintainability.

---

## The five risks — stay aware

**Risk 1 — AI layer creep.**
AI naturally centralizes power if not constrained.
Keep it architecturally optional. Never let it become governance authority.

**Risk 2 — Weight system mutation.**
Someone will eventually want ranking, spam resistance, influence calculation.
That is where systems mutate. "No global score" is constitutional.

**Risk 3 — Single founder trust root.**
Necessary now. Dangerous long-term.
Shamir transition plan is wise. Timing and social legitimacy matter more
than the technical split.

**Risk 4 — Single-file passport.**
Not urgent. Will become fragile. Modularize internally without build step.

**Risk 5 — Premature federation.**
Federation multiplies complexity brutally.
Nail one vine ecosystem first — 50-300 real humans, real friction,
real recovery events. Reality teaches architecture better than theory.

---

## What genuinely matters right now

> You need misunderstandings, misuse, forgotten passwords,
> accidental revocations, dead clusters, leadership disputes,
> dormant grapes. That's where architecture matures.

Real social testing is the most important thing happening next.
mdusl is live. Put real people through it. Let them break things.

Before adding features, ask:
- Does this help Eva recover her phone?
- Does this help a chess club onboard 10 members without confusion?
- Does this survive a forgotten password, a cluster typo, a dropped phone?

Identity systems die at recovery. Not at launch.

---

## Temporary infrastructure — needs migration

The following endpoints currently live on `mdusl.sovereign-passport.id`
as a practical starting point. They belong on dedicated subdomains
once DNS is configured:

| Current | Future | Purpose |
|---|---|---|
| `mdusl.sovereign-passport.id/api/passport/sync` | `sync.sovereign-passport.id` | 15-min cross-device relay |
| `mdusl.sovereign-passport.id/verifier` | `verify.sovereign-passport.id` | Credential verifier |

Both are currently hardcoded as a single constant at the top of passport.html.
When the subdomains are ready — one line changes each.

This is intentional pragmatism, not technical debt.
The mdusl vine is the bootstrap infrastructure.
The network infrastructure grows out of it naturally.

---



1. **Backup & Sync** — 15-minute VPS relay, cross-device recovery UX
   Protects real users. Completes the recovery story.

2. **Change handle + Naming system** — grapes name their own world
   Makes the app feel like theirs. Low complexity, high belonging.

3. **Real user testing on mdusl** — put 10-20 real people through it
   Let reality teach. Ship nothing new until this feedback is digested.

4. **Test suite** — vault crypto layer first, then credential layer
   Enables safe external contribution.

5. **Passport internal modularization** — without build step
   Enables external contribution. After tests exist.

6. **OID4VCI compatibility** — interop with EU wallets
   Long path. Start small. Important for legitimacy.

---

## What to say when someone asks what SPID is

*"It's infrastructure for human communities — like a postal system,
but cryptographic. Your identity belongs to you, mathematically.
Communities you trust issue credentials to you. You show only what
you choose. No company in the middle. No platform that can revoke
your membership. The math is the authority."*

---

## The macro picture in one paragraph

SPID is a serious sovereign identity experiment grounded in practical
community infrastructure rather than speculative crypto ideology.
The next challenge is no longer invention. It is disciplined simplification.
Nail one vine. Let real people use it. Let reality shape the architecture.
Keep weight local. Keep AI optional. Keep the metaphor alive.
The network will grow when communities are ready — not when the code is ready.

---

*Written May 18, 2026*
*Saint-Léon-de-Standon, Quebec, Canada*
*🍇*
