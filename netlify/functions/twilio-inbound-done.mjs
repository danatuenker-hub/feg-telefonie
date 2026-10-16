import twilio from 'twilio'
import { supabaseAdmin, twilioParams, xml } from '../lib/server.mjs'

// Ende eines eingehenden Anrufs: nicht angenommen -> als verpasst markieren.
export default async (req) => {
  const p = await twilioParams(req)
  if (!p) return new Response('Forbidden', { status: 403 })
  const db = supabaseAdmin()
  const answered = p.DialCallStatus === 'completed'
  await db.from('calls').update({
    missed: !answered,
    ended_at: new Date().toISOString(),
    duration_sec: answered ? Number(p.DialCallDuration || 0) : 0,
  }).eq('provider_sid', p.CallSid)

  const vr = new twilio.twiml.VoiceResponse()
  if (!answered) vr.say({ language: 'de-DE' }, 'Leider ist gerade niemand erreichbar. Wir rufen Sie schnellstmöglich zurück.')
  return xml(vr)
}
