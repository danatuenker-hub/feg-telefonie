import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { OUTCOMES } from '../lib/constants'
import { toLocalInput } from '../lib/format'
import { notifyAppointment } from '../lib/notify'
import { toast } from '../lib/toast'
import AppointmentFields, { appointmentRow, initialAppointment, validateAppointment } from './AppointmentFields'

function defaultFollowup() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(10, 0, 0, 0)
  return toLocalInput(d)
}

// Nachbearbeitung eines Anrufs: Ergebnis, Notiz, Wiedervorlage.
// callId gesetzt -> vorhandenen (Twilio-)Anruf ergänzen; sonst wird ein manueller Anruf angelegt.
export default function OutcomeForm({ lead, contacts = [], callId, submitLabel = 'Speichern', onSaved, manual = false, preset }) {
  const { profile } = useAuth()
  const [outcome, setOutcome] = useState('')
  const [note, setNote] = useState('')
  const [followupAt, setFollowupAt] = useState('')
  const [contractEnd, setContractEnd] = useState(lead.contract_end ?? '')
  const [supplier, setSupplier] = useState(lead.current_supplier ?? '')
  const [minutes, setMinutes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [appt, setAppt] = useState(() => initialAppointment(lead, contacts))
  const formRef = useRef(null)

  // Klick auf eine freie Zeit in der Berater-Übersicht -> Termin vorbelegen
  useEffect(() => {
    if (!preset) return
    setOutcome('termin')
    setFollowupAt('')
    setAppt((a) => ({ ...a, berater_id: preset.berater_id, starts_at: preset.starts_at }))
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [preset])

  const meta = OUTCOMES.find((o) => o.value === outcome)

  function pickOutcome(v) {
    setOutcome(v)
    const m = OUTCOMES.find((o) => o.value === v)
    if (m?.followup && !followupAt) setFollowupAt(defaultFollowup())
    if (!m?.followup) setFollowupAt('')
  }

  // Vertragsende -> Wiedervorlage 4 Monate vorher (oder morgen, falls das schon vorbei ist)
  function pickContractEnd(v) {
    setContractEnd(v)
    if (!v) return
    const d = new Date(v)
    d.setMonth(d.getMonth() - 4)
    d.setHours(10, 0, 0, 0)
    setFollowupAt(toLocalInput(d < new Date() ? new Date(defaultFollowup()) : d))
  }

  async function submit(e) {
    e.preventDefault()
    if (!outcome) return setError('Bitte ein Ergebnis wählen.')
    if (meta?.followup && !followupAt) return setError('Bitte Datum und Uhrzeit für die Wiedervorlage angeben.')
    if (outcome === 'termin') {
      const problem = validateAppointment(appt)
      if (problem) return setError(problem)
    }
    setBusy(true)
    setError('')
    try {
      // Termin zuerst anlegen – schlägt das fehl, bleibt das Ergebnis ungespeichert
      let appointmentId = null
      let usedCallId = callId
      if (!callId && outcome === 'termin') {
        const { data, error } = await supabase.from('calls').insert({
          lead_id: lead.id, user_id: profile.id, to_number: lead.phone, started_at: new Date().toISOString(),
        }).select('id').single()
        if (error) throw error
        usedCallId = data.id
      }
      if (outcome === 'termin') {
        const { data, error } = await supabase.from('appointments')
          .insert({ ...appointmentRow(appt, lead), created_by: profile.id, call_id: usedCallId }).select('id').single()
        if (error) throw error
        appointmentId = data.id
      }

      if (usedCallId) {
        const patch = { outcome }
        if (!callId) {
          const sec = Math.round(Number(String(minutes).replace(',', '.')) * 60) || 0
          Object.assign(patch, { duration_sec: sec, answered_at: sec ? new Date().toISOString() : null, ended_at: new Date().toISOString() })
        }
        const { error } = await supabase.from('calls').update(patch).eq('id', usedCallId)
        if (error) throw error
      } else {
        const sec = Math.round(Number(String(minutes).replace(',', '.')) * 60) || 0
        const now = new Date()
        const { error } = await supabase.from('calls').insert({
          lead_id: lead.id,
          user_id: profile.id,
          to_number: lead.phone,
          outcome,
          started_at: new Date(now - sec * 1000).toISOString(),
          answered_at: sec ? new Date(now - sec * 1000).toISOString() : null,
          ended_at: now.toISOString(),
          duration_sec: sec,
        })
        if (error) throw error
      }

      if (note.trim()) {
        const { error } = await supabase.from('notes').insert({ lead_id: lead.id, user_id: profile.id, body: note.trim() })
        if (error) throw error
      }

      // Offene Wiedervorlagen sind mit diesem Anruf erledigt
      await supabase.from('followups').update({ done_at: new Date().toISOString() })
        .eq('lead_id', lead.id).is('done_at', null)

      if (followupAt) {
        const { error } = await supabase.from('followups').insert({
          lead_id: lead.id, user_id: profile.id, due_at: new Date(followupAt).toISOString(), note: note.trim() || null,
        })
        if (error) throw error
      }

      const patch = {}
      const newEnd = outcome === 'termin' ? appt.contract_end : contractEnd
      const newSupplier = outcome === 'termin' ? appt.current_supplier : supplier
      if ((newEnd || null) !== (lead.contract_end || null)) patch.contract_end = newEnd || null
      if ((newSupplier.trim() || null) !== (lead.current_supplier || null)) patch.current_supplier = newSupplier.trim() || null
      if (Object.keys(patch).length) await supabase.from('leads').update(patch).eq('id', lead.id)

      if (appointmentId) {
        const res = await notifyAppointment(appointmentId, 'created')
        if (res.sent) toast('Termin gespeichert – Berater wurde per Telegram informiert.')
        else toast(`Termin gespeichert. Keine Telegram-Nachricht: ${res.reason ?? 'unbekannter Fehler'}`, 'warn')
      }

      setOutcome(''); setNote(''); setFollowupAt(''); setMinutes('')
      setAppt(initialAppointment(lead, contacts))
      onSaved?.()
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  return (
    <form className="grid" onSubmit={submit} ref={formRef}>
      <div>
        <label>Ergebnis *</label>
        <select value={outcome} onChange={(e) => pickOutcome(e.target.value)} autoFocus>
          <option value="">– wählen –</option>
          {OUTCOMES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      {meta?.contractEnd && (
        <div className="grid grid-2">
          <div>
            <label>Vertragsende</label>
            <input type="date" value={contractEnd} onChange={(e) => pickContractEnd(e.target.value)} />
          </div>
          <div>
            <label>Aktueller Versorger</label>
            <input value={supplier} onChange={(e) => setSupplier(e.target.value)} />
          </div>
        </div>
      )}
      {outcome === 'termin' && <AppointmentFields lead={lead} contacts={contacts} value={appt} onChange={setAppt} />}
      <div>
        <label>{outcome === 'termin' ? 'Notiz zum Gespräch (intern)' : 'Notiz'}</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && submit(e)}
          placeholder="Was wurde besprochen? (Strg/⌘ + Enter speichert)" />
      </div>
      <div className="grid grid-2">
        <div>
          <label>Wiedervorlage{meta?.followup ? ' *' : ''}</label>
          <input type="datetime-local" value={followupAt} onChange={(e) => setFollowupAt(e.target.value)} />
        </div>
        {manual && (
          <div>
            <label>Gesprächsdauer (Minuten)</label>
            <input inputMode="decimal" value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="0" />
          </div>
        )}
      </div>
      {error && <div className="error">{error}</div>}
      <button className="primary" disabled={busy}>{busy ? 'Speichert…' : submitLabel}</button>
    </form>
  )
}
