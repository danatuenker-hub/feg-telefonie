import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { usePhone } from '../lib/telephony'
import { formatPhone } from '../lib/phone'
import { fmtDuration } from '../lib/format'

const STATE_LABEL = { connecting: 'Verbinde…', ringing: 'Klingelt…', open: 'Verbunden', ended: 'Beendet' }

// Schwebende Anrufleiste unten rechts: laufender Anruf und eingehende Rückrufe.
export default function CallBar() {
  const { call, incoming, hangup, toggleMute, sendDigits, acceptIncoming, rejectIncoming, recordingMode, startRecording } = usePhone()
  const [now, setNow] = useState(Date.now())
  const [keypad, setKeypad] = useState(false)

  useEffect(() => {
    if (!call || call.state === 'ended') return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [call])

  if (incoming) {
    return (
      <div className="callbar ringing-in">
        <div><strong>Eingehender Anruf</strong><div>{formatPhone(incoming.parameters.From)}</div></div>
        <div className="row">
          <button className="ok" onClick={acceptIncoming}>Annehmen</button>
          <button className="danger" onClick={rejectIncoming}>Ablehnen</button>
        </div>
      </div>
    )
  }
  if (!call || call.state === 'ended') return null

  const secs = call.answeredAt ? (now - call.answeredAt) / 1000 : 0
  return (
    <div className="callbar">
      <div>
        <strong>{call.lead ? <Link to={`/leads/${call.lead.id}`}>{call.lead.company}</Link> : 'Anruf'}</strong>
        <div className="small">{formatPhone(call.number)} · {STATE_LABEL[call.state]}{call.state === 'open' && ` · ${fmtDuration(secs)}`}</div>
      </div>
      <div className="row">
        {recordingMode === 'manual' && call.state === 'open' && call.callId && (
          call.recording === 'on'
            ? <span className="rec-on">● Aufnahme läuft</span>
            : <button className="rec" disabled={call.recording === 'starting'} onClick={startRecording}
                title="Nur nach ausdrücklicher Zustimmung des Kunden starten">● Aufnahme starten</button>
        )}
        <button onClick={toggleMute}>{call.muted ? 'Ton an' : 'Stumm'}</button>
        <button onClick={() => setKeypad(!keypad)}>Tasten</button>
        <button className="danger-fill" onClick={hangup}>Auflegen</button>
      </div>
      {keypad && (
        <div className="keypad">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((d) => (
            <button key={d} onClick={() => sendDigits(d)}>{d}</button>
          ))}
        </div>
      )}
    </div>
  )
}
