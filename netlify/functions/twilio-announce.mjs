import twilio from 'twilio'
import { twilioParams, xml } from '../lib/server.mjs'

// Wird dem Angerufenen beim Abheben vorgespielt, bevor das Gespräch verbunden wird.
export default async (req) => {
  if (!(await twilioParams(req))) return new Response('Forbidden', { status: 403 })
  const vr = new twilio.twiml.VoiceResponse()
  vr.say({ language: 'de-DE', voice: 'Polly.Vicki' }, 'Hinweis: Dieses Gespräch wird zur Qualitätssicherung aufgezeichnet.')
  return xml(vr)
}
