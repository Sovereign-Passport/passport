/*
 * PASSPORT — Sovereign Identity System
 * passport.crypto.js — §1 CRYPTO & IDENTITY
 *
 * The cryptographic foundation of the entire passport.
 * Pure functions only — no DOM, no appState, no side effects.
 *
 * Responsibilities:
 *   - Ed25519 keypair generation (the DID)
 *   - did:key derivation from public key
 *   - AES-256-GCM vault encryption / decryption
 *   - PBKDF2 key derivation from password
 *   - Ed25519 signing and verification
 *   - Backup payload encoding / decoding
 *
 * Dependencies: WebCrypto API (window.crypto.subtle) only.
 * Zero external libraries. Zero network calls.
 * Browser support: Chrome 100+, Firefox 100+, Safari 15.4+
 *
 * These functions are the best candidates for the test suite.
 * Start here: every function is pure and independently testable.
 */

// ─────────────────────────────────────────────────────────────────────────────
// CRYPTO — vault foundation (same as vault.js, inlined for single-file PWA)
// ─────────────────────────────────────────────────────────────────────────────

const PBKDF2_ITER = 600_000
const SALT_LEN = 32, IV_LEN = 12
const VAULT_VERSION = '1.0.0'
const ED25519_MC = new Uint8Array([0xed, 0x01])

const toB64   = b => btoa(String.fromCharCode(...new Uint8Array(b)))
  .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')
const fromB64 = s => {
  const p = s.replace(/-/g,'+').replace(/_/g,'/')
    .padEnd(s.length+(4-s.length%4)%4,'=')
  return Uint8Array.from(atob(p),c=>c.charCodeAt(0))
}
const toHex = b => Array.from(b).map(x=>x.toString(16).padStart(2,'0')).join('')
const enc   = s => new TextEncoder().encode(s)
const dec   = b => new TextDecoder().decode(b)

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 1 — CRYPTO & IDENTITY
// Ed25519 keypair generation, DID derivation (did:key), AES-256-GCM vault
// encryption, PBKDF2 key derivation. Pure functions — no DOM, no state.
// These are the best candidates for a future test suite.
// Dependencies: WebCrypto API only. No external libraries.
// ═════════════════════════════════════════════════════════════════════════════

function toBase58(bytes) {
  const A='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
  let n=BigInt('0x'+toHex(bytes)),r='',B=BigInt(58)
  while(n>0n){r=A[Number(n%B)]+r;n=n/B}
  for(const b of bytes){if(b!==0)break;r='1'+r}
  return r
}

async function generateIdentity() {
  const kp  = await crypto.subtle.generateKey({name:'Ed25519'},true,['sign','verify'])
  const raw = await crypto.subtle.exportKey('raw',kp.publicKey)
  const kb  = new Uint8Array(raw)
  const mk  = new Uint8Array(ED25519_MC.length+kb.length)
  mk.set(ED25519_MC); mk.set(kb,ED25519_MC.length)
  const did = 'did:key:z'+toBase58(mk)
  return {
    did, keypair: kp,
    publicJwk:  await crypto.subtle.exportKey('jwk',kp.publicKey),
    privateJwk: await crypto.subtle.exportKey('jwk',kp.privateKey),
  }
}

async function deriveVaultKey(password,salt) {
  const km = await crypto.subtle.importKey('raw',enc(password),'PBKDF2',false,['deriveKey'])
  return crypto.subtle.deriveKey(
    {name:'PBKDF2',salt,iterations:PBKDF2_ITER,hash:'SHA-256'},
    km, {name:'AES-GCM',length:256}, false, ['encrypt','decrypt']
  )
}

async function encryptVault(vaultKey,plaintext) {
  const iv  = crypto.getRandomValues(new Uint8Array(IV_LEN))
  const buf = await crypto.subtle.encrypt({name:'AES-GCM',iv},vaultKey,enc(plaintext))
  return {iv:toB64(iv), ciphertext:toB64(new Uint8Array(buf))}
}

async function decryptVault(vaultKey,iv,ciphertext) {
  const buf = await crypto.subtle.decrypt(
    {name:'AES-GCM',iv:fromB64(iv)},vaultKey,fromB64(ciphertext))
  return dec(new Uint8Array(buf))
}

