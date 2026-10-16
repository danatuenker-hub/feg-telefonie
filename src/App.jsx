import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './lib/auth'
import Login from './pages/Login'
import Leads from './pages/Leads'
import LeadDetail from './pages/LeadDetail'
import Import from './pages/Import'
import Followups from './pages/Followups'
import Users from './pages/Users'
import Password from './pages/Password'
import Dialer from './pages/Dialer'
import Stats from './pages/Stats'
import CallBar from './components/CallBar'
import { PhoneProvider, usePhone } from './lib/telephony'

export default function App() {
  const { session, profile, profileError, isAdmin, loading, signOut, recovery, endRecovery } = useAuth()

  if (session === null) return <Login />
  if (loading) return <div className="center muted">Lädt…</div>
  if (profileError) {
    return (
      <div className="center">
        <p className="error">Angemeldet, aber Profil nicht ladbar: {profileError}</p>
        <button onClick={signOut}>Abmelden</button>
      </div>
    )
  }
  if (recovery) return <div className="center"><Password onDone={endRecovery} /></div>
  if (!profile?.active) {
    return (
      <div className="center">
        <p>Dein Zugang ist deaktiviert.</p>
        <button onClick={signOut}>Abmelden</button>
      </div>
    )
  }

  return (
    <PhoneProvider>
    <div className="layout">
      <nav className="sidebar">
        <div className="brand">FEG Telefonie</div>
        <NavLink to="/leads">Leads</NavLink>
        <NavLink to="/dialer">Power Dialer</NavLink>
        <NavLink to="/wiedervorlagen">Wiedervorlagen</NavLink>
        <NavLink to="/auswertung">Auswertung</NavLink>
        {isAdmin && <NavLink to="/import">CSV-Import</NavLink>}
        {isAdmin && <NavLink to="/mitarbeiter">Mitarbeiter</NavLink>}
        <div className="sidebar-foot">
          <PhoneStatus />
          <div>{profile.name}</div>
          <div className="muted small">{isAdmin ? 'Admin' : 'Mitarbeiter'}</div>
          <NavLink to="/konto" style={{ padding: '4px 0', background: 'none' }}>Passwort ändern</NavLink>
          <button className="link" onClick={signOut}>Abmelden</button>
        </div>
      </nav>
      <main className="content">
        <Routes>
          <Route path="/leads" element={<Leads />} />
          <Route path="/leads/:id" element={<LeadDetail />} />
          <Route path="/wiedervorlagen" element={<Followups />} />
          <Route path="/konto" element={<Password />} />
          <Route path="/dialer" element={<Dialer />} />
          <Route path="/auswertung" element={<Stats />} />
          {isAdmin && <Route path="/import" element={<Import />} />}
          {isAdmin && <Route path="/mitarbeiter" element={<Users />} />}
          <Route path="*" element={<Navigate to="/leads" replace />} />
        </Routes>
      </main>
      <CallBar />
    </div>
    </PhoneProvider>
  )
}

function PhoneStatus() {
  const { status, error } = usePhone()
  const label = { ready: 'Telefon bereit', offline: 'Telefon verbindet…', unavailable: 'Telefon nicht verfügbar' }[status]
  return <div className="phone-status" style={{ padding: '0 0 8px' }} title={error}><span className={`dot ${status}`} />{label}</div>
}
