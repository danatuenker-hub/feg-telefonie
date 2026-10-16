import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { APPOINTMENT_STATUSES, appointmentStatusLabel } from '../lib/constants'
import TelegramConnect from '../components/TelegramConnect'

const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }

export default function Appointments() {
  const { profile, isAdmin } = useAuth()
  const navigate = useNavigate()
  const isBerater = profile.role === 'berater'
  const [rows, setRows] = useState(null)
  const [people, setPeople] = useState([])
  const [berater, setBerater] = useState('')
  const [scope, setScope] = useState('upcoming') // upcoming | past | all
  const [status, setStatus] = useState('')
  const [mine, setMine] = useState(!isAdmin && !isBerater)

  useEffect(() => {
    supabase.from('profiles').select('id, name, role').order('name').then(({ data }) => setPeople(data ?? []))
  }, [])

  useEffect(() => {
    setRows(null)
    const today = startOfDay(new Date()).toISOString()
    let q = supabase.from('appointments').select('*').limit(1000)
    if (scope === 'upcoming') q = q.gte('starts_at', today).order('starts_at')
    else if (scope === 'past') q = q.lt('starts_at', today).order('starts_at', { ascending: false })
    else q = q.order('starts_at', { ascending: false })
    if (isBerater) q = q.eq('berater_id', profile.id)
    else if (berater) q = q.eq('berater_id', berater)
    if (mine) q = q.eq('created_by', profile.id)
    if (status) q = q.eq('status', status)
    q.then(({ data }) => setRows(data ?? []))
  }, [scope, berater, status, mine, isBerater, profile.id])

  const nameOf = (id) => people.find((p) => p.id === id)?.name ?? '–'
  const groups = useMemo(() => {
    const map = new Map()
    for (const r of rows ?? []) {
      const key = new Date(r.starts_at).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(r)
    }
    return [...map.entries()]
  }, [rows])

  return (
    <>
      <div className="row spread">
        <h1>{isBerater ? 'Meine Termine' : 'Termine'}</h1>
        <div className="row">
          <select value={scope} onChange={(e) => setScope(e.target.value)} style={{ width: 'auto' }}>
            <option value="upcoming">Ab heute</option>
            <option value="past">Vergangene</option>
            <option value="all">Alle</option>
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 'auto' }}>
            <option value="">Alle Status</option>
            {APPOINTMENT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          {!isBerater && (
            <select value={berater} onChange={(e) => setBerater(e.target.value)} style={{ width: 'auto' }}>
              <option value="">Alle Berater</option>
              {people.filter((p) => p.role === 'berater').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          {!isBerater && (
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', margin: 0, color: 'var(--text)' }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={mine} onChange={(e) => setMine(e.target.checked)} />
              Nur von mir gelegte
            </label>
          )}
        </div>
      </div>

      {isBerater && <BeraterTools />}

      {!rows && <p className="muted">Lädt…</p>}
      {rows && rows.length === 0 && <div className="panel muted">Keine Termine gefunden.</div>}
      {groups.map(([day, list]) => (
        <div className="panel" key={day}>
          <h2>{day}</h2>
          <table>
            <tbody>
              {list.map((a) => (
                <tr key={a.id} className="clickable" onClick={() => navigate(`/termine/${a.id}`)}>
                  <td style={{ width: 110 }}><strong>{time(a.starts_at)}–{time(a.ends_at)}</strong></td>
                  <td style={{ width: 30 }}>{a.kind === 'telefon' ? '📞' : '📍'}</td>
                  <td>
                    <strong>{a.company}</strong>
                    <div className="small muted">{[a.contact_name, [a.zip, a.city].filter(Boolean).join(' ')].filter(Boolean).join(' · ')}</div>
                  </td>
                  {!isBerater && <td>Berater: {nameOf(a.berater_id)}</td>}
                  <td className="small muted">gelegt von {nameOf(a.created_by)}</td>
                  <td><span className={`badge ${a.status}`}>{appointmentStatusLabel(a.status)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </>
  )
}

const time = (d) => new Date(d).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })

// Telegram-Verbindung und Kalender-Abo für Berater
function BeraterTools() {
  const [calUrl, setCalUrl] = useState('')
  useEffect(() => {
    supabase.rpc('my_calendar_token').then(({ data }) => data && setCalUrl(`${window.location.origin}/.netlify/functions/calendar?token=${data}`))
  }, [])
  const webcal = calUrl.replace(/^https?:/, 'webcal:')

  return (
    <div className="panel grid grid-2">
      <div>
        <h2>Benachrichtigungen</h2>
        <TelegramConnect />
        <p className="small muted">Neue, geänderte und abgesagte Termine kommen dann sofort als Telegram-Nachricht.</p>
      </div>
      <div>
        <h2>Termine im Handy-Kalender</h2>
        {calUrl ? (
          <>
            <a className="btn" href={webcal}>📅 Kalender abonnieren</a>{' '}
            <button className="link small" onClick={() => { navigator.clipboard.writeText(calUrl); alert('Link kopiert') }}>Link kopieren</button>
            <p className="small muted">Auf dem iPhone/Mac öffnet sich der Kalender direkt. Bei Google Kalender: „Andere Kalender → Per URL“ und den kopierten Link einfügen. Den Link nicht weitergeben.</p>
          </>
        ) : <p className="muted small">Lädt…</p>}
      </div>
    </div>
  )
}

