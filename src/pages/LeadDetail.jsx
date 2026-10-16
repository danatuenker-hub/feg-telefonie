import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useProfiles } from '../lib/useProfiles'
import { STATUSES, appointmentStatusLabel, outcomeLabel, statusLabel, stateFromZip } from '../lib/constants'
import { formatPhone, normalizePhone } from '../lib/phone'
import { fmtDate, fmtDateTime, fmtDuration } from '../lib/format'
import OutcomeForm from '../components/OutcomeForm'
import AvailabilityOverview from '../components/AvailabilityOverview'
import { usePhone } from '../lib/telephony'

const FIELDS = [
  ['company', 'Firma'], ['phone', 'Telefon'], ['phone2', 'Telefon 2'], ['email', 'E-Mail'],
  ['website', 'Website'], ['street', 'Straße'], ['zip', 'PLZ'], ['city', 'Ort'], ['state', 'Bundesland'],
  ['industry', 'Branche'], ['current_supplier', 'Aktueller Versorger'], ['contract_end', 'Vertragsende'],
]

export default function LeadDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile, isAdmin } = useAuth()
  const profiles = useProfiles()
  const [lead, setLead] = useState(null)
  const [contacts, setContacts] = useState([])
  const [notes, setNotes] = useState([])
  const [calls, setCalls] = useState([])
  const [followups, setFollowups] = useState([])
  const [appointments, setAppointments] = useState([])
  const [notFound, setNotFound] = useState(false)
  const [editing, setEditing] = useState(false)
  const [preset, setPreset] = useState(null)
  const phone = usePhone()

  const load = useCallback(async () => {
    const [l, c, n, k, f] = await Promise.all([
      supabase.from('leads').select('*').eq('id', id).maybeSingle(),
      supabase.from('contacts').select('*').eq('lead_id', id).order('created_at'),
      supabase.from('notes').select('*').eq('lead_id', id).order('created_at', { ascending: false }),
      supabase.from('calls').select('*').eq('lead_id', id).order('started_at', { ascending: false }),
      supabase.from('followups').select('*').eq('lead_id', id).is('done_at', null).order('due_at'),
    ])
    if (!l.data) return setNotFound(true)
    supabase.from('appointments').select('id, starts_at, kind, status, berater_id').eq('lead_id', id)
      .order('starts_at', { ascending: false }).then(({ data }) => setAppointments(data ?? []))
    setLead(l.data)
    setContacts(c.data ?? [])
    setNotes(n.data ?? [])
    setCalls(k.data ?? [])
    setFollowups(f.data ?? [])
  }, [id])

  useEffect(() => { load() }, [load])

  // Nach Gesprächsende Verlauf neu laden (Dauer, Status)
  const callState = phone.call?.lead?.id === id ? phone.call.state : null
  useEffect(() => { if (callState === 'ended') setTimeout(load, 1500) }, [callState, load])

  if (notFound) return <p>Lead nicht gefunden oder nicht zugewiesen. <a href="/leads">Zur Liste</a></p>
  if (!lead) return <p className="muted">Lädt…</p>

  const nameOf = (uid) => profiles.find((p) => p.id === uid)?.name ?? '–'
  const timeline = [
    ...calls.map((c) => ({ type: 'call', at: c.started_at, data: c })),
    ...notes.map((n) => ({ type: 'note', at: n.created_at, data: n })),
  ].sort((a, b) => new Date(b.at) - new Date(a.at))

  async function update(patch) {
    const { data, error } = await supabase.from('leads').update(patch).eq('id', id).select().single()
    if (error) return alert('Fehler: ' + error.message)
    setLead(data)
  }

  async function remove() {
    if (!confirm(`Lead „${lead.company}“ endgültig löschen?`)) return
    const { error } = await supabase.from('leads').delete().eq('id', id)
    if (error) return alert(error.message)
    navigate('/leads')
  }

  return (
    <>
      <div className="row spread">
        <div>
          <button className="link" onClick={() => navigate(-1)}>‹ Zurück</button>
          <h1 style={{ marginTop: 6 }}>{lead.company} <span className={`badge ${lead.status}`}>{statusLabel(lead.status)}</span></h1>
        </div>
        <div className="row">
          <select value={lead.status} onChange={(e) => update({ status: e.target.value })} style={{ width: 'auto' }}>
            {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          {isAdmin && (
            <select value={lead.assigned_to ?? ''} onChange={(e) => update({ assigned_to: e.target.value || null })} style={{ width: 'auto' }}>
              <option value="">– nicht zugewiesen –</option>
              {profiles.filter((p) => p.active && p.role !== 'berater').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          {isAdmin && <button className="danger" onClick={remove}>Löschen</button>}
        </div>
      </div>

      <div className="cols">
        <div>
          <div className="panel">
            <div className="row spread">
              <h2>Firmendaten</h2>
              <button className="link" onClick={() => setEditing(!editing)}>{editing ? 'Abbrechen' : 'Bearbeiten'}</button>
            </div>
            {editing
              ? <LeadEditForm lead={lead} onSave={async (p) => { await update(p); setEditing(false) }} />
              : (
                <dl className="kv">
                  {FIELDS.map(([k, label]) => (
                    <FieldView key={k} k={k} label={label} value={lead[k]} />
                  ))}
                  <dt>Anrufversuche</dt><dd>{lead.call_count}</dd>
                  <dt>Letzter Anruf</dt><dd>{fmtDateTime(lead.last_call_at)} {lead.last_outcome && `· ${outcomeLabel(lead.last_outcome)}`}</dd>
                </dl>
              )}
          </div>

          <details className="panel" open>
            <summary style={{ cursor: 'pointer' }}><strong>Freie Beratertermine</strong> <span className="muted small">– Klick auf eine Zeit legt den Termin an</span></summary>
            <div style={{ marginTop: 10 }}>
              <AvailabilityOverview zip={lead.zip} compact onPick={(berater_id, starts_at) => setPreset({ berater_id, starts_at, at: Date.now() })} />
            </div>
          </details>

          <Contacts leadId={id} contacts={contacts} onChange={load} userId={profile.id} />

          <div className="panel">
            <h2>Verlauf</h2>
            <NoteForm leadId={id} userId={profile.id} onSaved={load} />
            <div style={{ marginTop: 14 }}>
              {timeline.length === 0 && <p className="muted">Noch keine Anrufe oder Notizen.</p>}
              {timeline.map((t) => t.type === 'call' ? (
                <div key={'c' + t.data.id} className="timeline-item call">
                  <div className="small muted">{fmtDateTime(t.at)} · {nameOf(t.data.user_id)}</div>
                  <div>
                    📞 {t.data.direction === 'inbound' ? (t.data.missed ? 'Verpasster Rückruf' : 'Eingehender Anruf') : 'Anruf'}
                    {t.data.outcome && <> – <strong>{outcomeLabel(t.data.outcome)}</strong></>}
                    {t.data.duration_sec > 0 && <span className="muted"> · {fmtDuration(t.data.duration_sec)}</span>}
                  </div>
                  {t.data.recording_url && <Recording path={t.data.recording_url} />}
                  {t.data.transcript && (
                    <details><summary className="small">Transkript</summary><pre>{t.data.transcript}</pre></details>
                  )}
                </div>
              ) : (
                <div key={'n' + t.data.id} className="timeline-item note">
                  <div className="small muted">{fmtDateTime(t.at)} · {nameOf(t.data.user_id)}</div>
                  <pre>{t.data.body}</pre>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div>
          <div className="panel">
            <h2>Anrufen</h2>
            <CallButtons lead={lead} contacts={contacts} />
            {phone.call?.lead?.id === id && phone.call.callId && !phone.call.saved ? (
              <>
                <p className="small muted">Ergebnis und Notiz können schon während des Gesprächs eingetragen werden.</p>
                <OutcomeForm key={phone.call.callId} lead={lead} contacts={contacts} callId={phone.call.callId} preset={preset}
                  onSaved={() => { phone.clearCall(); load() }} />
              </>
            ) : (
              <details open={phone.status !== 'ready' || !!preset}>
                <summary className="small muted" style={{ cursor: 'pointer', marginBottom: 8 }}>Anruf manuell erfassen (z. B. vom Handy)</summary>
                <OutcomeForm key={contacts.length} lead={lead} contacts={contacts} manual submitLabel="Anruf erfassen" onSaved={() => { setPreset(null); load() }} preset={preset} />
              </details>
            )}
          </div>

          {appointments.length > 0 && (
            <div className="panel">
              <h2>Termine</h2>
              {appointments.map((a) => (
                <Link key={a.id} to={`/termine/${a.id}`} className="row spread" style={{ padding: '4px 0', color: 'inherit' }}>
                  <span>{a.kind === 'telefon' ? '📞' : '📍'} {fmtDateTime(a.starts_at)} · {nameOf(a.berater_id)}</span>
                  <span className={`badge ${a.status}`}>{appointmentStatusLabel(a.status)}</span>
                </Link>
              ))}
            </div>
          )}

          <div className="panel">
            <h2>Offene Wiedervorlagen</h2>
            {followups.length === 0 && <p className="muted">Keine.</p>}
            {followups.map((f) => (
              <div key={f.id} className="row spread" style={{ marginBottom: 6 }}>
                <span className={new Date(f.due_at) <= new Date() ? 'badge due' : 'badge'}>{fmtDateTime(f.due_at)}</span>
                <button className="link small" onClick={async () => {
                  await supabase.from('followups').update({ done_at: new Date().toISOString() }).eq('id', f.id)
                  load()
                }}>erledigt</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

function Recording({ path }) {
  const [url, setUrl] = useState(null)
  if (url) return <audio controls autoPlay src={url} style={{ marginTop: 6, width: '100%' }} />
  return (
    <button className="link small" onClick={async () => {
      const { data, error } = await supabase.storage.from('recordings').createSignedUrl(path, 3600)
      if (error) return alert('Aufnahme nicht verfügbar: ' + error.message)
      setUrl(data.signedUrl)
    }}>▶ Aufnahme anhören</button>
  )
}

function CallButtons({ lead, contacts }) {
  const phone = usePhone()
  const [error, setError] = useState('')
  const busy = phone.call && phone.call.state !== 'ended'
  const numbers = [
    { label: 'Zentrale', number: lead.phone },
    lead.phone2 && { label: 'Telefon 2', number: lead.phone2 },
    ...contacts.filter((c) => c.phone?.startsWith('+')).map((c) => ({ label: c.name, number: c.phone })),
  ].filter(Boolean)

  async function call(number) {
    setError('')
    try { await phone.dial(lead, number) } catch (e) { setError(e.message) }
  }

  if (lead.status === 'gesperrt') return <p className="error">Gesperrt – nicht anrufen.</p>
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="row">
        {numbers.map((n) => phone.status === 'ready' ? (
          <button key={n.label + n.number} className="call" disabled={busy} onClick={() => call(n.number)}>
            📞 {n.label}: {formatPhone(n.number)}
          </button>
        ) : (
          <a key={n.label + n.number} className="btn" href={`tel:${n.number}`}>📞 {n.label}: {formatPhone(n.number)}</a>
        ))}
      </div>
      {phone.status !== 'ready' && (
        <p className="small muted">Browser-Telefonie {phone.status === 'offline' ? 'verbindet…' : `nicht verfügbar${phone.error ? ` (${phone.error})` : ''}`}.</p>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  )
}

function FieldView({ k, label, value }) {
  let content = value || '–'
  if (value && (k === 'phone' || k === 'phone2')) content = <a href={`tel:${value}`}>{formatPhone(value)}</a>
  if (value && k === 'email') content = <a href={`mailto:${value}`}>{value}</a>
  if (value && k === 'website') content = <a href={/^https?:/.test(value) ? value : `https://${value}`} target="_blank" rel="noreferrer">{value}</a>
  if (k === 'contract_end') content = fmtDate(value)
  return <><dt>{label}</dt><dd>{content}</dd></>
}

function LeadEditForm({ lead, onSave }) {
  const [form, setForm] = useState(() => Object.fromEntries(FIELDS.map(([k]) => [k, lead[k] ?? ''])))
  const [error, setError] = useState('')

  function submit(e) {
    e.preventDefault()
    const phone = normalizePhone(form.phone)
    if (!form.company.trim()) return setError('Firma fehlt.')
    if (!phone) return setError('Telefonnummer ist ungültig.')
    const phone2 = form.phone2 ? normalizePhone(form.phone2) : null
    if (form.phone2 && !phone2) return setError('Telefon 2 ist ungültig.')
    const patch = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, typeof v === 'string' ? v.trim() || null : v]))
    patch.phone = phone
    patch.phone2 = phone2
    if (!patch.state) patch.state = stateFromZip(patch.zip)
    onSave(patch)
  }

  return (
    <form className="grid grid-2" onSubmit={submit}>
      {FIELDS.map(([k, label]) => (
        <div key={k}>
          <label>{label}</label>
          <input type={k === 'contract_end' ? 'date' : 'text'} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
        </div>
      ))}
      {error && <div className="error">{error}</div>}
      <div><button className="primary">Speichern</button></div>
    </form>
  )
}

function Contacts({ leadId, contacts, onChange, userId }) {
  const empty = { name: '', position: '', phone: '', email: '' }
  const [form, setForm] = useState(null)

  async function save(e) {
    e.preventDefault()
    if (!form.name.trim()) return
    const row = {
      name: form.name.trim(), position: form.position.trim() || null,
      phone: form.phone ? normalizePhone(form.phone) ?? form.phone.trim() : null, email: form.email.trim() || null,
    }
    const { error } = form.id
      ? await supabase.from('contacts').update(row).eq('id', form.id)
      : await supabase.from('contacts').insert({ ...row, lead_id: leadId, created_by: userId })
    if (error) return alert(error.message)
    setForm(null)
    onChange()
  }

  async function remove(c) {
    if (!confirm(`Ansprechpartner „${c.name}“ löschen?`)) return
    await supabase.from('contacts').delete().eq('id', c.id)
    onChange()
  }

  return (
    <div className="panel">
      <div className="row spread">
        <h2>Ansprechpartner</h2>
        {!form && <button className="link" onClick={() => setForm(empty)}>+ Hinzufügen</button>}
      </div>
      {contacts.length === 0 && !form && <p className="muted">Noch keine Ansprechpartner.</p>}
      {contacts.map((c) => (
        <div key={c.id} className="row spread" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
          <div>
            <strong>{c.name}</strong>{c.position && <span className="muted"> · {c.position}</span>}
            <div className="small">
              {c.phone && <a href={`tel:${c.phone}`}>{formatPhone(c.phone)}</a>}
              {c.phone && c.email && ' · '}
              {c.email && <a href={`mailto:${c.email}`}>{c.email}</a>}
            </div>
          </div>
          <div className="row">
            <button className="link small" onClick={() => setForm({ ...empty, ...c, phone: c.phone ?? '', email: c.email ?? '', position: c.position ?? '' })}>bearbeiten</button>
            <button className="link small" style={{ color: 'var(--danger)' }} onClick={() => remove(c)}>löschen</button>
          </div>
        </div>
      ))}
      {form && (
        <form className="grid grid-2" onSubmit={save} style={{ marginTop: 10 }}>
          <div><label>Name *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></div>
          <div><label>Position</label><input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} /></div>
          <div><label>Telefon / Durchwahl</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><label>E-Mail</label><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div className="row"><button className="primary">Speichern</button><button type="button" onClick={() => setForm(null)}>Abbrechen</button></div>
        </form>
      )}
    </div>
  )
}

function NoteForm({ leadId, userId, onSaved }) {
  const [body, setBody] = useState('')
  async function save(e) {
    e.preventDefault()
    if (!body.trim()) return
    const { error } = await supabase.from('notes').insert({ lead_id: leadId, user_id: userId, body: body.trim() })
    if (error) return alert(error.message)
    setBody('')
    onSaved()
  }
  return (
    <form onSubmit={save} className="grid">
      <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Notiz hinzufügen…" style={{ minHeight: 50 }} />
      <div><button disabled={!body.trim()}>Notiz speichern</button></div>
    </form>
  )
}
