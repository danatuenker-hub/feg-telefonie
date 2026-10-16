import twilio from 'twilio'
import { json, requireUser, supabaseAdmin } from '../lib/server.mjs'

// Gibt dem Browser ein Zugangstoken für das Twilio Voice SDK (1 Stunde gültig).
const REQUIRED = ['TWILIO_ACCOUNT_SID', 'TWILIO_API_KEY', 'TWILIO_API_SECRET', 'TWILIO_TWIML_APP_SID', 'TWILIO_AUTH_TOKEN', 'SUPABASE_SERVICE_ROLE_KEY', 'VITE_SUPABASE_URL']

export default async (req) => {
  const missing = REQUIRED.filter((k) => !process.env[k]?.trim())
  if (missing.length) return json({ error: `In Netlify fehlt: ${missing.join(', ')}` }, 500)

  let user
  try {
    user = await requireUser(req, supabaseAdmin())
  } catch (e) {
    return json({ error: `Supabase-Prüfung fehlgeschlagen: ${e.message}` }, 500)
  }
  if (!user) return json({ error: 'Nicht angemeldet oder Profil inaktiv (SUPABASE_SERVICE_ROLE_KEY prüfen)' }, 401)

  const { AccessToken } = twilio.jwt
  const token = new AccessToken(
    process.env.TWILIO_ACCOUNT_SID.trim(),
    process.env.TWILIO_API_KEY.trim(),
    process.env.TWILIO_API_SECRET.trim(),
    { identity: user.id, ttl: 3600 },
  )
  token.addGrant(new AccessToken.VoiceGrant({
    outgoingApplicationSid: process.env.TWILIO_TWIML_APP_SID.trim(),
    incomingAllow: true,
  }))
  return json({ token: token.toJwt(), identity: user.id })
}
