import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { fmtDate } from '../lib/format'

const DAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']

// Feste Wochenzeiten und Abwesenheiten eines Beraters. Admins können jeden Berater bearbeiten.
export default function Availability() {
  const { profile, isAdmin } = useAuth()
  const [beraters, setBeraters] = useState([])
  const [who, setWho] = useState(profile.role === 'berater' ? profile.id : '')
  const [slots, setSlots] = useState([])
  const [absences, setAbsences] = useState([])
  const [abs, setAbs] = useState({ from_date: '', to_date: '', note: '' })

  useEffect(() => {
    if (!isAdmin) return
    supabase.from('profiles').select('id, name').eq('role', 'berater').eq('active', true).order('name')
      .then(({ data }) => { setBeraters(data ?? []); if (!who && data?.[0]) setWho(data[0].id) })
  }, [isAdmin])

  const load = useCallback(() => {
    if (!who) return
    supabase.from('availability').select('*').eq('berater_id', who).order('weekday').order('start_time')
      .then(({ data }) => setSlots(data ?? []))
    supabase.from('absences').select('*').eq('berater_id', who).gte('to_date', new Date().toISOString().slice(0, 10)).order('from_date')
      .then(({ data }) => setAbsences(data ?? []))
  }, [who])
  useEffect(() => { load() }, [load])

  async function addSlot(weekday) {
    const { error } = await supabase.from('availability').insert({ berater_id: who, weekday, start_time: '09:00', end_time: '17:00' })
    if (error) alert(error.message)
    load()
  }
  async function updateSlot(id, patch) {
    const { error } = await supabase.from('availability').update(patch).eq('id', id)
    if (error) alert('Ende muss nach Beginn liegen.')
    load()
  }
  async function removeSlot(id) {
    await supabase.from('availability').delete().eq('id', id)
    load()
  }
  async function copyMonday() {
    const mon = slots.filter((s) => s.weekday === 1)
    if (!mon.length) return alert('Zuerst Zeiten für Montag eintragen.')
    if (!confirm('Montags-Zeiten für Dienstag bis Freitag übernehmen? Vorhandene Zeiten Di–Fr werden ersetzt.')) return
    await supabase.from('availability').delete().eq('berater_id', who).in('weekday', [2, 3, 4, 5])
    await supabase.from('availability').insert([2, 3, 4, 5].flatMap((d) => mon.map((s) => ({ berater_id: who, weekday: d, start_time: s.start_time, end_time: s.end_time }))))
    load()
  }
  async function addAbsence(e) {
    e.preventDefault()
    if (!abs.from_date) return
    const { error } = await supabase.from('absences').insert({ berater_id: who, from_date: abs.from_date, to_date: abs.to_date || abs.from_date, note: abs.note || null })
    if (error) return alert(error.message)
    setAbs({ from_date: '', to_date: '', note: '' })
    load()
  }

  return (
    <>
      <div className="row spread">
        <h1>Verfügbarkeit</h1>
        {isAdmin && (
          <select value={who} onChange={(e) => setWho(e.target.value)} style={{ width: 'auto' }}>
            {beraters.length === 0 && <option value="">Keine Berater angelegt</option>}
            {beraters.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
      </div>
      <p className="muted">In diesen Zeiten kann das Callcenter Termine legen. Bereits gebuchte Termine werden automatisch als belegt angezeigt.</p>

      {who && (
        <div className="cols">
          <div className="panel">
            <div className="row spread"><h2>Feste Wochenzeiten</h2><button className="link small" onClick={copyMonday}>Montag auf Di–Fr übernehmen</button></div>
            {DAYS.map((name, i) => {
              const day = slots.filter((s) => s.weekday === i + 1)
              return (
                <div key={name} className="row" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', alignItems: 'flex-start' }}>
                  <strong style={{ width: 100 }}>{name}</strong>
                  <div className="grid" style={{ gap: 6, flex: 1 }}>
                    {day.length === 0 && <span className="muted small">nicht verfügbar</span>}
                    {day.map((s) => (
                      <div key={s.id} className="row" style={{ gap: 6 }}>
                        <input type="time" defaultValue={s.start_time.slice(0, 5)} style={{ width: 110 }}
                          onBlur={(e) => e.target.value !== s.start_time.slice(0, 5) && updateSlot(s.id, { start_time: e.target.value })} />
                        –
                        <input type="time" defaultValue={s.end_time.slice(0, 5)} style={{ width: 110 }}
                          onBlur={(e) => e.target.value !== s.end_time.slice(0, 5) && updateSlot(s.id, { end_time: e.target.value })} />
                        <button className="link small" style={{ color: 'var(--danger)' }} onClick={() => removeSlot(s.id)}>entfernen</button>
                      </div>
                    ))}
                  </div>
                  <button className="link small" onClick={() => addSlot(i + 1)}>+ Zeit</button>
                </div>
              )
            })}
          </div>

          <div className="panel">
            <h2>Abwesenheiten (Urlaub, Krankheit …)</h2>
            <form className="grid" onSubmit={addAbsence}>
              <div className="grid grid-2">
                <div><label>Von</label><input type="date" required value={abs.from_date} onChange={(e) => setAbs({ ...abs, from_date: e.target.value })} /></div>
                <div><label>Bis</label><input type="date" value={abs.to_date} onChange={(e) => setAbs({ ...abs, to_date: e.target.value })} /></div>
              </div>
              <div><label>Notiz</label><input value={abs.note} onChange={(e) => setAbs({ ...abs, note: e.target.value })} placeholder="z. B. Urlaub" /></div>
              <div><button>Eintragen</button></div>
            </form>
            <div style={{ marginTop: 12 }}>
              {absences.length === 0 && <p className="muted small">Keine geplanten Abwesenheiten.</p>}
              {absences.map((a) => (
                <div key={a.id} className="row spread" style={{ padding: '4px 0' }}>
                  <span>{fmtDate(a.from_date)}{a.to_date !== a.from_date && ` – ${fmtDate(a.to_date)}`} {a.note && <span className="muted">· {a.note}</span>}</span>
                  <button className="link small" style={{ color: 'var(--danger)' }} onClick={async () => { await supabase.from('absences').delete().eq('id', a.id); load() }}>löschen</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
