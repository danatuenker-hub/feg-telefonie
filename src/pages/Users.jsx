import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

export default function Users() {
  const { session, profile: me } = useAuth()
  const [profiles, setProfiles] = useState([])
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'mitarbeiter' })
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => supabase.from('profiles').select('*').order('name').then(({ data }) => setProfiles(data ?? []))
  useEffect(() => { load() }, [])

  async function update(id, patch) {
    const { error } = await supabase.from('profiles').update(patch).eq('id', id)
    if (error) alert(error.message)
    load()
  }

  async function create(e) {
    e.preventDefault()
    setBusy(true)
    setMsg('')
    const res = await fetch('/.netlify/functions/create-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(form),
    })
    const body = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) return setMsg('Fehler: ' + (body.error ?? res.statusText))
    setMsg(`${form.name} wurde angelegt. Zugangsdaten bitte persönlich weitergeben.`)
    setForm({ name: '', email: '', password: '', role: 'mitarbeiter' })
    load()
  }

  return (
    <>
      <h1>Mitarbeiter</h1>
      <div className="table-wrap" style={{ marginBottom: 16 }}>
        <table>
          <thead><tr><th>Name</th><th>E-Mail</th><th>Rolle</th><th>Anzeige-Rufnummer</th><th>Aktiv</th></tr></thead>
          <tbody>
            {profiles.map((p) => (
              <tr key={p.id}>
                <td><input defaultValue={p.name} onBlur={(e) => e.target.value !== p.name && update(p.id, { name: e.target.value })} /></td>
                <td>{p.email}</td>
                <td>
                  <select value={p.role} disabled={p.id === me.id} onChange={(e) => update(p.id, { role: e.target.value })}>
                    <option value="mitarbeiter">Mitarbeiter</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td><input defaultValue={p.caller_id ?? ''} placeholder="+49…" onBlur={(e) => e.target.value !== (p.caller_id ?? '') && update(p.id, { caller_id: e.target.value.trim() || null })} /></td>
                <td><input type="checkbox" style={{ width: 'auto' }} checked={p.active} disabled={p.id === me.id} onChange={(e) => update(p.id, { active: e.target.checked })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form className="panel grid grid-4" onSubmit={create}>
        <h2 style={{ gridColumn: '1 / -1' }}>Neuen Zugang anlegen</h2>
        <div><label>Name</label><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div><label>E-Mail</label><input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
        <div><label>Startpasswort (min. 8 Zeichen)</label><input required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
        <div>
          <label>Rolle</label>
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="mitarbeiter">Mitarbeiter</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div><button className="primary" disabled={busy}>Anlegen</button></div>
        {msg && <div style={{ gridColumn: '1 / -1' }}>{msg}</div>}
      </form>
    </>
  )
}
