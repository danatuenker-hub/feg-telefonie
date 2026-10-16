import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { buildLeadQuery, filtersFromParams } from '../lib/leadQuery'
import { usePhone } from '../lib/telephony'
import { formatPhone } from '../lib/phone'
import { fmtDate, fmtDateTime } from '../lib/format'
import { outcomeLabel, statusLabel } from '../lib/constants'
import OutcomeForm from '../components/OutcomeForm'

const FINAL = ['termin', 'kein_interesse', 'bereits_kunde', 'ungueltig', 'gesperrt']

// Anrufliste aus den Filtern der Leadliste. Abgeschlossene Leads und Leads mit
// zukünftiger Wiedervorlage werden übersprungen; fällige Wiedervorlagen kommen zuerst.
async function loadQueue(filters) {
  const ids = []
  for (let from = 0; from < 5000; from += 1000) {
    let q = buildLeadQuery({ ...filters, sort: 'followup' }, { select: 'id, next_followup_at' })
    if (!filters.status) q = q.not('status', 'in', `(${FINAL.join(',')})`)
    const { data, error } = await q.range(from, from + 999)
    if (error) throw error
    const now = new Date()
    ids.push(...data.filter((r) => !r.next_followup_at || new Date(r.next_followup_at) <= now).map((r) => r.id))
    if (data.length < 1000) break
  }
  return ids
}

