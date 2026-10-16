import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useProfiles } from '../lib/useProfiles'
import { OUTCOMES, STATUSES } from '../lib/constants'
import { fmtDuration } from '../lib/format'

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function preset(name) {
  const t = new Date(); t.setHours(0, 0, 0, 0)
  const day = (t.getDay() + 6) % 7 // Montag = 0
  const add = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
  switch (name) {
    case 'heute': return [t, t]
    case 'gestern': return [add(t, -1), add(t, -1)]
    case 'woche': return [add(t, -day), t]
    case 'vorwoche': return [add(t, -day - 7), add(t, -day - 1)]
    case 'monat': return [new Date(t.getFullYear(), t.getMonth(), 1), t]
    case 'vormonat': return [new Date(t.getFullYear(), t.getMonth() - 1, 1), new Date(t.getFullYear(), t.getMonth(), 0)]
    default: return null
  }
}

const PRESETS = [['heute', 'Heute'], ['gestern', 'Gestern'], ['woche', 'Diese Woche'], ['vorwoche', 'Letzte Woche'], ['monat', 'Dieser Monat'], ['vormonat', 'Letzter Monat']]

// Erreicht = angenommen (Twilio) bzw. Dauer > 0 (manuell erfasst)
const reached = (c) => !!c.answered_at || c.duration_sec > 0

function summarize(calls) {
  const r = calls.filter(reached)
  const talk = calls.reduce((s, c) => s + (c.duration_sec || 0), 0)
  return {
    calls: calls.length,
    reached: r.length,
    rate: calls.length ? Math.round((r.length / calls.length) * 100) : 0,
    talk,
    avg: r.length ? talk / r.length : 0,
    termine: calls.filter((c) => c.outcome === 'termin').length,
    leads: new Set(calls.filter((c) => c.outcome).map((c) => c.lead_id)).size,
  }
}

