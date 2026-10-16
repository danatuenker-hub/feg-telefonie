import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { Device } from '@twilio/voice-sdk'
import { supabase } from './supabase'
import { useAuth } from './auth'

const PhoneContext = createContext(null)

async function fetchToken(session) {
  const res = await fetch('/.netlify/functions/twilio-token', {
    headers: { Authorization: `Bearer ${session.access_token}` },
  })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`)
  return (await res.json()).token
}

// Hält die Twilio-Verbindung des Browsers und den aktuellen Anruf.
// call.state: connecting -> ringing -> open -> ended
export function PhoneProvider({ children }) {
  const { session, profile } = useAuth()
  const deviceRef = useRef(null)
  const connRef = useRef(null)
  const [status, setStatus] = useState('offline') // offline | ready | unavailable
  const [error, setError] = useState('')
  const [call, setCall] = useState(null)
  const [incoming, setIncoming] = useState(null)
  const sessionRef = useRef(session)
  sessionRef.current = session

  useEffect(() => {
    if (!profile) return
    let device
    let cancelled = false
    ;(async () => {
      try {
        const token = await fetchToken(sessionRef.current)
        if (cancelled) return
        device = new Device(token, { codecPreferences: ['opus', 'pcmu'], edge: ['frankfurt', 'dublin'], closeProtection: true })
        device.on('registered', () => setStatus('ready'))
        device.on('error', (e) => setError(e.message))
        device.on('tokenWillExpire', async () => device.updateToken(await fetchToken(sessionRef.current)))
        device.on('incoming', (conn) => {
          setIncoming(conn)
          const clear = () => setIncoming((c) => (c === conn ? null : c))
          conn.on('cancel', clear)
          conn.on('disconnect', clear)
          conn.on('reject', clear)
        })
        await device.register()
        deviceRef.current = device
      } catch (e) {
        setStatus('unavailable')
        setError(e.message)
      }
    })()
    return () => {
      cancelled = true
      device?.destroy()
      deviceRef.current = null
      setStatus('offline')
    }
  }, [profile?.id])

  const dial = useCallback(async (lead, number = lead.phone) => {
    const device = deviceRef.current
    if (!device) throw new Error('Telefonie ist nicht verbunden.')
    if (connRef.current) throw new Error('Es läuft bereits ein Anruf.')

    const { data: row, error } = await supabase.from('calls').insert({
      lead_id: lead.id, user_id: profile.id, to_number: number, direction: 'outbound',
    }).select('id').single()
    if (error) throw error

    setCall({ lead, number, callId: row.id, state: 'connecting', startedAt: Date.now(), answeredAt: null, muted: false })
    let conn
    try {
      conn = await device.connect({ params: { To: number, callId: row.id } })
    } catch (e) {
      setCall((c) => (c?.callId === row.id ? { ...c, state: 'ended', endedAt: Date.now() } : c))
      throw e
    }
    connRef.current = conn
    const patch = (p) => setCall((c) => (c?.callId === row.id ? { ...c, ...p } : c))
    conn.on('ringing', () => patch({ state: 'ringing' }))
    conn.on('accept', () => patch({ state: 'open', answeredAt: Date.now() }))
    // Wurde das Ergebnis schon während des Gesprächs gespeichert, ist nach dem Auflegen nichts mehr zu tun
    const end = () => {
      connRef.current = null
      setCall((c) => (c?.callId !== row.id ? c : c.saved ? null : { ...c, state: 'ended', endedAt: Date.now() }))
    }
    conn.on('disconnect', end)
    conn.on('cancel', end)
    conn.on('reject', end)
    conn.on('error', (e) => { setError(e.message); end() })
    conn.on('mute', (muted) => patch({ muted }))
    return row.id
  }, [profile?.id])

  const hangup = useCallback(() => {
    if (connRef.current) connRef.current.disconnect()
    else deviceRef.current?.disconnectAll()
  }, [])

  const toggleMute = useCallback(() => {
    const c = connRef.current
    if (c) c.mute(!c.isMuted())
  }, [])

  const sendDigits = useCallback((d) => connRef.current?.sendDigits(d), [])

  // Nachbearbeitung gespeichert: beendeten Anruf vergessen bzw. laufenden als erledigt markieren
  const clearCall = useCallback(() => setCall((c) => (!c ? c : c.state === 'ended' ? null : { ...c, saved: true })), [])

  const acceptIncoming = useCallback(() => {
    if (!incoming) return
    incoming.accept()
    connRef.current = incoming
    const from = incoming.parameters.From
    setCall({ lead: null, number: from, callId: null, state: 'open', startedAt: Date.now(), answeredAt: Date.now(), muted: false, inbound: true })
    const end = () => { connRef.current = null; setCall((c) => (c?.inbound ? null : c)) }
    incoming.on('disconnect', end)
    incoming.on('mute', (muted) => setCall((c) => (c ? { ...c, muted } : c)))
    setIncoming(null)
    supabase.from('leads').select('id, company, phone').eq('phone', from).maybeSingle()
      .then(({ data }) => data && setCall((c) => (c?.inbound ? { ...c, lead: data } : c)))
  }, [incoming])

  const rejectIncoming = useCallback(() => { incoming?.reject(); setIncoming(null) }, [incoming])

  const value = { status, error, call, incoming, dial, hangup, toggleMute, sendDigits, clearCall, acceptIncoming, rejectIncoming }
  return <PhoneContext.Provider value={value}>{children}</PhoneContext.Provider>
}

export const usePhone = () => useContext(PhoneContext)
