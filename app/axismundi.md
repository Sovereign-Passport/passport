# Axis Mundi — Sovereign Passport Strategic Compass

> The center that holds. Return here when the project feels complex.
> Also return here when momentum feels too good — that's when honest review matters most.

*Last updated: May 21, 2026 — Checkpoint L3A*

> This document is the **why**. It is not a technical specification.
> Object relations: `spid-js/docs/ARCHITECTURE.md`. Operations: `spid-js/README.md`.
> Canonical order: Axis Mundi → Architecture → README.

---

## What Sovereign Passport actually is

Infrastructure — like roads, like postal systems — that makes it possible
for people who know each other to recognize each other cryptographically
across distance. Without any company mediating that relationship.

Not a product. Not a platform. Not a web3 project.

The math is the authority. Not the institution.

---

## What makes Sovereign Passport unusual

Most identity systems choose one of two paths:
- Corporate identity (convenient, centralized, revocable)
- Anarchic pseudonymity (free, unaccountable, untrustworthy)

Sovereign Passport explores a third path: persistent identity, voluntary trust,
community-scale federation, local sovereignty, non-tokenized legitimacy.

What was deliberately avoided: token economics, consensus obsession,
chain dependency, speculative architecture, web3 jargon gravity.

What was kept: sovereign identity, cryptographic trust, federation,
portable credentials, peer recognition.

That combination is rare. Protect it.

---

## The constitutional rules

These are not preferences. They are load-bearing walls.

**1. No global score.**
Weight is local and contextual. Always.
The moment weight becomes ranking, optimization, or social scoring —
the spirit of Sovereign Passport changes completely.
"Weight is memory, not judgment." This sentence is not a tagline.
It is a constitutional rule.

**2. AI is optional.**
Sovereign Passport functions fully without it. AI is never required trust
infrastructure, governance authority, or ranking authority.
Sovereignty quietly collapses otherwise.

**3. The Sovereign Passport rule.**
A .passport backup restores successfully regardless of where it was created.
Cross-origin restore is a hard requirement. Always.

**4. Issuer forgets.**
The vine signs and forgets. The grape holds. The verifier checks math.
The issuer never knows when a credential is presented.

**5. Sovereign at every layer.**
No layer accesses another without consent.

**6. Simple is beautiful.**
Complexity is earned, not assumed.
Every added feature must justify itself against this.

---

## Architecture reaffirmed (Axis Mundi)

- **Canonical relations:** Grape creates a Cluster; a Cluster may use a Vine's services; a Vine may affiliate with a Vignard; Vignards may federate into a Vineyard.
- **MduSL is the first Vine** and bootstrap infrastructure — **never the center** of the network.
- **Switchboard is a distinct network role**, not a Vine: it verifies DID proofs and routes service/data exchanges. It owns no Vine data and is neither a global authority nor a central database. Its deployment topology is not defined here; see `ARCHITECTURE.md` §5 and §13.
- **A Cluster exists without a server**; attaching it to a Vine is optional and enables that Vine's services.
- **Orbit is an optional MduSL service** — never a Sovereign Passport authority.
- **MduSL services are an alpha implementation**; they do not define a universal dependency on MduSL.
- **The “Quebec Vignard” exists today only as a ghost placeholder** — visible in the bootstrap, not active, no active Vignard DID; future activation does not change the hierarchy.
- **A Cluster belongs to the Passport DID that created it**; that DID remains the **founding authority** and may grant or revoke **administration** to other DIDs through **signed proofs**. A delegated administrator acts but never becomes owner.
- **Ownership never depends on a Vine, a Vignard, or the server hosting the Cluster's services.** Using a Vine's services or entering regional **affiliations** never changes a Cluster's identity or `cluster_id`, and never turns a Cluster into a Vine.
- **The Sovereign Passport network is the chain of relations and signed proofs between DIDs** — not a registry, not a database. Authority is the **signature**, not the server.
- **The Passport `did:key` is sovereign and self-referential:** it holds the **only valid metadata** of its own identity and of its Clusters. No other DID, Vine, Vignard or server holds an authoritative copy of it.
- **Every other DID — including a device DID — carries its reference by signed credential.** Links (parent, level, role, membership) are **proven**, never declared.
- **Referrals are relational proofs and a soft audit** — never a central registry, never an automatic authorization.
- **A Vine signs only the statuses it grants inside its own Vine.** The Passport holds those proofs; the **Switchboard verifies them at every protected operation** and keeps only the **authorized fragments**.
- **MduSL is a prototype / bootstrap, not a root of trust of the network.** No dependency on MduSL is universal.

## Fragmentation fédérée future — réseau Sovereign Passport

- Fragmentation becomes possible as soon as **two distinct sovereign Sovereign Passport servers** establish an **authorized network relation**.
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

## The four risks — stay aware

**Risk 1 — AI layer creep.**
AI naturally centralizes power if not constrained.
Keep it architecturally optional. Never let it become governance authority.

**Risk 2 — Weight system mutation.**
Someone will eventually want ranking, spam resistance, influence scores.
That is where systems mutate. "No global score" is constitutional.

**Risk 3 — A bootstrap founder mistaken for a trust root.**
The mdusl founder key is a **bootstrap**, useful now, dangerous if read as
the network's root of trust. The Sovereign Passport network is the **chain of signed
proofs between DIDs**, not this founder. Shamir transition is wise; timing
and social legitimacy matter more than the technical split. Don't rush it.

**Risk 4 — Premature federation.**
The current system already has enough depth for years.
Federation multiplies complexity brutally. Nail one vine ecosystem first.
50-300 real humans, real friction, real recovery events, real forgotten
passwords. Reality teaches architecture better than theory.

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

## Priority order — honest

1. **Real user testing** — 10-20 people on mdusl, real friction
   Nothing teaches architecture like reality

2. **Verification of critical cryptographic flows**
   Enables safe contribution and safe editing

3. **Change handle + Naming system**
   Low complexity, high belonging for communities

4. **Backup & sync maturation**
   Recovery and portability first

5. **OID4VCI** — long path, important for legitimacy

---

## The human metaphor — not cosmetic

Grape. Cluster. Vine. Vignard. Vineyard.

This shapes governance intuition, onboarding psychology, social expectations.
The terminology feels communal, organic, non-corporate.
Every community names their own world on top of it —
but the underlying metaphor stays alive.

---

## What to say when someone asks what Sovereign Passport is

*"It's infrastructure for human communities — like a postal system,
but cryptographic. Your identity belongs to you, mathematically.
Communities you trust issue credentials to you. You show only what
you choose. No company in the middle. No platform that can revoke
your membership. The math is the authority."*

---

## The macro picture

Sovereign Passport is a serious sovereign identity experiment grounded in practical
community infrastructure rather than speculative crypto ideology.

The next challenge is no longer invention. It is disciplined simplification.

Nail one vine. Let real people use it. Let reality shape the architecture.
Keep weight local. Keep AI optional. Keep the metaphor alive.

The network will grow when communities are ready —
not when the code is ready.

---

*Written May 18, 2026 — Updated May 21, 2026 — Checkpoint L3A*
*Saint-Léon-de-Standon, Quebec, Canada*
*🍇*
