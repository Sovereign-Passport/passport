# Sovereign Passport — Passport PWA

Operational README for the Passport repository. It does not define SPID
concepts or architecture.

## Canonical reading order

Paths are relative to `/opt/blindspot`.

1. `passport/app/axismundi.md` — why SPID exists, principles, vision.
2. `spid-js/docs/ARCHITECTURE.md` — SPID objects, identities, relations, Switchboard, data spaces.
3. `spid-js/README.md` — where and how to work.

Historical documents are in `passport/docs/archive/`. They are not instructions.

## Structure

```text
passport/
├── app/                 source files (edit here)
│   ├── passport.html
│   ├── passport.css
│   ├── passport.*.js
│   ├── spid.i18n.js
│   ├── manifest.json
│   └── build.cjs
├── docs/                deploy artifact (never edit manually)
│   └── passport.html + copied CSS/JS
├── images/
└── BRAND.md / CONTRIBUTING.md
```

## Build

```bash
cd /opt/blindspot/passport
node app/build.cjs
```

The build copies CSS and JS as separate files next to `docs/passport.html`.
It does not inline them.

### Build flow

1. Edit the relevant source file(s) in `app/`.
2. Check ES2017 compatibility on changed JS files (if `es-check` is available):

   ```bash
   cd /opt/blindspot/passport
   es-check es2017 app/passport.*.js
   ```

3. Build the artifact:

   ```bash
   node app/build.cjs
   ```

4. Commit source and the generated `docs/` files together.

No external fonts, no CDN. Keep JS and CSS as separate files; do not inline them.

## Local check

Open `app/passport.html` directly. The source links its sibling CSS/JS.

## Tests

There is no fixed test count. The current recovery base may not include the old
`app/src/tests/` pages. When test pages are present, open them in a browser and
run the relevant suite manually. Do not claim a number of tests that is not
measured.

## Deployment

`docs/` is the static artifact. Deployment is a separate action and requires
explicit approval. Do not deploy, move origin, or migrate a vault as part of a
code change.

## Identity and storage

Passport keys and vault are held locally, not in Git and not on the SPID server.
Backups are designed to restore across origins; this is a constitutional rule,
not an origin-bound exception. For canonical rules, read Axis Mundi and
Architecture; do not infer them from this operational file.
