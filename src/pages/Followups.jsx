import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useProfiles } from '../lib/useProfiles'
import { formatPhone } from '../lib/phone'
import { fmtDateTime } from '../lib/format'
import { outcomeLabel } from '../lib/constants'

export default function Followups() {
  const { profile, isAdmin } = useAuth()
  const profiles = useProfiles()
  const [user, setUser] = useState(isAdmin ? '' : profile.id)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [missed, setMissed] = useState([])

  const load = useCallback(() => {
    setLoading(true)
    let q = supabase.from('followups')
      .select('id, due_at, note, user_id, lead:leads(id, company, phone, city, last_outcome, assigned_to)')
      .is('done_at', null).order('due_at').limit(500)
    if (user) q = q.eq('user_id', user)
    q.then(({ data }) => { setRows((data ?? []).filter((r) => r.lead)); setLoading(false) })

    let m = supabase.from('calls').select('id, from_number, started_at, user_id, lead:leads(id, company)')
      .eq('missed', true).is('seen_at', null).order('started_at', { ascending: false }).limit(100)
    if (user) m = m.eq('user_id', user)
    m.then(({ data }) => setMissed(data ?? []))
  }, [user])

  useEffect(() => { load() }, [load])

  const endOfToday = new Date(); endOfToday.setHours(23, 59, 59, 999)
  const now = new Date()
  const groups = [
    ['Überfällig', rows.filter((r) => new Date(r.due_at) < now && !sameDay(r.due_at, now))],
    ['Heute', rows.filter((r) => sameDay(r.due_at, now))],
    ['Demnächst', rows.filter((r) => new Date(r.due_at) > endOfToday)],
  ]
  const nameOf = (id) => profiles.find((p) => p.id === id)?.name ?? '–'

  return (
    <>
      <div className="row spread">
        <h1>Wiedervorlagen</h1>
        {isAdmin && (
          <select value={user} onChange={(e) => setUser(e.target.value)} style={{ width: 'auto' }}>
            <option value="">Alle Mitarbeiter</option>
            {profiles.filter((p) => p.role !== 'berater').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
      </div>
      {missed.length > 0 && (
        <div className="panel" style={{ borderColor: 'var(--danger)' }}>
          <h2>Verpasste Rückrufe <span className="muted small">({missed.length})</span></h2>
          <table>
            <thead><tr><th>Zeitpunkt</th><th>Von</th><th>Firma</th>{isAdmin && <th>Mitarbeiter</th>}<th></th></tr></thead>
            <tbody>
              {missed.map((c) => (
                <tr key={c.id}>
                  <td>{fmtDateTime(c.started_at)}</td>
                  <td>{formatPhone(c.from_number)}</td>
                  <td>{c.lead ? <Link to={`/leads/${c.lead.id}`}>{c.lead.company}</Link> : <span className="muted">unbekannt</span>}</td>
                  {isAdmin && <td>{nameOf(c.user_id)}</td>}
                  <td>
                    <button className="link small" onClick={async () => {
                      await supabase.from('calls').update({ seen_at: new Date().toISOString() }).eq('id', c.id)
                      load()
                    }}>erledigt</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {loading && <p className="muted">Lädt…</p>}
      {!loading && groups.map(([title, list]) => (
        <div className="panel" key={title}>
          <h2>{title} <span className="muted small">({list.length})</span></h2>
          {list.length === 0 ? <p className="muted">Keine.</p> : (
            <table>
              <thead><tr><th>Fällig</th><th>Firma</th><th>Telefon</th><th>Ort</th><th>Letztes Ergebnis</th><th>Notiz</th>{isAdmin && <th>Mitarbeiter</th>}<th></th></tr></thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id}>
                    <td><span className={new Date(r.due_at) <= now ? 'badge due' : 'badge'}>{fmtDateTime(r.due_at)}</span></td>
                    <td><Link to={`/leads/${r.lead.id}`}><strong>{r.lead.company}</strong></Link></td>
                    <td><a href={`tel:${r.lead.phone}`}>{formatPhone(r.lead.phone)}</a></td>
                    <td>{r.lead.city ?? '–'}</td>
                    <td>{r.lead.last_outcome ? outcomeLabel(r.lead.last_outcome) : '–'}</td>
                    <td className="small">{r.note ?? ''}</td>
                    {isAdmin && <td>{nameOf(r.user_id)}</td>}
                    <td>
                      <button className="link small" onClick={async () => {
                        await supabase.from('followups').update({ done_at: new Date().toISOString() }).eq('id', r.id)
                        load()
                      }}>erledigt</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </>
  )
}

function sameDay(a, b) {
  a = new Date(a); b = new Date(b)
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}
