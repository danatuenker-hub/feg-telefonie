import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError('Anmeldung fehlgeschlagen. E-Mail oder Passwort prüfen.')
    setBusy(false)
  }

  async function resetPassword() {
    if (!email) return setError('Bitte zuerst die E-Mail-Adresse eingeben.')
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
    setError('')
    alert('Falls die Adresse existiert, wurde ein Link zum Zurücksetzen verschickt.')
  }

  return (
    <div className="center">
      <form className="panel login grid" onSubmit={submit}>
        <h1>FEG Telefonie</h1>
        <div>
          <label>E-Mail</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required />
        </div>
        <div>
          <label>Passwort</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {error && <div className="error">{error}</div>}
        <button className="primary" disabled={busy}>Anmelden</button>
        <button type="button" className="link small" onClick={resetPassword}>Passwort vergessen?</button>
      </form>
    </div>
  )
}
