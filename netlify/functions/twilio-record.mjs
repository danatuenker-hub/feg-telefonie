import twilio from 'twilio'
import { fnUrl, json, recordingMode, requireUser, supabaseAdmin } from '../lib/server.mjs'

// Startet die Aufnahme eines laufenden Gesprächs – erst nachdem der Kunde mündlich zugestimmt hat.
export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (recordingMode() !== 'manual') return json({ error: 'Manuelle Aufnahme ist nicht aktiviert.' }, 400)
  const db = supabaseAdmin()
  const user = await requireUser(req, db)
  if (!user) return json({ error: 'Nicht angemeldet' }, 401)

  const { callId } = await req.json()
  const { data: call } = await db.from('calls').select('id, user_id, provider_sid, recording_url').eq('id', callId).maybeSingle()
  if (!call || call.user_id !== user.id) return json({ error: 'Anruf nicht gefunden' }, 404)
  if (!call.provider_sid) return json({ error: 'Das Gespräch ist noch nicht verbunden.' }, 409)

  const client = twilio(process.env.TWILIO_API_KEY.trim(), process.env.TWILIO_API_SECRET.trim(), {
    accountSid: process.env.TWILIO_ACCOUNT_SID.trim(),
  })
  try {
    await client.calls(call.provider_sid).recordings.create({
      recordingChannels: 'dual',
      recordingStatusCallback: fnUrl(req, 'twilio-recording'),
      recordingStatusCallbackEvent: ['completed'],
    })
  } catch (e) {
    return json({ error: `Aufnahme konnte nicht gestartet werden: ${e.message}` }, 500)
  }
  return json({ ok: true })
}
