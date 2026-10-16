import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { zipInRegions } from '../lib/constants'
import { addDays, defaultWeek, hm, isoDate, weekSlots } from '../lib/slots'

const DAY_NAMES = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

// Freie Zeiten aller Berater einer Woche. Mit zip werden passende Berater zuerst (bzw. nur diese) gezeigt.
// onPick(beraterId, startIso) – Klick auf eine freie Zeit.
export default function AvailabilityOverview({ zip, onPick, compact = false }) {
  const [week, setWeek] = useState(defaultWeek)
  const [beraters, setBeraters] = useState(null)
  const [avail, setAvail] = useState([])
  const [absences, setAbsences] = useState([])
  const [busy, setBusy] = useState({})
  const [onlyMatching, setOnlyMatching] = useState(true)
  const [duration, setDuration] = useState(60)

  useEffect(() => {
    Promise.all([
      supabase.from('profiles').select('id, name, regions').eq('role', 'berater').eq('active', true).order('name'),
      supabase.from('availability').select('*'),
    ]).then(([b, a]) => { setBeraters(b.data ?? []); setAvail(a.data ?? []) })
  }, [])

  useEffect(() => {
    if (!beraters?.length) return
    const end = addDays(week, 7)
    supabase.from('absences').select('*').lte('from_date', isoDate(end)).gte('to_date', isoDate(week))
      .then(({ data }) => setAbsences(data ?? []))
    Promise.all(beraters.map((b) =>
      supabase.rpc('berater_busy', { p_berater: b.id, p_from: week.toISOString(), p_to: end.toISOString() })
        .then(({ data }) => [b.id, data ?? []]),
    )).then((r) => setBusy(Object.fromEntries(r)))
  }, [beraters, week])

  const list = useMemo(() => {
    if (!beraters) return []
    const withMatch = beraters.map((b) => ({ ...b, match: zipInRegions(zip, b.regions) }))
    const anyMatch = withMatch.some((b) => b.match)
    return withMatch
      .filter((b) => !zip || !onlyMatching || !anyMatch || b.match)
      .sort((a, b) => Number(b.match) - Number(a.match) || a.name.localeCompare(b.name))
      .map((b) => ({
        ...b,
        days: weekSlots(week, avail.filter((x) => x.berater_id === b.id), absences.filter((x) => x.berater_id === b.id), busy[b.id] ?? [], duration),
      }))
  }, [beraters, avail, absences, busy, week, zip, onlyMatching, duration])

  if (!beraters) return <p className="muted small">Lädt…</p>
  if (beraters.length === 0) return <p className="muted small">Noch keine Berater angelegt.</p>
  const anyMatch = zip && beraters.some((b) => zipInRegions(zip, b.regions))

  return (
    <div className="avail-overview">
      <div className="row spread" style={{ marginBottom: 8 }}>
        <div className="row" style={{ gap: 6 }}>
          <button type="button" onClick={() => setWeek(addDays(week, -7))}>‹</button>
          <strong className="small">{week.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} – {addDays(week, 6).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}</strong>
          <button type="button" onClick={() => setWeek(addDays(week, 7))}>›</button>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} style={{ width: 'auto' }}>
            {[30, 60, 90, 120].map((m) => <option key={m} value={m}>{m} min</option>)}
          </select>
          {zip && anyMatch && (
            <label className="small" style={{ display: 'flex', gap: 4, alignItems: 'center', margin: 0, color: 'var(--text)' }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={onlyMatching} onChange={(e) => setOnlyMatching(e.target.checked)} />
              nur PLZ {zip}
            </label>
          )}
        </div>
      </div>
      {zip && !anyMatch && <p className="small muted">Kein Berater hat PLZ {zip} im Gebiet – es werden alle angezeigt.</p>}
      {list.map((b) => {
        const free = b.days.reduce((n, d) => n + d.slots.filter((s) => s.state === 'free').length, 0)
        return (
          <div key={b.id} className="avail-berater">
            <div className="row spread">
              <strong>{b.name}{b.match && <span className="badge termin" style={{ marginLeft: 6 }}>passt zur PLZ</span>}</strong>
              <span className="small muted">{free} freie Zeiten</span>
            </div>
            <div className="avail-days" style={{ gridTemplateColumns: `repeat(${b.days.length}, minmax(0, 1fr))` }}>
              {b.days.map(({ day, absent, slots }) => {
                const freeSlots = slots.filter((s) => s.state === 'free')
                const shown = compact ? freeSlots.slice(0, 4) : freeSlots
                return (
                  <div key={isoDate(day)}>
                    <div className="slot-day">{DAY_NAMES[(day.getDay() + 6) % 7]} {day.getDate()}.{day.getMonth() + 1}.</div>
                    {absent && <div className="slot none">abwesend</div>}
                    {!absent && freeSlots.length === 0 && <div className="slot none">–</div>}
                    {shown.map((s) => (
                      <button type="button" key={s.start.toISOString()} className="slot free"
                        title={onPick ? 'Termin zu dieser Zeit legen' : undefined}
                        onClick={() => onPick?.(b.id, s.start.toISOString())}>{hm(s.start)}</button>
                    ))}
                    {compact && freeSlots.length > shown.length && <div className="small muted" style={{ textAlign: 'center' }}>+{freeSlots.length - shown.length}</div>}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
