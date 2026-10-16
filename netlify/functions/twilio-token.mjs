import twilio from 'twilio'
import { json, requireUser, supabaseAdmin } from '../lib/server.mjs'

// Gibt dem Browser ein Zugangstoken für das Twilio Voice SDK (1 Stunde gültig).
export default async (req) => {
  const db = supabaseAdmin()
  const user = await requireUser(req, db)
  if (!user) return json({ error: 'Nicht angemeldet' }, 401)

  const { AccessToken } = twilio.jwt
  const token = new AccessToken(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_API_KEY,
    process.env.TWILIO_API_SECRET,
    { identity: user.id, ttl: 3600 },
  )
  token.addGrant(new AccessToken.VoiceGrant({
    outgoingApplicationSid: process.env.TWILIO_TWIML_APP_SID,
    incomingAllow: true,
  }))
  return json({ token: token.toJwt(), identity: user.id })
}
