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
import Appointments from './pages/Appointments'
import AppointmentDetail from './pages/AppointmentDetail'
import Availability from './pages/Availability'
import BeraterCalendar from './pages/BeraterCalendar'
import { roleLabel } from './lib/constants'
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

  const isBerater = profile.role === 'berater'

  return (
    <PhoneProvider>
    <div className="layout">
      <nav className="sidebar">
        <div className="brand">FEG Telefonie</div>
        {isBerater ? (
          <>
            <NavLink to="/termine">Meine Termine</NavLink>
            <NavLink to="/verfuegbarkeit">Verfügbarkeit</NavLink>
          </>
        ) : (
          <>
            <NavLink to="/leads">Leads</NavLink>
            <NavLink to="/dialer">Power Dialer</NavLink>
            <NavLink to="/wiedervorlagen">Wiedervorlagen</NavLink>
            <NavLink to="/termine">Termine</NavLink>
            <NavLink to="/kalender">Berater-Kalender</NavLink>
            <NavLink to="/auswertung">Auswertung</NavLink>
          </>
        )}
        {isAdmin && <NavLink to="/verfuegbarkeit">Verfügbarkeiten</NavLink>}
        {isAdmin && <NavLink to="/import">CSV-Import</NavLink>}
        {isAdmin && <NavLink to="/mitarbeiter">Mitarbeiter</NavLink>}
        <div className="sidebar-foot">
          {!isBerater && <PhoneStatus />}
          <div>{profile.name}</div>
          <div className="muted small">{roleLabel(profile.role)}</div>
          <NavLink to="/konto" style={{ padding: '4px 0', background: 'none' }}>Passwort ändern</NavLink>
          <button className="link" onClick={signOut}>Abmelden</button>
        </div>
      </nav>
      <main className="content">
        <Routes>
          <Route path="/termine" element={<Appointments />} />
          <Route path="/termine/:id" element={<AppointmentDetail />} />
          <Route path="/verfuegbarkeit" element={<Availability />} />
          <Route path="/konto" element={<Password />} />
          {!isBerater && <Route path="/leads" element={<Leads />} />}
          {!isBerater && <Route path="/leads/:id" element={<LeadDetail />} />}
          {!isBerater && <Route path="/wiedervorlagen" element={<Followups />} />}
          {!isBerater && <Route path="/dialer" element={<Dialer />} />}
          {!isBerater && <Route path="/auswertung" element={<Stats />} />}
          {!isBerater && <Route path="/kalender" element={<BeraterCalendar />} />}
          {isAdmin && <Route path="/import" element={<Import />} />}
          {isAdmin && <Route path="/mitarbeiter" element={<Users />} />}
          <Route path="*" element={<Navigate to={isBerater ? '/termine' : '/leads'} replace />} />
        </Routes>
      </main>
      <CallBar />
    </div>
    </PhoneProvider>
  )
}

function PhoneStatus() {
  const { status, error, reconnect } = usePhone()
  const label = { ready: 'Telefon bereit', offline: 'Telefon verbindet…', unavailable: 'Telefon nicht verfügbar' }[status]
  return (
    <div style={{ padding: '0 0 8px' }}>
      <div className="phone-status" style={{ padding: 0 }}><span className={`dot ${status}`} />{label}</div>
      {error && <div className="small" style={{ color: '#f0a3a3', wordBreak: 'break-word', margin: '4px 0' }}>{error}</div>}
      {status !== 'ready' && <button className="link small" onClick={reconnect}>Erneut verbinden</button>}
    </div>
  )
}
