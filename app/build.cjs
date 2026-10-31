#!/usr/bin/env node
/**
 * PASSPORT — Sovereign Identity System
 * build.js — Single-file assembler
 *
 * Reads passport.html (modular source) and produces passport.html (deploy artifact)
 * by inlining all <link rel="stylesheet"> and <script src="..."> references.
 *
 * Source:  passport.html + passport.*.js + passport.css
 * Output:  dist/passport.html — one sovereign file, zero external dependencies
 *
 * Usage:
 *   node build.js
 *   node build.js --watch   (rebuild on file change)
 *
 * No npm dependencies. Pure Node.js. Works offline.
 */

const fs   = require('fs')
const path = require('path')

const SRC_DIR  = path.join(__dirname)
const DIST_DIR = path.join(__dirname, '..', 'docs')
const SRC_FILE = path.join(SRC_DIR,  'passport.html')
const OUT_FILE = path.join(DIST_DIR, 'passport.html')

function build() {
  const start = Date.now()

  if (!fs.existsSync(DIST_DIR)) fs.mkdirSync(DIST_DIR)

  let html = fs.readFileSync(SRC_FILE, 'utf8')

  let cssCopied   = 0
  let jsCopied    = 0
  let totalBytes  = 0

  // ── CSS stays a SEPARATE file (never inlined into the artifact) ─
  // Copy every local stylesheet next to the artifact and KEEP its <link>.
  html = html.replace(
    /<link\s+rel="stylesheet"\s+href="([^"]+)"\s*>/g,
    (match, href) => {
      if (href.startsWith('http') || href.startsWith('//')) return match
      const cleanHref = href.split('?')[0].split('#')[0]
      const cssPath = path.join(SRC_DIR, cleanHref)
      if (!fs.existsSync(cssPath)) {
        console.warn(`  ⚠ CSS not found: ${href}`)
        return match
      }
      const css = fs.readFileSync(cssPath, 'utf8')
      fs.writeFileSync(path.join(DIST_DIR, path.basename(cleanHref)), css, 'utf8')
      totalBytes += css.length
      cssCopied++
      return match            // keep <link rel="stylesheet" href="passport.css">
    }
  )

  // ── JS stays a SEPARATE file (never inlined into the artifact) ─
  // Copy every local script next to the artifact and KEEP its <script src>.
  html = html.replace(
    /<script\s+src="([^"]+)"><\/script>/g,
    (match, src) => {
      if (src.startsWith('http') || src.startsWith('//')) return match
      const cleanSrc = src.split('?')[0].split('#')[0]
      const jsPath = path.join(SRC_DIR, cleanSrc)
      if (!fs.existsSync(jsPath)) {
        console.warn(`  ⚠ JS not found: ${src}`)
        return match
      }
      const js = fs.readFileSync(jsPath, 'utf8')
      fs.writeFileSync(path.join(DIST_DIR, path.basename(cleanSrc)), js, 'utf8')
      totalBytes += js.length
      jsCopied++
      return match            // keep <script src="passport.crypto.js"></script>
    }
  )

  fs.writeFileSync(OUT_FILE, html, 'utf8')

  const outSize  = fs.statSync(OUT_FILE).size
  const elapsed  = Date.now() - start

  console.log(`\n✓ Built docs/passport.html`)
  console.log(`  CSS (separate, copied): ${cssCopied} file(s)`)
  console.log(`  JS  (separate, copied): ${jsCopied} file(s)`)
  console.log(`  Output size:  ${(outSize / 1024).toFixed(1)} KB`)
  console.log(`  Built in:     ${elapsed}ms\n`)
}

// ── Watch mode ─────────────────────────────────────────────────────
const watchMode = process.argv.includes('--watch')

if (watchMode) {
  console.log('Watching for changes...')
  build()
  const watched = [
    'passport.html', 'passport.css',
    'passport.crypto.js', 'passport.state.js',
    'passport.ui.js', 'passport.sync.js', 'passport.files.js',
    'passport.clusters.js', 'passport.invites.js', 'passport.offers.js', 'passport.boot.js',
  ]
  watched.forEach(f => {
    const fp = path.join(SRC_DIR, f)
    if (fs.existsSync(fp)) {
      fs.watch(fp, () => {
        console.log(`Changed: ${f}`)
        build()
      })
    }
  })
} else {
  build()
}