export default function Dialer() {
  const [params] = useSearchParams()
  const filters = useMemo(() => filtersFromParams(params), [params])
  const phone = usePhone()

  const [queue, setQueue] = useState(null)
  const [index, setIndex] = useState(0)
  const [lead, setLead] = useState(null)
  const [details, setDetails] = useState({ contacts: [], notes: [] })
  const [phase, setPhase] = useState('start') // start | calling | wrapup | paused | done
  const [paused, setPaused] = useState(false)
  const [error, setError] = useState('')
  const [stats, setStats] = useState({ calls: 0, saved: 0 })
  const savedDuringCall = useRef(false)

  useEffect(() => {
    loadQueue(filters).then(setQueue).catch((e) => setError(e.message))
  }, [filters])

  // Nächsten noch anrufbaren Lead ab Position i laden
  const loadLead = useCallback(async (i) => {
    for (let j = i; j < queue.length; j++) {
      const { data } = await supabase.from('leads').select('*').eq('id', queue[j]).maybeSingle()
      if (!data || FINAL.includes(data.status)) continue
      if (data.next_followup_at && new Date(data.next_followup_at) > new Date()) continue
      const [c, n] = await Promise.all([
        supabase.from('contacts').select('*').eq('lead_id', data.id).order('created_at'),
        supabase.from('notes').select('*').eq('lead_id', data.id).order('created_at', { ascending: false }).limit(5),
      ])
      setIndex(j)
      setLead(data)
      setDetails({ contacts: c.data ?? [], notes: n.data ?? [] })
      return data
    }
    setLead(null)
    setPhase('done')
    return null
  }, [queue])

  const callLead = useCallback(async (l, number = l.phone) => {
    setError('')
    savedDuringCall.current = false
    try {
      await phone.dial(l, number)
      setPhase('calling')
      setStats((s) => ({ ...s, calls: s.calls + 1 }))
    } catch (e) {
      setError(e.message)
      setPhase('paused')
    }
  }, [phone])

  async function start() {
    setPaused(false)
    const l = await loadLead(0)
    if (l) callLead(l)
  }

  const next = useCallback(async () => {
    const l = await loadLead(index + 1)
    if (!l) return
    if (paused) setPhase('paused')
    else callLead(l)
  }, [index, paused, loadLead, callLead])

  // Anruf beendet -> Nachbearbeitung (oder direkt weiter, wenn schon gespeichert)
  useEffect(() => {
    if (phase !== 'calling') return
    if (!phone.call && savedDuringCall.current) next()
    else if (phone.call?.state === 'ended') setPhase('wrapup')
  }, [phone.call, phase, next])

  function onSaved() {
    setStats((s) => ({ ...s, saved: s.saved + 1 }))
    phone.clearCall()
    if (phase === 'calling' && phone.call?.state !== 'ended') savedDuringCall.current = true
    else next()
  }

  if (error && !queue) return <p className="error">{error}</p>
  if (!queue) return <p className="muted">Anrufliste wird geladen…</p>

  const filterText = Object.keys(filters).length ? 'gefilterte Liste' : 'alle Leads'
  const inCall = phone.call && phone.call.state !== 'ended'

  return (
    <>
      <div className="row spread">
        <h1>Power Dialer <span className="muted small">({queue.length} Leads, {filterText})</span></h1>
        <div className="row">
          <span className="muted small">Heute in dieser Sitzung: {stats.calls} Anrufe · {stats.saved} bearbeitet</span>
          <Link className="btn" to={`/leads?${params}`}>Filter ändern</Link>
        </div>
      </div>

      {phone.status !== 'ready' && (
        <p className="error">Telefonie ist nicht verbunden{phone.error ? `: ${phone.error}` : ''}. Der Power Dialer braucht die Browser-Telefonie.</p>
      )}
      {error && <p className="error">{error}</p>}

      {phase === 'start' && (
        <div className="panel">
          <p>{queue.length} anrufbare Leads. Fällige Wiedervorlagen kommen zuerst; abgeschlossene Leads und Leads mit späterer Wiedervorlage werden übersprungen.</p>
          <p className="muted small">Ablauf: Anruf startet automatisch → nach dem Auflegen Ergebnis + Notiz eintragen → „Speichern &amp; nächster“ ruft sofort den nächsten Lead an.</p>
          <button className="primary" disabled={!queue.length || phone.status !== 'ready'} onClick={start}>▶ Starten</button>
        </div>
      )}

      {phase === 'done' && (
        <div className="panel">
          <h2>Liste abgearbeitet 🎉</h2>
          <p>{stats.calls} Anrufe, {stats.saved} Ergebnisse gespeichert.</p>
          <Link className="btn" to="/leads">Zur Leadliste</Link>
        </div>
      )}

      {lead && phase !== 'done' && phase !== 'start' && (
        <div className="cols">
          <div>
            <div className="panel">
              <div className="row spread">
                <div>
                  <div className="muted small">Lead {index + 1} von {queue.length}</div>
                  <h2 style={{ fontSize: 20, margin: '4px 0' }}>
                    <Link to={`/leads/${lead.id}`} target="_blank">{lead.company}</Link>{' '}
                    <span className={`badge ${lead.status}`}>{statusLabel(lead.status)}</span>
                  </h2>
                </div>
                <div className="row">
                  {!inCall && phase !== 'wrapup' && <button className="call" onClick={() => callLead(lead)}>📞 Anrufen</button>}
                  {!inCall && phase !== 'wrapup' && <button onClick={next}>Überspringen</button>}
                  <button onClick={() => setPaused(!paused)} className={paused ? 'primary' : ''}>
                    {paused ? 'Pausiert – fortsetzen' : 'Pause nach diesem Anruf'}
                  </button>
                </div>
              </div>
              <dl className="kv" style={{ marginTop: 10 }}>
                <dt>Telefon</dt><dd>{formatPhone(lead.phone)}{lead.phone2 && ` · ${formatPhone(lead.phone2)}`}</dd>
                <dt>Adresse</dt><dd>{[lead.street, [lead.zip, lead.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || '–'}</dd>
                <dt>Branche</dt><dd>{lead.industry ?? '–'}</dd>
                {lead.website && <><dt>Website</dt><dd><a href={/^https?:/.test(lead.website) ? lead.website : `https://${lead.website}`} target="_blank" rel="noreferrer">{lead.website}</a></dd></>}
                {lead.email && <><dt>E-Mail</dt><dd>{lead.email}</dd></>}
                {lead.current_supplier && <><dt>Versorger</dt><dd>{lead.current_supplier}</dd></>}
                {lead.contract_end && <><dt>Vertragsende</dt><dd>{fmtDate(lead.contract_end)}</dd></>}
                <dt>Versuche</dt><dd>{lead.call_count}{lead.last_outcome && ` · zuletzt: ${outcomeLabel(lead.last_outcome)} (${fmtDateTime(lead.last_call_at)})`}</dd>
              </dl>
            </div>

            <div className="panel">
              <h2>Ansprechpartner</h2>
              {details.contacts.length === 0 && <p className="muted">Keine hinterlegt.</p>}
              {details.contacts.map((c) => (
                <div key={c.id} className="row spread" style={{ padding: '4px 0' }}>
                  <span><strong>{c.name}</strong>{c.position && <span className="muted"> · {c.position}</span>}</span>
                  {c.phone?.startsWith('+') && !inCall && <button className="link" onClick={() => callLead(lead, c.phone)}>📞 {formatPhone(c.phone)}</button>}
                </div>
              ))}
            </div>

            <div className="panel">
              <h2>Letzte Notizen</h2>
              {details.notes.length === 0 && <p className="muted">Keine.</p>}
              {details.notes.map((n) => (
                <div key={n.id} className="timeline-item note">
                  <div className="small muted">{fmtDateTime(n.created_at)}</div>
                  <pre>{n.body}</pre>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <h2>{phase === 'wrapup' ? 'Nachbearbeitung' : inCall ? 'Im Gespräch' : 'Bereit'}</h2>
            {(phase === 'calling' || phase === 'wrapup') && phone.call?.callId && !phone.call.saved ? (
              <OutcomeForm key={phone.call.callId} lead={lead} contacts={details.contacts} callId={phone.call.callId}
                submitLabel={paused ? 'Speichern' : 'Speichern & nächster ›'} onSaved={onSaved} />
            ) : savedDuringCall.current && inCall ? (
              <p className="success">Gespeichert – nach dem Auflegen geht es automatisch weiter.</p>
            ) : (
              <p className="muted">{paused ? 'Pausiert. „Anrufen“ oder „Überspringen“ klicken, um weiterzumachen.' : 'Der nächste Anruf startet gleich…'}</p>
            )}
          </div>
        </div>
      )}
    </>
  )
}
