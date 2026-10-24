/**
 * Passport — communicated feedback (shared feedback contract v1.0.1).
 * This is NOT the private personal marker. It is signed and sent to the Vine.
 */

function _fbContract() {
  return (window.SPIDRelations && window.SPIDRelations.feedback) || null
}

function _fbBase() {
  try { return new URL(SYNC_ENDPOINT).origin } catch (e) { return 'https://mdusl.sovereign-passport.id' }
}

function _fbSetStatus(text) {
  const el = document.getElementById('fb-status')
  if (!el) return
  if (!text) { el.style.display = 'none'; el.textContent = ''; return }
  el.textContent = text
  el.style.display = 'block'
}

function _fbSubject() {
  const C = _fbContract()
  if (!C) throw new Error('Contrat feedback indisponible.')
  const type = (document.getElementById('fb-subject-type') || {}).value
  const id   = ((document.getElementById('fb-subject-id') || {}).value || '').trim()
  return C.normalizeFeedbackSubject({ type: type, id: id })
}

function openFeedback() {
  goTo('screen-feedback')
  _fbSetStatus('')
  loadMyFeedback()
}

async function submitFeedback(value) {
  const C = _fbContract()
  if (!C) { _fbSetStatus('Contrat feedback indisponible.'); return }
  if (!appState.vault || !appState.vaultKey) { _fbSetStatus('Déverrouille le Passport.'); return }
  let subject
  try { subject = _fbSubject() }
  catch (e) { _fbSetStatus(e.message); return }

  const actor = appState.vault.identity.id
  const issued = new Date().toISOString()
  const payload = C.canonicalFeedbackPayload({
    subject: subject, author_did: actor, value: value,
    issued_at: issued, expires_at: null,
  })
  _fbSetStatus('Signature…')
  try {
    const key = await importPrivateKey(appState.vault.keys.privateKey)
    const signature = await edSign(key, JSON.stringify(payload))
    const r = await sbSelfCall(_fbBase(), 'relation', 'feedback/submit', {
      subject: subject,
      feedback: { value: value, issued_at: issued, expires_at: null, signature: signature },
    }, { type: 'did', id: actor })
    if (r.status !== 200 || !r.body || !r.body.ok) {
      throw new Error((r.body && (r.body.error || r.body.message)) || ('HTTP ' + r.status))
    }
    _fbSetStatus('Feedback enregistré ✓')
    loadMyFeedback()
  } catch (e) {
    _fbSetStatus('Refusé : ' + (e && e.message ? e.message : e))
  }
}

async function loadMyFeedback() {
  const list = document.getElementById('fb-list')
  if (!list) return
  list.innerHTML = ''
  let subject
  try { subject = _fbSubject() }
  catch (e) { return }
  if (!appState.vault || !appState.vaultKey) return
  const actor = appState.vault.identity.id
  try {
    const r = await sbSelfCall(_fbBase(), 'relation', 'feedback/mine',
      { subject: subject }, { type: 'did', id: actor })
    if (r.status !== 200 || !r.body || !Array.isArray(r.body.events)) return
    if (!r.body.events.length) {
      const p = document.createElement('p'); p.className = 'did-input'; p.textContent = 'Aucun feedback.'
      list.appendChild(p); return
    }
    r.body.events.forEach(function (e) {
      const row = document.createElement('div')
      row.style.cssText = 'display:flex;justify-content:space-between;gap:8px;align-items:center;padding:8px 0;'
      const left = document.createElement('div')
      const v = document.createElement('div'); v.textContent = e.value
      const d = document.createElement('div'); d.style.fontSize = '11px'; d.style.opacity = '0.7'
      d.textContent = String(e.issued_at || '') + (e.revoked_at ? ' · retiré' : '')
      left.appendChild(v); left.appendChild(d); row.appendChild(left)
      if (!e.revoked_at && e.id) {
        const b = document.createElement('button'); b.className = 'btn btn-ghost'; b.type = 'button'
        b.textContent = 'Retirer'
        b.addEventListener('click', function () { retractFeedback(e.id, subject) })
        row.appendChild(b)
      }
      list.appendChild(row)
    })
  } catch (e) { /* silent list failure */ }
}

async function retractFeedback(id, subject) {
  if (!appState.vault || !appState.vaultKey) return
  const actor = appState.vault.identity.id
  try {
    await sbSelfCall(_fbBase(), 'relation', 'feedback/retract',
      { subject: subject, id: id }, { type: 'did', id: actor })
    _fbSetStatus('Feedback retiré ✓')
    loadMyFeedback()
  } catch (e) {
    _fbSetStatus('Retrait impossible.')
  }
}
