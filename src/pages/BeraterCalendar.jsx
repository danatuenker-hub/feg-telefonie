import { useState } from 'react'
import AvailabilityOverview from '../components/AvailabilityOverview'

// Übersicht der freien Zeiten aller Berater – damit das Callcenter vor dem Gespräch weiß, wann Termine möglich sind.
export default function BeraterCalendar() {
  const [zip, setZip] = useState('')
  return (
    <>
      <div className="row spread">
        <h1>Berater-Kalender</h1>
        <div style={{ width: 220 }}>
          <input value={zip} onChange={(e) => setZip(e.target.value.replace(/\D/g, '').slice(0, 5))} placeholder="PLZ des Kunden (optional)" />
        </div>
      </div>
      <p className="muted">Grün = frei. Belegte Zeiten, Abwesenheiten und vergangene Zeiten sind ausgeblendet. Termine selbst werden beim Lead über das Ergebnis „Termin vereinbart“ gelegt.</p>
      <div className="panel">
        <AvailabilityOverview key={zip.length === 5 ? zip : ''} zip={zip.length === 5 ? zip : undefined} />
      </div>
    </>
  )
}
