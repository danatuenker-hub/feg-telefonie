import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { zipInRegions } from '../lib/constants'
import { formatPhone } from '../lib/phone'
import { addDays, defaultWeek, hm, isoDate, mondayOf, weekSlots } from '../lib/slots'

const mondayOfDate = (iso) => mondayOf(new Date(iso))

const DAY_NAMES = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

export function initialAppointment(lead, contacts = []) {
  const c = contacts[0]
  return {
    berater_id: '', kind: 'vor_ort', starts_at: null, duration: 60,
    contact_name: c?.name ?? '', contact_phone: formatPhone(c?.phone ?? lead.phone ?? ''),
    street: lead.street ?? '', zip: lead.zip ?? '', city: lead.city ?? '',
    power_kwh: '', gas_kwh: '', sites: '', current_supplier: lead.current_supplier ?? '',
    contract_end: lead.contract_end ?? '', notes: '',
  }
}

// Termin-Eingabe: Berater wählen, freien Slot im Wochenkalender anklicken, Kundendaten ergänzen.
export default function AppointmentFields({ lead, contacts = [], value, onChange }) {
  const [beraters, setBeraters] = useState([])
  const [week, setWeek] = useState(() => (value.starts_at ? mondayOfDate(value.starts_at) : defaultWeek()))
  const [avail, setAvail] = useState([])
  const [absences, setAbsences] = useState([])
  const [busy, setBusy] = useState([])
  const [manual, setManual] = useState(false)
  const set = (patch) => onChange({ ...value, ...patch })

  // Von außen gesetzte Zeit (z. B. aus der Berater-Übersicht) -> passende Woche anzeigen
  useEffect(() => {
    if (value.starts_at) setWeek((w) => { const m = mondayOfDate(value.starts_at); return m.getTime() === w.getTime() ? w : m })
  }, [value.starts_at])

  useEffect(() => {
    supabase.from('profiles').select('id, name, regions').eq('role', 'berater').eq('active', true).order('name')
      .then(({ data }) => setBeraters(data ?? []))
  }, [])

  const sorted = useMemo(() => {
    const zip = value.zip || lead.zip
    return beraters.map((b) => ({ ...b, match: zipInRegions(zip, b.regions) }))
      .sort((a, b) => Number(b.match) - Number(a.match) || a.name.localeCompare(b.name))
  }, [beraters, value.zip, lead.zip])

  useEffect(() => {
    if (!value.berater_id) return
    const end = addDays(week, 7)
    Promise.all([
      supabase.from('availability').select('*').eq('berater_id', value.berater_id),
      supabase.from('absences').select('*').eq('berater_id', value.berater_id)
        .lte('from_date', isoDate(end)).gte('to_date', isoDate(week)),
      supabase.rpc('berater_busy', { p_berater: value.berater_id, p_from: week.toISOString(), p_to: end.toISOString() }),
    ]).then(([a, ab, b]) => { setAvail(a.data ?? []); setAbsences(ab.data ?? []); setBusy(b.data ?? []) })
  }, [value.berater_id, week])

  const days = useMemo(() => weekSlots(week, avail, absences, busy, Number(value.duration) || 60), [week, avail, absences, busy, value.duration])

  const selected = value.starts_at ? new Date(value.starts_at) : null
  const noAvailability = value.berater_id && avail.length === 0
  const num = (k) => (e) => set({ [k]: e.target.value.replace(/[^\d]/g, '') })

  return (
    <div className="grid appointment-fields">
      <div>
        <label>Berater *</label>
        <select value={value.berater_id} onChange={(e) => set({ berater_id: e.target.value, starts_at: null })}>
          <option value="">– wählen –</option>
          {sorted.map((b) => <option key={b.id} value={b.id}>{b.name}{b.match ? ' ✓ passt zur PLZ' : ''}</option>)}
        </select>
        {beraters.length === 0 && <div className="small error">Noch keine Berater angelegt (Mitarbeiter → Rolle „Berater“).</div>}
      </div>
      <div className="grid grid-2">
        <div>
          <label>Art</label>
          <select value={value.kind} onChange={(e) => set({ kind: e.target.value })}>
            <option value="vor_ort">Vor Ort</option>
            <option value="telefon">Telefonisch</option>
          </select>
        </div>
        <div>
          <label>Dauer</label>
          <select value={value.duration} onChange={(e) => set({ duration: Number(e.target.value), starts_at: null })}>
            {[30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{m} Minuten</option>)}
          </select>
        </div>
      </div>

      {value.berater_id && (
        <div className="slot-picker">
          <div className="row spread">
            <button type="button" onClick={() => setWeek(addDays(week, -7))}>‹</button>
            <strong>{week.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} – {addDays(week, 6).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}</strong>
            <button type="button" onClick={() => setWeek(addDays(week, 7))}>›</button>
          </div>
          {noAvailability ? (
            <p className="small muted">Für diesen Berater sind keine Verfügbarkeiten hinterlegt – bitte Zeit manuell eintragen.</p>
          ) : (
            <div className="slot-grid" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
              {days.map(({ day, absent, slots }) => (
                <div key={isoDate(day)}>
                  <div className="slot-day">{DAY_NAMES[(day.getDay() + 6) % 7]} {day.getDate()}.{day.getMonth() + 1}.</div>
                  {absent && <div className="slot absent">abwesend</div>}
                  {!absent && slots.length === 0 && <div className="slot none">–</div>}
                  {!absent && slots.map((s) => {
                    const isSel = selected && s.start.getTime() === selected.getTime()
                    return (
                      <button type="button" key={s.start.toISOString()} disabled={s.state !== 'free'}
                        className={`slot ${s.state}${isSel ? ' selected' : ''}`}
                        onClick={() => set({ starts_at: s.start.toISOString() })}>
                        {hm(s.start)}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
          <div className="row" style={{ marginTop: 8 }}>
            <button type="button" className="link small" onClick={() => setManual(!manual)}>Andere Zeit eintragen</button>
            {selected && <span className="success small">Gewählt: {selected.toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} Uhr</span>}
          </div>
          {manual && (
            <input type="datetime-local" style={{ marginTop: 6 }}
              onChange={(e) => set({ starts_at: e.target.value ? new Date(e.target.value).toISOString() : null })} />
          )}
        </div>
      )}

      <div className="grid grid-2">
        <div>
          <label>Ansprechpartner</label>
          <input list="appt-contacts" value={value.contact_name} onChange={(e) => {
            const c = contacts.find((x) => x.name === e.target.value)
            set({ contact_name: e.target.value, ...(c?.phone ? { contact_phone: formatPhone(c.phone) } : {}) })
          }} />
          <datalist id="appt-contacts">{contacts.map((c) => <option key={c.id} value={c.name} />)}</datalist>
        </div>
        <div>
          <label>Telefon Ansprechpartner</label>
          <input value={value.contact_phone} onChange={(e) => set({ contact_phone: e.target.value })} />
        </div>
      </div>
      {value.kind === 'vor_ort' && (
        <div className="grid" style={{ gridTemplateColumns: '2fr 1fr 2fr', gap: 8 }}>
          <div><label>Straße *</label><input value={value.street} onChange={(e) => set({ street: e.target.value })} /></div>
          <div><label>PLZ *</label><input value={value.zip} onChange={(e) => set({ zip: e.target.value })} /></div>
          <div><label>Ort *</label><input value={value.city} onChange={(e) => set({ city: e.target.value })} /></div>
        </div>
      )}
      <div className="grid grid-3">
        <div><label>Verbrauch Strom (kWh/Jahr)</label><input inputMode="numeric" value={value.power_kwh} onChange={num('power_kwh')} /></div>
        <div><label>Verbrauch Gas (kWh/Jahr)</label><input inputMode="numeric" value={value.gas_kwh} onChange={num('gas_kwh')} /></div>
        <div><label>Lieferstellen</label><input inputMode="numeric" value={value.sites} onChange={num('sites')} /></div>
      </div>
      <div className="grid grid-2">
        <div><label>Aktueller Versorger</label><input value={value.current_supplier} onChange={(e) => set({ current_supplier: e.target.value })} /></div>
        <div><label>Vertragsende</label><input type="date" value={value.contract_end} onChange={(e) => set({ contract_end: e.target.value })} /></div>
      </div>
      <div>
        <label>Infos für den Berater</label>
        <textarea value={value.notes} onChange={(e) => set({ notes: e.target.value })}
          placeholder="Was weiß der Berater vorab? Bedarf, Besonderheiten, Anfahrt, Entscheider …" />
      </div>
    </div>
  )
}

export function validateAppointment(v) {
  if (!v.berater_id) return 'Bitte einen Berater wählen.'
  if (!v.starts_at) return 'Bitte eine Uhrzeit für den Termin wählen.'
  if (v.kind === 'vor_ort' && (!v.street.trim() || !v.zip.trim() || !v.city.trim())) return 'Für Vor-Ort-Termine bitte die vollständige Adresse angeben.'
  return null
}

export function appointmentRow(v, lead) {
  const start = new Date(v.starts_at)
  const int = (x) => (x === '' || x == null ? null : Number(x))
  return {
    lead_id: lead.id,
    berater_id: v.berater_id,
    kind: v.kind,
    starts_at: start.toISOString(),
    ends_at: new Date(start.getTime() + (Number(v.duration) || 60) * 60000).toISOString(),
    company: lead.company,
    contact_name: v.contact_name.trim() || null,
    contact_phone: v.contact_phone.trim() || null,
    street: v.street.trim() || null,
    zip: v.zip.trim() || null,
    city: v.city.trim() || null,
    power_kwh: int(v.power_kwh),
    gas_kwh: int(v.gas_kwh),
    sites: int(v.sites),
    current_supplier: v.current_supplier.trim() || null,
    contract_end: v.contract_end || null,
    notes: v.notes.trim() || null,
  }
}
