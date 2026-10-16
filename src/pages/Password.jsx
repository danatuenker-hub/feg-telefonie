import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Password({ onDone }) {
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [msg, setMsg] = useState('')

  async function submit(e) {
    e.preventDefault()
    if (pw.length < 8) return setMsg('Mindestens 8 Zeichen.')
    if (pw !== pw2) return setMsg('Die Passwörter stimmen nicht überein.')
    const { error } = await supabase.auth.updateUser({ password: pw })
    if (error) return setMsg('Fehler: ' + error.message)
    setPw(''); setPw2('')
    setMsg('Passwort gespeichert.')
    onDone?.()
  }

  return (
    <form className="panel grid" style={{ maxWidth: 360 }} onSubmit={submit}>
      <h2>Passwort ändern</h2>
      <div><label>Neues Passwort</label><input type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
      <div><label>Wiederholen</label><input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></div>
      {msg && <div>{msg}</div>}
      <button className="primary">Speichern</button>
    </form>
  )
}
