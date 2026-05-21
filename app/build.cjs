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
const DIST_DIR = path.join(__dirname, 'dist')
const SRC_FILE = path.join(SRC_DIR,  'passport.html')
const OUT_FILE = path.join(DIST_DIR, 'passport.html')

function build() {
  const start = Date.now()

  if (!fs.existsSync(DIST_DIR)) fs.mkdirSync(DIST_DIR)

  let html = fs.readFileSync(SRC_FILE, 'utf8')

  let cssInlined  = 0
  let jsInlined   = 0
  let totalBytes  = 0

  // ── Inline CSS <link rel="stylesheet" href="..."> ──────────────
  html = html.replace(
    /<link\s+rel="stylesheet"\s+href="([^"]+)"\s*>/g,
    (match, href) => {
      if (href.startsWith('http') || href.startsWith('//')) return match
      const cssPath = path.join(SRC_DIR, href)
      if (!fs.existsSync(cssPath)) {
        console.warn(`  ⚠ CSS not found: ${href}`)
        return match
      }
      const css = fs.readFileSync(cssPath, 'utf8')
      totalBytes += css.length
      cssInlined++
      return `<style>\n${css}\n</style>`
    }
  )

  // ── Inline JS <script src="..."></script> ──────────────────────
  html = html.replace(
    /<script\s+src="([^"]+)"><\/script>/g,
    (match, src) => {
      if (src.startsWith('http') || src.startsWith('//')) return match
      const jsPath = path.join(SRC_DIR, src)
      if (!fs.existsSync(jsPath)) {
        console.warn(`  ⚠ JS not found: ${src}`)
        return match
      }
      const js = fs.readFileSync(jsPath, 'utf8')
      totalBytes += js.length
      jsInlined++
      return `<script>\n/* ${src} */\n${js}\n</script>`
    }
  )

  fs.writeFileSync(OUT_FILE, html, 'utf8')

  const outSize  = fs.statSync(OUT_FILE).size
  const elapsed  = Date.now() - start

  console.log(`\n✓ Built dist/passport.html`)
  console.log(`  CSS inlined:  ${cssInlined} file(s)`)
  console.log(`  JS inlined:   ${jsInlined} file(s)`)
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
    'passport.crypto.js', 'passport.state.js', 'passport.qr.js',
    'passport.ui.js', 'passport.sync.js', 'passport.files.js',
    'passport.clusters.js', 'passport.invites.js', 'passport.offers.js',
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