export default function Stats() {
  const { profile, isAdmin } = useAuth()
  const profiles = useProfiles()
  const [range, setRange] = useState(() => preset('woche').map(iso))
  const [active, setActive] = useState('woche')
  const [user, setUser] = useState(isAdmin ? '' : profile.id)
  const [calls, setCalls] = useState(null)
  const [statusCounts, setStatusCounts] = useState({})
  const [appts, setAppts] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    setCalls(null)
    ;(async () => {
      const rows = []
      for (let from = 0; ; from += 1000) {
        let q = supabase.from('calls')
          .select('id, user_id, lead_id, started_at, answered_at, duration_sec, outcome')
          .eq('direction', 'outbound')
          .gte('started_at', new Date(range[0] + 'T00:00:00').toISOString())
          .lte('started_at', new Date(range[1] + 'T23:59:59.999').toISOString())
          .order('started_at').range(from, from + 999)
        if (user) q = q.eq('user_id', user)
        const { data, error } = await q
        if (error) return setError(error.message)
        rows.push(...data)
        if (data.length < 1000) break
      }
      setCalls(rows)
    })()
  }, [range, user])

  // Termine im Zeitraum (nach Termindatum) – für die Berater-Übersicht
  useEffect(() => {
    let q = supabase.from('appointments').select('berater_id, created_by, status')
      .gte('starts_at', new Date(range[0] + 'T00:00:00').toISOString())
      .lte('starts_at', new Date(range[1] + 'T23:59:59.999').toISOString()).limit(5000)
    if (user) q = q.eq('created_by', user)
    q.then(({ data }) => setAppts(data ?? []))
  }, [range, user])

  // Aktueller Bearbeitungsstand der Leads (für Mitarbeiter: eigene Leads)
  useEffect(() => {
    Promise.all(STATUSES.map(async (s) => {
      let q = supabase.from('leads').select('id', { count: 'exact', head: true }).eq('status', s.value)
      if (user) q = q.eq('assigned_to', user)
      const { count } = await q
      return [s.value, count ?? 0]
    })).then((r) => setStatusCounts(Object.fromEntries(r)))
  }, [user])

  const sum = useMemo(() => (calls ? summarize(calls) : null), [calls])

  const byDay = useMemo(() => {
    if (!calls) return []
    const map = {}
    for (let d = new Date(range[0]); iso(d) <= range[1]; d.setDate(d.getDate() + 1)) map[iso(d)] = []
    calls.forEach((c) => { const k = iso(new Date(c.started_at)); (map[k] ??= []).push(c) })
    return Object.entries(map).map(([day, list]) => ({ day, ...summarize(list) }))
  }, [calls, range])

  const byUser = useMemo(() => {
    if (!calls) return []
    const map = {}
    calls.forEach((c) => (map[c.user_id] ??= []).push(c))
    return Object.entries(map).map(([uid, list]) => ({ uid, ...summarize(list) })).sort((a, b) => b.calls - a.calls)
  }, [calls])

  const outcomes = useMemo(() => {
    if (!calls) return []
    const withOutcome = calls.filter((c) => c.outcome)
    return OUTCOMES.map((o) => {
      const n = withOutcome.filter((c) => c.outcome === o.value).length
      return { ...o, n, pct: withOutcome.length ? Math.round((n / withOutcome.length) * 100) : 0 }
    }).filter((o) => o.n > 0)
  }, [calls])

  const nameOf = (id) => profiles.find((p) => p.id === id)?.name ?? '–'
  const byBerater = Object.entries(appts.reduce((m, a) => ((m[a.berater_id] ??= []).push(a), m), {})).map(([uid, list]) => {
    const done = list.filter((a) => ['durchgefuehrt', 'abschluss', 'kein_abschluss'].includes(a.status)).length
    const won = list.filter((a) => a.status === 'abschluss').length
    return { uid, total: list.length, done, won, cancelled: list.filter((a) => ['abgesagt', 'nicht_angetroffen'].includes(a.status)).length, rate: done ? Math.round((won / done) * 100) : null }
  }).sort((a, b) => b.total - a.total)
  const maxDay = Math.max(1, ...byDay.map((d) => d.calls))
  const totalLeads = Object.values(statusCounts).reduce((a, b) => a + b, 0)

  return (
    <>
      <div className="row spread">
        <h1>Auswertung</h1>
        {isAdmin && (
          <select value={user} onChange={(e) => setUser(e.target.value)} style={{ width: 'auto' }}>
            <option value="">Alle Mitarbeiter</option>
            {profiles.filter((p) => p.role !== 'berater').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
      </div>

      <div className="panel row">
        {PRESETS.map(([k, label]) => (
          <button key={k} className={active === k ? 'primary' : ''} onClick={() => { setActive(k); setRange(preset(k).map(iso)) }}>{label}</button>
        ))}
        <span className="muted">oder</span>
        <input type="date" value={range[0]} style={{ width: 'auto' }} onChange={(e) => { setActive(''); setRange([e.target.value, range[1]]) }} />
        <span>–</span>
        <input type="date" value={range[1]} style={{ width: 'auto' }} onChange={(e) => { setActive(''); setRange([range[0], e.target.value]) }} />
      </div>

      {error && <p className="error">{error}</p>}
      {!sum && !error && <p className="muted">Lädt…</p>}

      {sum && (
        <>
          <div className="tiles">
            <Tile label="Anrufe" value={sum.calls.toLocaleString('de-DE')} />
            <Tile label="Erreicht" value={sum.reached.toLocaleString('de-DE')} />
            <Tile label="Erreichbarkeit" value={`${sum.rate} %`} />
            <Tile label="Gesprächszeit" value={fmtDuration(sum.talk)} />
            <Tile label="Ø Gespräch" value={fmtDuration(sum.avg)} />
            <Tile label="Termine" value={sum.termine.toLocaleString('de-DE')} />
            <Tile label="Bearbeitete Leads" value={sum.leads.toLocaleString('de-DE')} />
          </div>

          <div className="panel">
            <h2>Anrufe pro Tag</h2>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Tag</th><th style={{ width: '35%' }}>Anrufe</th><th>Erreicht</th><th>Quote</th><th>Gesprächszeit</th><th>Termine</th></tr></thead>
                <tbody>
                  {byDay.map((d) => (
                    <tr key={d.day}>
                      <td>{new Date(d.day).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })}</td>
                      <td>
                        <div className="bar-cell" title={`${d.calls} Anrufe, ${d.reached} erreicht`}>
                          {d.calls > 0 && <div className="bar" style={{ width: `${(d.calls / maxDay) * 100}%` }} />}
                          <span>{d.calls}</span>
                        </div>
                      </td>
                      <td>{d.reached}</td>
                      <td>{d.calls ? `${d.rate} %` : '–'}</td>
                      <td>{d.talk ? fmtDuration(d.talk) : '–'}</td>
                      <td>{d.termine || '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-2">
            {isAdmin && !user && (
              <div className="panel">
                <h2>Nach Mitarbeiter</h2>
                <table>
                  <thead><tr><th>Mitarbeiter</th><th>Anrufe</th><th>Erreicht</th><th>Quote</th><th>Gesprächszeit</th><th>Termine</th></tr></thead>
                  <tbody>
                    {byUser.length === 0 && <tr><td colSpan={6} className="muted">Keine Anrufe im Zeitraum.</td></tr>}
                    {byUser.map((u) => (
                      <tr key={u.uid} className="clickable" onClick={() => setUser(u.uid)}>
                        <td><strong>{nameOf(u.uid)}</strong></td>
                        <td>{u.calls}</td><td>{u.reached}</td><td>{u.rate} %</td><td>{fmtDuration(u.talk)}</td><td>{u.termine}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="panel">
              <h2>Termine nach Berater <span className="muted small">(Termindatum im Zeitraum{user ? ', von diesem Mitarbeiter gelegt' : ''})</span></h2>
              <table>
                <thead><tr><th>Berater</th><th>Termine</th><th>Durchgeführt</th><th>Abschlüsse</th><th>Abschlussquote</th><th>Abgesagt / nicht angetroffen</th></tr></thead>
                <tbody>
                  {byBerater.length === 0 && <tr><td colSpan={6} className="muted">Keine Termine im Zeitraum.</td></tr>}
                  {byBerater.map((b) => (
                    <tr key={b.uid}><td><strong>{nameOf(b.uid)}</strong></td><td>{b.total}</td><td>{b.done}</td><td>{b.won}</td><td>{b.rate == null ? '–' : `${b.rate} %`}</td><td>{b.cancelled}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="panel">
              <h2>Ergebnisse im Zeitraum</h2>
              <table>
                <thead><tr><th>Ergebnis</th><th>Anzahl</th><th>Anteil</th></tr></thead>
                <tbody>
                  {outcomes.length === 0 && <tr><td colSpan={3} className="muted">Keine Ergebnisse erfasst.</td></tr>}
                  {outcomes.map((o) => <tr key={o.value}><td>{o.label}</td><td>{o.n}</td><td>{o.pct} %</td></tr>)}
                </tbody>
              </table>
            </div>

            <div className="panel">
              <h2>Bearbeitungsstand der Leads <span className="muted small">(aktuell, {totalLeads.toLocaleString('de-DE')} gesamt)</span></h2>
              <table>
                <thead><tr><th>Status</th><th>Leads</th><th>Anteil</th></tr></thead>
                <tbody>
                  {STATUSES.map((s) => (
                    <tr key={s.value}>
                      <td><span className={`badge ${s.value}`}>{s.label}</span></td>
                      <td>{(statusCounts[s.value] ?? 0).toLocaleString('de-DE')}</td>
                      <td>{totalLeads ? Math.round(((statusCounts[s.value] ?? 0) / totalLeads) * 100) : 0} %</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  )
}

function Tile({ label, value }) {
  return (
    <div className="tile">
      <div className="tile-label">{label}</div>
      <div className="tile-value">{value}</div>
    </div>
  )
}
