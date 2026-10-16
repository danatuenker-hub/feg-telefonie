import { useState } from 'react'
import Papa from 'papaparse'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useProfiles } from '../lib/useProfiles'
import { normalizePhone } from '../lib/phone'
import { stateFromZip } from '../lib/constants'

// Zielfeld -> mögliche Spaltennamen in der CSV (klein geschrieben, ohne Sonderzeichen)
const TARGETS = [
  ['company', 'Firma *', ['firma', 'firmenname', 'unternehmen', 'company', 'name']],
  ['phone', 'Telefon *', ['telefon', 'telefonnummer', 'tel', 'phone', 'rufnummer']],
  ['phone2', 'Telefon 2', ['telefon2', 'mobil', 'handy', 'phone2']],
  ['email', 'E-Mail', ['email', 'emailadresse', 'mail']],
  ['website', 'Website', ['website', 'webseite', 'homepage', 'url', 'web']],
  ['street', 'Straße', ['strasse', 'straße', 'str', 'adresse', 'street']],
  ['zip', 'PLZ', ['plz', 'postleitzahl', 'zip']],
  ['city', 'Ort', ['ort', 'stadt', 'city']],
  ['state', 'Bundesland', ['bundesland', 'land', 'state']],
  ['industry', 'Branche', ['branche', 'industry', 'kategorie']],
  ['contact_name', 'Ansprechpartner', ['ansprechpartner', 'kontakt', 'kontaktperson', 'contact']],
  ['contact_position', 'Position', ['position', 'funktion', 'rolle']],
  ['contact_phone', 'Ansprechpartner Telefon', ['ansprechpartnertelefon', 'durchwahl']],
  ['contact_email', 'Ansprechpartner E-Mail', ['ansprechpartneremail']],
  ['note', 'Notiz', ['notiz', 'bemerkung', 'kommentar', 'note']],
]

const TEMPLATE = 'firma;telefon;telefon2;email;website;strasse;plz;ort;bundesland;branche;ansprechpartner;position;ansprechpartner_telefon;ansprechpartner_email;notiz\n' +
  'Bäckerei Muster GmbH;089 1234567;;info@muster.de;www.muster.de;Hauptstr. 1;80331;München;;Bäckerei;Max Muster;Geschäftsführer;089 1234568;max@muster.de;Verbrauch ca. 80.000 kWh\n'

const clean = (s) => String(s ?? '').toLowerCase().replace(/[^a-zäöüß0-9]/g, '')

function guessMapping(headers) {
  const map = {}
  for (const [key, , aliases] of TARGETS) {
    const h = headers.find((h) => aliases.includes(clean(h)))
    if (h) map[key] = h
  }
  return map
}

