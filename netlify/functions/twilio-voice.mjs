import twilio from 'twilio'
import { fnUrl, isAllowedNumber, recordingMode, supabaseAdmin, twilioParams, xml } from '../lib/server.mjs'

// Voice-URL der TwiML-App (ausgehend aus dem Browser) und der Twilio-Rufnummern (eingehend).
export default async (req) => {
  const p = await twilioParams(req)
  if (!p) return new Response('Forbidden', { status: 403 })
  const db = supabaseAdmin()
  const vr = new twilio.twiml.VoiceResponse()

  // --- Ausgehend: Anruf kommt aus dem Browser (From = client:<user-id>) ---
  if (p.From?.startsWith('client:')) {
    const userId = p.From.slice('client:'.length)
    const to = p.To
    if (!isAllowedNumber(to)) {
      vr.say({ language: 'de-DE' }, 'Diese Rufnummer ist nicht freigegeben.')
      return xml(vr)
    }

    const { data: profile } = await db.from('profiles').select('caller_id, active').eq('id', userId).single()
    if (!profile?.active) { vr.reject(); return xml(vr) }
    const callerId = profile.caller_id || process.env.TWILIO_CALLER_ID

    // Anrufzeile wurde vom Browser angelegt – Twilio-ID ergänzen
    if (p.callId) {
      await db.from('calls').update({ provider_sid: p.CallSid, from_number: callerId, to_number: to })
        .eq('id', p.callId).eq('user_id', userId)
    }

    // Nur im Modus "announce" wird automatisch mit Ansage aufgezeichnet.
    // Im Modus "manual" startet der Agent die Aufnahme nach Zustimmung (Funktion twilio-record).
    const announce = recordingMode() === 'announce'
    const dial = vr.dial({
      callerId,
      answerOnBridge: true,
      timeout: 30,
      ...(announce && {
        record: 'record-from-answer-dual',
        recordingStatusCallback: fnUrl(req, 'twilio-recording'),
        recordingStatusCallbackEvent: ['completed'],
      }),
    })
    dial.number({
      ...(announce && { url: fnUrl(req, 'twilio-announce') }),
      statusCallback: fnUrl(req, 'twilio-status'),
      statusCallbackEvent: ['answered', 'completed'],
    }, to)
    return xml(vr)
  }

  // --- Eingehend: Rückruf auf eine Twilio-Nummer ---
  const from = p.From
  const { data: lead } = await db.from('leads').select('id, assigned_to').eq('phone', from).maybeSingle()
  let userId = lead?.assigned_to ?? null
  if (lead) {
    const { data: last } = await db.from('calls').select('user_id').eq('lead_id', lead.id)
      .eq('direction', 'outbound').order('started_at', { ascending: false }).limit(1).maybeSingle()
    userId = last?.user_id ?? userId
  }

  await db.from('calls').insert({
    lead_id: lead?.id ?? null,
    user_id: userId,
    direction: 'inbound',
    from_number: from,
    to_number: p.To,
    provider_sid: p.CallSid,
  })

  if (!userId) {
    await db.from('calls').update({ missed: true, ended_at: new Date().toISOString() }).eq('provider_sid', p.CallSid)
    vr.say({ language: 'de-DE' }, 'Vielen Dank für Ihren Anruf. Wir rufen Sie schnellstmöglich zurück.')
    return xml(vr)
  }

  const dial = vr.dial({ timeout: 25, action: fnUrl(req, 'twilio-inbound-done') })
  dial.client({}, userId)
  return xml(vr)
}