async function createVault(password,handle) {
  const id   = await generateIdentity()
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN))
  const vk   = await deriveVaultKey(password,salt)
  const n    = new Date().toISOString()

  const welcomeContent = `# Welcome to your Passport
### Sovereign Passport — your identity, in your pocket.

---

## A few things worth knowing first

This app lives on your phone.
Not on a server. Not in a cloud. On your phone.

Everything here — your identity, your files, your community memberships —
is encrypted and stored only on this device.

No company holds your data.
No account was created anywhere.
You are the only one with the key.

---

## Start with the basics

**Add this app to your home screen.**
Tap the share button in your browser, then "Add to Home Screen."
It opens like any other app — no app store, no install, no waiting.

**Download your backup right away.**
Settings → Download Backup.
Save that .passport file somewhere safe — another device, a USB key,
a trusted person's cloud.

If you lose your phone and have no backup, your passport is gone.
It takes thirty seconds. Do it now.

**Need to move to another device quickly?**
Settings → Sync to another device.
A link and QR code appear — valid for 15 minutes.
Scan on the other device, enter your password, done.
The sovereign way is still to download and transfer the file yourself.
The sync relay is a convenience, not a dependency.

**Your password is your key.**
There is no "forgot password."
No one can reset it for you — not even us.
Write it somewhere. Protect it like a house key.

---

## Why use a Passport?

Because your identity should belong to you.

Not to a platform that can ban you.
Not to a company that sells your habits.
Not to a service that disappears when the funding runs out.

Your Passport is a small mathematical proof that you are you.
It works anywhere SPID runs.
It travels with you.
It answers to no one but you.

---

## Invite your friends. Start a cluster.

A cluster is your gathering — your family, your friends,
your chess group, your garden collective, your neighbourhood.

Create one from My Clusters on the home screen.
Give it a name and a short description.
These are permanent — they appear on every member's credential.
Choose a name that will make sense over time.

Invite someone with a single link.
They tap it, create their own Passport, and they are in.

No forms. No approvals. No middleman.
Just you, vouching for someone you know.

Every invitation is a small act of trust.
The community remembers who brought whom — not to judge,
but because that is how real communities actually work.

You can soft-leave a cluster and rejoin later.
Deleting a cluster is fine — members keep their credentials
as a personal record. Just don't do it too often,
as the cluster resides on each grape as their own.

---

## Your vault files

Anything you want close and safe — text notes, photos, documents.

Files can be private (yours alone) or shared (intent to share
with cluster members). Toggle between them with the visibility
button on each file row. Delete files you no longer need.
welcome.txt is protected and stays.

Export your backup, restore it on another phone or your laptop,
and your files come with you.

Note: shared files express your intent to share.
Direct transfer between grapes is not yet implemented.

---

## Your credentials

Credentials are issued by communities you join.
They live in your vault — the community never tracks when you use them.
The issuer signs and forgets. You hold. You present only what you choose.

Your FounderCredential records every cluster you founded.
It is internal — it cannot be copied or presented.
Your MembershipCredentials can be copied and shown to verifiers.

---

## What is coming

**Cluster calendar** — post events, confirm attendance,
keep your community's rhythm without surrendering it to big tech.

**AI agent** — a quiet helper that knows your community,
your files, your context. Never decides for you.
Always assists. Always yours.

**Vine network** — when your cluster is ready to grow,
officialize it, join the network, and federate with other communities.
Your passport works everywhere.

**File sharing** — direct transfer between grapes in a cluster.
Coming when the transport layer is ready.

**Naming** — rename Grape, Cluster, Vine to whatever fits
your community's world. A chess club. A village. A guild.

---

## This is just the beginning

Your data. Your peace of mind. Your world.
With a little help from people you trust —
and, gently, from AI that works for you.

No rush. No pressure. Explore at your own pace.

The community is here when you are ready.

---

## Questions?

Ask someone in your cluster first.
That is what communities are for.

If you are at Maison du Soleil Levant,
the vine admin is JF — find him in Saint-Léon-de-Standon, Quebec.

---

*Your identity. Your vault. Your community.*
*Salted. Signed. Alive.*

Built in Saint-Léon-de-Standon, Quebec, Canada.
© 2026 JF Bertrand — Sovereign Passport ID
🍇`

  const vault = {
    version: VAULT_VERSION,
    identity: {
      id:id.did, handle, avatar:null,
      profile:{name:null,bio:null,email:null},
      location:null, virtual:true, created_at:n, updated_at:null,
    },
    keys: {publicKey:id.publicJwk, privateKey:id.privateJwk},
    credentials:[], keychain:[], sessions:[],
    files: [{
      name:       'welcome.txt',
      path:       'welcome.txt',
      mime:       'text/plain',
      visibility: 'private',
      date:       new Date().toLocaleDateString('en-CA'),
      size:       `${Math.round(new TextEncoder().encode(welcomeContent).length / 1024 * 10) / 10}kb`,
      content:    welcomeContent,
    }, {
      name:       'welcome.txt',
      path:       'welcome.txt',
      mime:       'text/plain',
      visibility: 'shared',
      date:       new Date().toLocaleDateString('en-CA'),
      size:       `${Math.round(new TextEncoder().encode(welcomeContent).length / 1024 * 10) / 10}kb`,
      content:    welcomeContent,
    }],
    memberships:[], ownClusters:[], referrals_sent:[], referrals_received:[],
    created_at:n, updated_at:null,
  }
  const {iv,ciphertext} = await encryptVault(vk,JSON.stringify(vault))
  return {salt:toB64(salt),iv,ciphertext,did:id.did,created_at:n}
}

