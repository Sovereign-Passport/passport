# Contributing to Sovereign Passport

Thank you for your interest in contributing. This project exists because communities deserve infrastructure that serves them — not the other way around.

## Before You Start

Read the three canonical documents in order (Axis Mundi, Architecture, operational README). Understand the core principles. If you want to make a large change, open a Discussion first — architecture decisions here have cryptographic consequences that are hard to reverse.

## What We Need Most Right Now

- **Issuer service** — Node.js/Docker community credential issuer
- **PWA polish** — service worker, manifest, install flow
- **French translation** — Quebec context is core to this project
- **Community deployment docs** — how a village actually deploys this
- **Security review** — the crypto layer especially

## What We Will Not Accept

- External crypto library dependencies in the wallet (WebCrypto only)
- Telemetry, analytics, or any form of user tracking
- Blockchain dependencies
- Features that require a central server for basic wallet function

## Code Style

- Vanilla JS / ES modules — no framework, WebCrypto only
- Every new function needs a JSDoc comment
- Every new module needs tests where a test harness exists
- Do not claim a fixed test count; report what was actually run
- Current recovery bases may not include the old `app/src/tests/` pages

## Submitting

1. Fork the repo
2. Create a branch: `feat/your-feature` or `fix/your-fix`
3. Write tests for new code
4. Open a PR with a clear description of what and why

## Community

This project follows the [Contributor Covenant](https://www.contributor-covenant.org/) Code of Conduct. Be direct, be kind, be honest.

Built with care in Quebec, Canada.