export default function Import() {
  const { profile } = useAuth()
  const profiles = useProfiles()
  const [rows, setRows] = useState(null)
  const [headers, setHeaders] = useState([])
  const [mapping, setMapping] = useState({})
  const [listName, setListName] = useState('')
  const [assignTo, setAssignTo] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  function onFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setResult(null)
    setError('')
    setListName(file.name.replace(/\.(csv|txt)$/i, ''))
    Papa.parse(file, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h) => h.trim(),
      complete: (res) => {
        if (!res.meta.fields?.length) return setError('Keine Spalten erkannt. Ist das eine CSV-Datei?')
        setHeaders(res.meta.fields)
        setMapping(guessMapping(res.meta.fields))
        setRows(res.data)
      },
      error: (err) => setError(err.message),
    })
  }

  function downloadTemplate() {
    const blob = new Blob(['﻿' + TEMPLATE], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'leads-vorlage.csv'
    a.click()
  }

  async function runImport() {
    if (!mapping.company || !mapping.phone) return setError('Bitte die Spalten für Firma und Telefon zuordnen.')
    if (!listName.trim()) return setError('Bitte einen Namen für die Liste angeben.')
    setBusy(true)
    setError('')
    const stats = { total: rows.length, imported: 0, invalid: [], dupFile: 0, dupDb: 0, blocked: 0 }
    try {
      const get = (r, key) => (mapping[key] ? String(r[mapping[key]] ?? '').trim() : '')

      // 1. Aufbereiten + Dubletten innerhalb der Datei
      setProgress('Prüfe Daten…')
      const seen = new Set()
      const prepared = []
      rows.forEach((r, i) => {
        const company = get(r, 'company')
        const phone = normalizePhone(get(r, 'phone'))
        if (!company || !phone) return stats.invalid.push(i + 2)
        if (seen.has(phone)) return stats.dupFile++
        seen.add(phone)
        const zip = get(r, 'zip').replace(/\D/g, '').padStart(get(r, 'zip') ? 5 : 0, '0') || null
        prepared.push({
          lead: {
            company,
            phone,
            phone2: normalizePhone(get(r, 'phone2')),
            email: get(r, 'email') || null,
            website: get(r, 'website') || null,
            street: get(r, 'street') || null,
            zip,
            city: get(r, 'city') || null,
            state: get(r, 'state') || stateFromZip(zip),
            industry: get(r, 'industry') || null,
            assigned_to: assignTo || null,
          },
          contact: get(r, 'contact_name') ? {
            name: get(r, 'contact_name'),
            position: get(r, 'contact_position') || null,
            phone: normalizePhone(get(r, 'contact_phone')) ?? (get(r, 'contact_phone') || null),
            email: get(r, 'contact_email') || null,
          } : null,
          note: get(r, 'note') || null,
        })
      })

      // 2. Sperrliste und bereits vorhandene Nummern abgleichen
      setProgress('Gleiche mit vorhandenen Leads ab…')
      const phones = prepared.map((p) => p.lead.phone)
      const existing = new Set()
      const blocked = new Set()
      for (let i = 0; i < phones.length; i += 300) {
        const chunk = phones.slice(i, i + 300)
        const [a, b] = await Promise.all([
          supabase.from('leads').select('phone').in('phone', chunk),
          supabase.from('blocked_phones').select('phone').in('phone', chunk),
        ])
        if (a.error) throw a.error
        if (b.error) throw b.error
        a.data.forEach((r) => existing.add(r.phone))
        b.data.forEach((r) => blocked.add(r.phone))
      }
      const fresh = prepared.filter((p) => {
        if (blocked.has(p.lead.phone)) { stats.blocked++; return false }
        if (existing.has(p.lead.phone)) { stats.dupDb++; return false }
        return true
      })

      if (fresh.length === 0) {
        setResult(stats)
        setBusy(false)
        setProgress('')
        return
      }

      // 3. Liste anlegen und Leads in Paketen speichern
      const { data: list, error: listErr } = await supabase.from('lead_lists')
        .insert({ name: listName.trim(), created_by: profile.id }).select().single()
      if (listErr) throw listErr

      for (let i = 0; i < fresh.length; i += 500) {
        setProgress(`Importiere ${Math.min(i + 500, fresh.length)} von ${fresh.length}…`)
        const chunk = fresh.slice(i, i + 500)
        const { data, error } = await supabase.from('leads')
          .upsert(chunk.map((p) => ({ ...p.lead, list_id: list.id })), { onConflict: 'phone', ignoreDuplicates: true })
          .select('id, phone')
        if (error) throw error
        stats.imported += data.length
        stats.dupDb += chunk.length - data.length

        const idByPhone = Object.fromEntries(data.map((d) => [d.phone, d.id]))
        const contacts = chunk.filter((p) => p.contact && idByPhone[p.lead.phone])
          .map((p) => ({ ...p.contact, lead_id: idByPhone[p.lead.phone], created_by: profile.id }))
        const notes = chunk.filter((p) => p.note && idByPhone[p.lead.phone])
          .map((p) => ({ body: p.note, lead_id: idByPhone[p.lead.phone], user_id: profile.id }))
        if (contacts.length) { const { error } = await supabase.from('contacts').insert(contacts); if (error) throw error }
        if (notes.length) { const { error } = await supabase.from('notes').insert(notes); if (error) throw error }
      }
      setResult(stats)
      setRows(null)
    } catch (e) {
      setError('Import abgebrochen: ' + e.message)
      setResult(stats.imported ? stats : null)
    }
    setBusy(false)
    setProgress('')
  }

  return (
    <>
      <h1>CSV-Import</h1>

      <div className="panel">
        <div className="row spread">
          <div>
            <input type="file" accept=".csv,.txt,text/csv" onChange={onFile} style={{ width: 'auto' }} disabled={busy} />
            <p className="small muted">Trennzeichen (; oder ,) wird automatisch erkannt. Pflicht: Firma und Telefon. Dubletten (gleiche Telefonnummer) und gesperrte Nummern werden übersprungen.</p>
          </div>
          <button onClick={downloadTemplate}>Vorlage herunterladen</button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      {result && (
        <div className="panel">
          <h2 className="success">Import abgeschlossen</h2>
          <dl className="kv">
            <dt>Zeilen in Datei</dt><dd>{result.total}</dd>
            <dt>Importiert</dt><dd><strong>{result.imported}</strong></dd>
            <dt>Schon vorhanden</dt><dd>{result.dupDb}</dd>
            <dt>Doppelt in Datei</dt><dd>{result.dupFile}</dd>
            <dt>Gesperrt</dt><dd>{result.blocked}</dd>
            <dt>Ungültig</dt><dd>{result.invalid.length}{result.invalid.length > 0 && <span className="muted small"> (Zeilen {result.invalid.slice(0, 30).join(', ')}{result.invalid.length > 30 ? ' …' : ''})</span>}</dd>
          </dl>
        </div>
      )}

      {rows && (
        <>
          <div className="panel">
            <h2>{rows.length} Zeilen erkannt – Spalten zuordnen</h2>
            <div className="grid grid-4">
              {TARGETS.map(([key, label]) => (
                <div key={key}>
                  <label>{label}</label>
                  <select value={mapping[key] ?? ''} onChange={(e) => setMapping({ ...mapping, [key]: e.target.value || undefined })}>
                    <option value="">– nicht importieren –</option>
                    {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <h2>Vorschau (erste 5 Zeilen)</h2>
            <div className="table-wrap">
              <table>
                <thead><tr>{TARGETS.filter(([k]) => mapping[k]).map(([k, l]) => <th key={k}>{l}</th>)}</tr></thead>
                <tbody>
                  {rows.slice(0, 5).map((r, i) => (
                    <tr key={i}>{TARGETS.filter(([k]) => mapping[k]).map(([k]) => <td key={k}>{r[mapping[k]]}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel grid grid-3">
            <div>
              <label>Name der Liste *</label>
              <input value={listName} onChange={(e) => setListName(e.target.value)} />
            </div>
            <div>
              <label>Direkt zuweisen an (optional)</label>
              <select value={assignTo} onChange={(e) => setAssignTo(e.target.value)}>
                <option value="">– niemandem –</option>
                {profiles.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label>&nbsp;</label>
              <button className="primary" onClick={runImport} disabled={busy} style={{ width: '100%' }}>
                {busy ? progress || 'Importiere…' : `${rows.length} Zeilen importieren`}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
