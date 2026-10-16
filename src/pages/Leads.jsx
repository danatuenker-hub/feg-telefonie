import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useProfiles } from '../lib/useProfiles'
import { buildLeadQuery, filtersFromParams } from '../lib/leadQuery'
import { OUTCOMES, STATUSES, outcomeLabel, statusLabel } from '../lib/constants'
import { formatPhone } from '../lib/phone'
import { fmtDateTime } from '../lib/format'
import MultiSelect from '../components/MultiSelect'

const PAGE_SIZE = 50

export default function Leads() {
  const { isAdmin } = useAuth()
  const profiles = useProfiles()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const filters = useMemo(() => filtersFromParams(params), [params])
  const page = Number(params.get('page') || 0)

  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [values, setValues] = useState({ industries: [], states: [] })
  const [lists, setLists] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [allMatching, setAllMatching] = useState(false)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    supabase.rpc('lead_filter_values').then(({ data }) => data && setValues(data))
    supabase.from('lead_lists').select('id, name').order('created_at', { ascending: false })
      .then(({ data }) => setLists(data ?? []))
  }, [])

  useEffect(() => {
    setLoading(true)
    buildLeadQuery(filters, { count: true })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
      .then(({ data, count, error }) => {
        setError(error?.message ?? '')
        setRows(data ?? [])
        setTotal(count ?? 0)
        setLoading(false)
      })
  }, [filters, page, reload])

  useEffect(() => { setSelected(new Set()); setAllMatching(false) }, [filters])

  function setFilter(key, value) {
    const next = new URLSearchParams(params)
    const v = Array.isArray(value) ? value.join('|') : value
    if (v) next.set(key, v); else next.delete(key)
    next.delete('page')
    setParams(next, { replace: true })
  }
  const arr = (k) => (filters[k] ? filters[k].split('|') : [])
  const setPage = (p) => { const next = new URLSearchParams(params); next.set('page', p); setParams(next) }

  const nameOf = (id) => profiles.find((p) => p.id === id)?.name ?? '–'
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const allOnPageSelected = rows.length > 0 && rows.every((r) => selected.has(r.id))

  function toggleAll() {
    const s = new Set(selected)
    rows.forEach((r) => (allOnPageSelected ? s.delete(r.id) : s.add(r.id)))
    setSelected(s)
    setAllMatching(false)
  }
  function toggle(id) {
    const s = new Set(selected)
    s.has(id) ? s.delete(id) : s.add(id)
    setSelected(s)
    setAllMatching(false)
  }

  // IDs für Sammelaktionen: entweder die Auswahl oder alle Treffer des Filters
  async function targetIds() {
    if (!allMatching) return [...selected]
    const ids = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await buildLeadQuery(filters, { select: 'id' }).range(from, from + 999)
      if (error) throw error
      ids.push(...data.map((r) => r.id))
      if (data.length < 1000) break
    }
    return ids
  }

  async function bulkUpdate(patch, confirmText) {
    const count = allMatching ? total : selected.size
    if (confirmText && !confirm(confirmText.replace('{n}', count))) return
    try {
      const ids = await targetIds()
      for (let i = 0; i < ids.length; i += 200) {
        const { error } = await supabase.from('leads').update(patch).in('id', ids.slice(i, i + 200))
        if (error) throw error
      }
      setSelected(new Set())
      setAllMatching(false)
      setReload((r) => r + 1)
    } catch (e) {
      alert('Fehler: ' + e.message)
    }
  }

  async function bulkDelete() {
    const count = allMatching ? total : selected.size
    if (!confirm(`${count} Leads endgültig löschen? Anrufhistorie bleibt erhalten, Notizen werden gelöscht.`)) return
    try {
      const ids = await targetIds()
      for (let i = 0; i < ids.length; i += 200) {
        const { error } = await supabase.from('leads').delete().in('id', ids.slice(i, i + 200))
        if (error) throw error
      }
      setSelected(new Set())
      setAllMatching(false)
      setReload((r) => r + 1)
    } catch (e) {
      alert('Fehler: ' + e.message)
    }
  }

  const employees = profiles.filter((p) => p.active)
  const selCount = allMatching ? total : selected.size

  return (
    <>
      <div className="row spread">
        <h1>Leads <span className="muted small">({total.toLocaleString('de-DE')} Treffer)</span></h1>
        <div className="row">
          <button onClick={() => setFilter('due', filters.due ? '' : '1')} className={filters.due ? 'primary' : ''}>
            Wiedervorlage fällig
          </button>
          <button onClick={() => setParams({}, { replace: true })}>Filter zurücksetzen</button>
        </div>
      </div>

      <div className="panel filters">
        <div>
          <label>Suche (Firma, Telefon, E-Mail, Ort)</label>
          <input defaultValue={filters.q ?? ''} key={filters.q ?? ''}
            onKeyDown={(e) => e.key === 'Enter' && setFilter('q', e.target.value.trim())}
            onBlur={(e) => e.target.value.trim() !== (filters.q ?? '') && setFilter('q', e.target.value.trim())}
            placeholder="Enter zum Suchen" />
        </div>
        <div>
          <label>Branche</label>
          <MultiSelect options={values.industries} value={arr('industry')} onChange={(v) => setFilter('industry', v)} />
        </div>
        <div>
          <label>Bundesland</label>
          <MultiSelect options={values.states} value={arr('state')} onChange={(v) => setFilter('state', v)} />
        </div>
        <div>
          <label>PLZ von – bis</label>
          <div className="row" style={{ flexWrap: 'nowrap', gap: 6 }}>
            <input defaultValue={filters.zipFrom ?? ''} key={'zf' + (filters.zipFrom ?? '')} placeholder="z. B. 80"
              onBlur={(e) => setFilter('zipFrom', e.target.value.replace(/\D/g, ''))} />
            <input defaultValue={filters.zipTo ?? ''} key={'zt' + (filters.zipTo ?? '')} placeholder="z. B. 85"
              onBlur={(e) => setFilter('zipTo', e.target.value.replace(/\D/g, ''))} />
          </div>
        </div>
        <div>
          <label>Ort</label>
          <input defaultValue={filters.city ?? ''} key={'c' + (filters.city ?? '')}
            onBlur={(e) => setFilter('city', e.target.value.trim())}
            onKeyDown={(e) => e.key === 'Enter' && setFilter('city', e.target.value.trim())} />
        </div>
        <div>
          <label>Status</label>
          <MultiSelect options={STATUSES} value={arr('status')} onChange={(v) => setFilter('status', v)} />
        </div>
        <div>
          <label>Letztes Ergebnis</label>
          <MultiSelect options={OUTCOMES} value={arr('outcome')} onChange={(v) => setFilter('outcome', v)} />
        </div>
        <div>
          <label>Letzter Anruf von – bis</label>
          <div className="row" style={{ flexWrap: 'nowrap', gap: 6 }}>
            <input type="date" value={filters.lastFrom ?? ''} onChange={(e) => setFilter('lastFrom', e.target.value)} />
            <input type="date" value={filters.lastTo ?? ''} onChange={(e) => setFilter('lastTo', e.target.value)} />
          </div>
        </div>
        <div>
          <label>Anrufversuche min – max</label>
          <div className="row" style={{ flexWrap: 'nowrap', gap: 6 }}>
            <input type="number" min="0" value={filters.minCalls ?? ''} onChange={(e) => setFilter('minCalls', e.target.value)} />
            <input type="number" min="0" value={filters.maxCalls ?? ''} onChange={(e) => setFilter('maxCalls', e.target.value)} />
          </div>
        </div>
        <div>
          <label>Importliste</label>
          <select value={filters.list ?? ''} onChange={(e) => setFilter('list', e.target.value)}>
            <option value="">Alle</option>
            {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        {isAdmin && (
          <div>
            <label>Zugewiesen an</label>
            <select value={filters.assigned ?? ''} onChange={(e) => setFilter('assigned', e.target.value)}>
              <option value="">Alle</option>
              <option value="none">– nicht zugewiesen –</option>
              {employees.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label>Sortierung</label>
          <select value={filters.sort ?? 'company'} onChange={(e) => setFilter('sort', e.target.value)}>
            <option value="company">Firma A–Z</option>
            <option value="zip">PLZ</option>
            <option value="last_call">Letzter Anruf (neueste)</option>
            <option value="followup">Wiedervorlage (früheste)</option>
            <option value="created">Neu importiert</option>
          </select>
        </div>
        <div>
          <label>&nbsp;</label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', color: 'var(--text)', fontSize: 13 }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={!!filters.never}
              onChange={(e) => setFilter('never', e.target.checked ? '1' : '')} />
            Noch nie angerufen
          </label>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {isAdmin && <th style={{ width: 30 }}><input type="checkbox" checked={allOnPageSelected} onChange={toggleAll} /></th>}
              <th>Firma</th>
              <th>Telefon</th>
              <th>PLZ / Ort</th>
              <th>Branche</th>
              <th>Status</th>
              <th>Letztes Ergebnis</th>
              <th>Versuche</th>
              <th>Letzter Anruf</th>
              <th>Wiedervorlage</th>
              {isAdmin && <th>Mitarbeiter</th>}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={11} className="muted">Lädt…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={11} className="muted">Keine Leads gefunden.</td></tr>}
            {!loading && rows.map((r) => {
              const due = r.next_followup_at && new Date(r.next_followup_at) <= new Date()
              return (
                <tr key={r.id} className="clickable" onClick={() => navigate(`/leads/${r.id}`)}>
                  {isAdmin && (
                    <td onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(r.id) || allMatching} onChange={() => toggle(r.id)} />
                    </td>
                  )}
                  <td><strong>{r.company}</strong></td>
                  <td>{formatPhone(r.phone)}</td>
                  <td>{[r.zip, r.city].filter(Boolean).join(' ')}</td>
                  <td>{r.industry ?? '–'}</td>
                  <td><span className={`badge ${r.status}`}>{statusLabel(r.status)}</span></td>
                  <td>{r.last_outcome ? outcomeLabel(r.last_outcome) : '–'}</td>
                  <td>{r.call_count}</td>
                  <td>{fmtDateTime(r.last_call_at)}</td>
                  <td>{r.next_followup_at ? <span className={due ? 'badge due' : ''}>{fmtDateTime(r.next_followup_at)}</span> : '–'}</td>
                  {isAdmin && <td>{r.assigned_to ? nameOf(r.assigned_to) : <span className="muted">–</span>}</td>}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="row spread" style={{ marginTop: 12 }}>
        <span className="muted">Seite {page + 1} von {pages}</span>
        <div className="row">
          <button disabled={page === 0} onClick={() => setPage(page - 1)}>‹ Zurück</button>
          <button disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Weiter ›</button>
        </div>
      </div>

      {isAdmin && selCount > 0 && (
        <div className="bulkbar row">
          <strong>{selCount.toLocaleString('de-DE')} ausgewählt</strong>
          {!allMatching && allOnPageSelected && total > rows.length && (
            <button className="link" style={{ color: '#9db8ff' }} onClick={() => setAllMatching(true)}>
              Alle {total.toLocaleString('de-DE')} Treffer auswählen
            </button>
          )}
          <select defaultValue="" onChange={(e) => {
            const v = e.target.value
            e.target.value = ''
            if (v) bulkUpdate({ assigned_to: v === 'none' ? null : v },
              v === 'none' ? 'Zuweisung für {n} Leads entfernen?' : `{n} Leads an ${nameOf(v)} zuweisen?`)
          }}>
            <option value="" disabled>Zuweisen an…</option>
            {employees.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            <option value="none">– Zuweisung entfernen –</option>
          </select>
          <select defaultValue="" onChange={(e) => {
            const v = e.target.value
            e.target.value = ''
            if (v) bulkUpdate({ status: v }, `Status von {n} Leads auf „${statusLabel(v)}“ setzen?`)
          }}>
            <option value="" disabled>Status setzen…</option>
            {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <button className="danger" onClick={bulkDelete}>Löschen</button>
          <button onClick={() => { setSelected(new Set()); setAllMatching(false) }}>Abbrechen</button>
        </div>
      )}
    </>
  )
}
