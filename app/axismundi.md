# Axis Mundi — Sovereign Passport Strategic Compass

> The center that holds. Return here when the project feels complex.
> Also return here when momentum feels too good — that's when honest review matters most.

*Last updated: May 21, 2026 — Checkpoint L3A*

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

- **Canonical hierarchy:** Grape → Cluster → Vine → Vignard → Vineyard.
- **MduSL is the first Vine** and bootstrap infrastructure — **never the center** of the network.
- **Switchboard is stateless** and deployed **locally with each Vine** (signed DID presentation + fresh nonce on every request). It is neither a global authority nor a central database.
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

## Temporary infrastructure — needs migration

The following live on `mdusl.sovereign-passport.id` as a practical
starting point. They belong on dedicated subdomains:

| Current | Future | Purpose |
|---|---|---|
| `mdusl.../api/passport/sync` | `sync.sovereign-passport.id` | 15-min relay |
| `mdusl.../verifier` | `verify.sovereign-passport.id` | Credential verifier |

Each is controlled by one constant. One line changes when DNS is ready.
This is intentional pragmatism. The mdusl vine is bootstrap infrastructure.

---

## The five risks — stay aware

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

**Risk 4 — ES compatibility discipline.**
Every JS file must pass `es-check es2017` before commit.
These patterns silently black-screen on older Safari — never use them:
  ?.  optional chaining        → (a && a.b)
  ??  nullish coalescing        → (a || b)
  0n  BigInt literals           → rewrite without BigInt
  600_000  numeric separators   → 600000
  catch {}  bare catch          → catch(e) {}
  {...obj}  object spread       → Object.assign({}, obj)
Run es-check on the VPS before every push involving JS files.

**Risk 5 — Premature federation.**
The current system already has enough depth for years.
Federation multiplies complexity brutally. Nail one vine ecosystem first.
50-300 real humans, real friction, real recovery events, real forgotten
passwords. Reality teaches architecture better than theory.

---

## How to update passport — the build flow

Passport is modular source + separate-file deploy (JS and CSS stay separate).
This is the only correct way to make changes.

### The files

```
app/                          ← EDIT THESE
  passport.html               HTML screens + §4 onboarding + §5 unlock
                              + §6 home + §9 credentials + boot()
  passport.css                All visual styles
  passport.crypto.js          §1 crypto & identity (pure functions)
  passport.state.js           §2+§3 state, navigation, SYNC_ENDPOINT
  passport.ui.js              Shared UI: showToast, escHtmlP, isIOS
  passport.sync.js            §8 backup, sync, restore, reset
  passport.files.js           §7 vault file manager
  passport.clusters.js        §10a cluster lifecycle
  passport.invites.js         §10b invite generation & sharing
  passport.offers.js          §10c credential offer acceptance
  passport.boot.js            boot + onboarding handlers (extracted from html)
  build.cjs                   Assembler — copies all above next to the artifact

docs/                         ← NEVER EDIT DIRECTLY
  passport.html               Small index (generated by build.cjs)
  passport.css                Copied stylesheet
  passport.*.js               Copied scripts (one per source file)
```

### The deploy flow — every time

```bash
# 1. Edit the relevant source file(s) in app/

# 2. Run the ES compatibility check on any changed JS files
es-check es2017 passport.*.js

# 3. Assemble the deploy artifact (JS/CSS stay separate; index stays small)
cd /opt/spid/spid-github/app
node build.cjs

# 4. Commit source + built artifact together
git add [changed source files] ../docs/passport.html
git commit -m "..."
git push
```

### What build.cjs does

Reads `passport.html` and, for every local reference:
- `<link rel="stylesheet" href="passport.css">` → **copies** `passport.css` next to the artifact, keeps the `<link>`
- `<script src="passport.crypto.js"></script>` → **copies** the file, keeps the `<script src>`
- (and so on for every local script src tag)

Nothing is inlined. Output:
- `docs/passport.html` — the small index (~60KB, markup only)
- `docs/passport.css` + `docs/passport.*.js` — separate files, one per source

GitHub Pages serves these. Keeping JS/CSS as separate files keeps the index
small (total size matters — it leaves room for vault files). No external fonts,
no CDN.

### Adding a new feature file

1. Create `passport.newfeature.js` in `app/`
2. Add `<script src="passport.newfeature.js"></script>` to `passport.html`
   (before the main `<script>` block, after its dependencies)
3. Run `node build.cjs` — the new file is automatically inlined
4. No changes needed to `build.cjs`

### The ES2017 gate — non-negotiable

Before committing any JS change:
```bash
es-check es2017 passport.crypto.js passport.state.js \
  passport.ui.js passport.sync.js passport.files.js \
  passport.clusters.js passport.invites.js passport.offers.js
```
Zero errors = safe to commit.

---

## Honest gaps — visible, not hidden

| Gap | Impact | Plan |
|---|---|---|
| No test suite | Unsafe for external contribution | Start with passport.crypto.js |
| No OID4VCI | Not interoperable with other wallets | Long-term roadmap |
| Passkeys not implemented | Vision says passkeys, code uses passwords | Roadmap |
| Sync on mdusl (temporary) | Wrong domain for the feature | DNS migration when ready |

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

2. **Test suite** — passport.crypto.js pure functions first
   Enables safe contribution and safe editing

3. **Change handle + Naming system**
   Low complexity, high belonging for communities

4. **Backup & sync maturation**
   sync.sovereign-passport.id migration

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