async function unlockVault(password,salt,iv,ciphertext) {
  const vk = await deriveVaultKey(password,fromB64(salt))
  let pt
  try { pt = await decryptVault(vk,iv,ciphertext) }
  catch { const e=new Error('WRONG_PASSWORD'); e.code='WRONG_PASSWORD'; throw e }
  return {vault:JSON.parse(pt),vaultKey:vk}
}

async function saveVault(vaultKey,vault,salt) {
  vault.updated_at = new Date().toISOString()
  const {iv,ciphertext} = await encryptVault(vaultKey,JSON.stringify(vault))
  return {salt,iv,ciphertext,did:vault.identity.id,
    created_at:vault.created_at,updated_at:vault.updated_at}
}

// IndexedDB
const DB = 'passport', STORE = 'vault'
function openDB() {
  return new Promise((res,rej) => {
    const r = indexedDB.open(DB,1)
    r.onupgradeneeded = e => {
      if(!e.target.result.objectStoreNames.contains(STORE))
        e.target.result.createObjectStore(STORE,{keyPath:'key'})
    }
    r.onsuccess = e => res(e.target.result)
    r.onerror   = e => rej(e.target.error)
  })
}
async function persist(payload) {
  const db = await openDB()
  return new Promise((res,rej)=>{
    const tx=db.transaction(STORE,'readwrite')
    tx.objectStore(STORE).put({key:'current',...payload})
    tx.oncomplete=res; tx.onerror=e=>rej(e.target.error)
  })
}
async function loadStored() {
  const db = await openDB()
  return new Promise((res,rej)=>{
    const tx=db.transaction(STORE,'readonly')
    const r=tx.objectStore(STORE).get('current')
    r.onsuccess=e=>res(e.target.result??null)
    r.onerror=e=>rej(e.target.error)
  })
}
async function clearStored() {
  const db = await openDB()
  return new Promise((res,rej)=>{
    const tx=db.transaction(STORE,'readwrite')
    tx.objectStore(STORE).delete('current')
    tx.oncomplete=res; tx.onerror=e=>rej(e.target.error)
  })
}

// Backup export/import
function exportBackup(payload) {
  const data = {format:'passport-vault',version:VAULT_VERSION,
    exported_at:new Date().toISOString(),payload}
  return new Blob([JSON.stringify(data,null,2)],{type:'application/x-passport-vault'})
}
async function importBackup(file) {
  const text = await file.text()
  let parsed
  try { parsed = JSON.parse(text) } catch { throw Object.assign(new Error('INVALID_BACKUP'),{code:'INVALID_BACKUP'}) }
  if(parsed.format!=='passport-vault'||!parsed.payload)
    throw Object.assign(new Error('INVALID_BACKUP'),{code:'INVALID_BACKUP'})
  return parsed.payload
}

