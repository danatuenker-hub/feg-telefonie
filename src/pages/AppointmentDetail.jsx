import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { APPOINTMENT_STATUSES, appointmentStatusLabel } from '../lib/constants'
import { fmtDate, fmtDateTime } from '../lib/format'
import { formatPhone } from '../lib/phone'
import { notifyAppointment } from '../lib/notify'
import { toast } from '../lib/toast'
import AppointmentFields, { appointmentRow, validateAppointment } from '../components/AppointmentFields'

const fmtRange = (a) =>
  `${new Date(a.starts_at).toLocaleString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}–${new Date(a.ends_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`

export default function AppointmentDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile, isAdmin } = useAuth()
  const [a, setA] = useState(null)
  const [lead, setLead] = useState(null)
  const [contacts, setContacts] = useState([])
  const [notes, setNotes] = useState([])
  const [call, setCall] = useState(null)
  const [people, setPeople] = useState([])
  const [missing, setMissing] = useState(false)
  const [editing, setEditing] = useState(null)

  const load = useCallback(async () => {
    const { data } = await supabase.from('appointments').select('*').eq('id', id).maybeSingle()
    if (!data) return setMissing(true)
    setA(data)
    const [l, c, n, k, p] = await Promise.all([
      data.lead_id ? supabase.from('leads').select('*').eq('id', data.lead_id).maybeSingle() : { data: null },
      data.lead_id ? supabase.from('contacts').select('*').eq('lead_id', data.lead_id) : { data: [] },
      data.lead_id ? supabase.from('notes').select('*').eq('lead_id', data.lead_id).order('created_at', { ascending: false }).limit(20) : { data: [] },
      data.call_id ? supabase.from('calls').select('id, recording_url, duration_sec, started_at').eq('id', data.call_id).maybeSingle() : { data: null },
      supabase.from('profiles').select('id, name, role'),
    ])
    setLead(l.data); setContacts(c.data ?? []); setNotes(n.data ?? []); setCall(k.data); setPeople(p.data ?? [])
  }, [id])

  useEffect(() => { load() }, [load])

  if (missing) return <p>Termin nicht gefunden oder kein Zugriff. <Link to="/termine">Zur Übersicht</Link></p>
  if (!a) return <p className="muted">Lädt…</p>

  const nameOf = (uid) => people.find((p) => p.id === uid)?.name ?? '–'
  const canEdit = isAdmin || a.created_by === profile.id
  const isBerater = a.berater_id === profile.id
  const address = [a.street, [a.zip, a.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')

  async function saveEdit() {
    const problem = validateAppointment(editing)
    if (problem) return alert(problem)
    const row = appointmentRow(editing, { id: a.lead_id, company: a.company })
    const { error } = await supabase.from('appointments').update(row).eq('id', a.id)
    if (error) return alert(error.message)
    const res = await notifyAppointment(a.id, row.berater_id !== a.berater_id ? 'created' : 'updated')
    toast(res.sent ? 'Gespeichert – Berater informiert.' : `Gespeichert. Keine Telegram-Nachricht: ${res.reason}`, res.sent ? 'ok' : 'warn')
    setEditing(null)
    load()
  }

  async function remove() {
    if (!confirm('Termin endgültig löschen? (Besser: Status „Abgesagt“ setzen.)')) return
    await supabase.from('appointments').delete().eq('id', a.id)
    navigate('/termine')
  }

  return (
    <>
      <button className="link" onClick={() => navigate(-1)}>‹ Zurück</button>
      <div className="row spread" style={{ marginTop: 6 }}>
        <h1>{a.kind === 'telefon' ? '📞' : '📍'} {a.company} <span className={`badge ${a.status}`}>{appointmentStatusLabel(a.status)}</span></h1>
        {canEdit && !editing && (
          <div className="row">
            <button onClick={() => setEditing(toForm(a))}>Bearbeiten / verlegen</button>
            {isAdmin && <button className="danger" onClick={remove}>Löschen</button>}
          </div>
        )}
      </div>

      {editing ? (
        <div className="panel grid">
          <AppointmentFields lead={lead ?? { id: a.lead_id, company: a.company, zip: a.zip }} contacts={contacts} value={editing} onChange={setEditing} />
          <div className="row"><button className="primary" onClick={saveEdit}>Speichern &amp; Berater informieren</button><button onClick={() => setEditing(null)}>Abbrechen</button></div>
        </div>
      ) : (
        <div className="cols">
          <div>
            <div className="panel">
              <h2>Termin</h2>
              <dl className="kv">
                <dt>Wann</dt><dd><strong>{fmtRange(a)}</strong></dd>
                <dt>Art</dt><dd>{a.kind === 'telefon' ? 'Telefontermin' : 'Vor Ort'}</dd>
                <dt>Berater</dt><dd>{nameOf(a.berater_id)}</dd>
                {address && <><dt>Adresse</dt><dd><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`} target="_blank" rel="noreferrer">{address}</a></dd></>}
                <dt>Ansprechpartner</dt><dd>{a.contact_name || '–'}</dd>
                <dt>Telefon</dt><dd>{a.contact_phone ? <a href={`tel:${a.contact_phone}`}>{a.contact_phone}</a> : '–'}</dd>
                <dt>Strom</dt><dd>{a.power_kwh ? `${a.power_kwh.toLocaleString('de-DE')} kWh/Jahr` : '–'}</dd>
                <dt>Gas</dt><dd>{a.gas_kwh ? `${a.gas_kwh.toLocaleString('de-DE')} kWh/Jahr` : '–'}</dd>
                <dt>Lieferstellen</dt><dd>{a.sites ?? '–'}</dd>
                <dt>Versorger</dt><dd>{a.current_supplier || '–'}</dd>
                <dt>Vertragsende</dt><dd>{fmtDate(a.contract_end)}</dd>
                <dt>Gelegt von</dt><dd>{nameOf(a.created_by)} am {fmtDateTime(a.created_at)}</dd>
                <dt>Telegram</dt><dd>{a.notified_at ? `gesendet ${fmtDateTime(a.notified_at)}` : 'nicht gesendet'}</dd>
              </dl>
              {a.notes && <><h2 style={{ marginTop: 16 }}>Infos vom Callcenter</h2><p style={{ whiteSpace: 'pre-wrap' }}>{a.notes}</p></>}
            </div>

            {(lead || contacts.length > 0) && (
              <div className="panel">
                <h2>Kunde</h2>
                {lead && (
                  <dl className="kv">
                    <dt>Firma</dt><dd>{isBerater ? lead.company : <Link to={`/leads/${lead.id}`}>{lead.company}</Link>}</dd>
                    <dt>Zentrale</dt><dd><a href={`tel:${lead.phone}`}>{formatPhone(lead.phone)}</a></dd>
                    {lead.email && <><dt>E-Mail</dt><dd><a href={`mailto:${lead.email}`}>{lead.email}</a></dd></>}
                    {lead.website && <><dt>Website</dt><dd><a href={/^https?:/.test(lead.website) ? lead.website : `https://${lead.website}`} target="_blank" rel="noreferrer">{lead.website}</a></dd></>}
                    {lead.industry && <><dt>Branche</dt><dd>{lead.industry}</dd></>}
                  </dl>
                )}
                {contacts.length > 0 && <h2 style={{ marginTop: 12 }}>Weitere Ansprechpartner</h2>}
                {contacts.map((c) => (
                  <div key={c.id} className="small" style={{ marginBottom: 4 }}>
                    <strong>{c.name}</strong>{c.position && ` · ${c.position}`}{c.phone && <> · <a href={`tel:${c.phone}`}>{formatPhone(c.phone) || c.phone}</a></>}{c.email && ` · ${c.email}`}
                  </div>
                ))}
              </div>
            )}

            {notes.length > 0 && (
              <div className="panel">
                <h2>Notizen zum Kunden</h2>
                {notes.map((n) => (
                  <div key={n.id} className="timeline-item note">
                    <div className="small muted">{fmtDateTime(n.created_at)} · {nameOf(n.user_id)}</div>
                    <pre>{n.body}</pre>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            {(isBerater || isAdmin) && <ResultForm a={a} onSaved={load} />}
            {call?.recording_url && (isAdmin || isBerater || a.created_by === profile.id) && (
              <div className="panel">
                <h2>Gesprächsaufnahme</h2>
                <p className="small muted">Gespräch vom {fmtDateTime(call.started_at)}, in dem der Termin gelegt wurde.</p>
                <RecordingPlayer path={call.recording_url} />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function toForm(a) {
  return {
    berater_id: a.berater_id, kind: a.kind, starts_at: a.starts_at,
    duration: Math.round((new Date(a.ends_at) - new Date(a.starts_at)) / 60000),
    contact_name: a.contact_name ?? '', contact_phone: a.contact_phone ?? '',
    street: a.street ?? '', zip: a.zip ?? '', city: a.city ?? '',
    power_kwh: a.power_kwh ?? '', gas_kwh: a.gas_kwh ?? '', sites: a.sites ?? '',
    current_supplier: a.current_supplier ?? '', contract_end: a.contract_end ?? '', notes: a.notes ?? '',
  }
}

// Status und Rückmeldung nach dem Termin (Berater oder Admin)
function ResultForm({ a, onSaved }) {
  const [status, setStatus] = useState(a.status)
  const [note, setNote] = useState(a.result_note ?? '')
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    const { error } = await supabase.from('appointments').update({ status, result_note: note.trim() || null }).eq('id', a.id)
    setBusy(false)
    if (error) return alert(error.message)
    if (status === 'abgesagt' && a.status !== 'abgesagt') await notifyAppointment(a.id, 'cancelled')
    toast('Gespeichert.')
    onSaved()
  }

  return (
    <div className="panel grid">
      <h2>Status &amp; Rückmeldung</h2>
      <div>
        <label>Status</label>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          {APPOINTMENT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>
      <div>
        <label>Rückmeldung (wie lief der Termin?)</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="z. B. Angebot erstellt, Entscheidung bis Freitag" />
      </div>
      <button className="primary" disabled={busy} onClick={save}>Speichern</button>
    </div>
  )
}

function RecordingPlayer({ path }) {
  const [url, setUrl] = useState(null)
  if (url) return <audio controls autoPlay src={url} style={{ width: '100%' }} />
  return (
    <button onClick={async () => {
      const { data, error } = await supabase.storage.from('recordings').createSignedUrl(path, 3600)
      if (error) return alert('Aufnahme nicht verfügbar: ' + error.message)
      setUrl(data.signedUrl)
    }}>▶ Aufnahme anhören</button>
  )
}
