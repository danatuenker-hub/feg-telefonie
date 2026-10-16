import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'

export const supabaseAdmin = () =>
  createClient(new URL(process.env.VITE_SUPABASE_URL.trim()).origin, process.env.SUPABASE_SERVICE_ROLE_KEY.trim(), {
    auth: { persistSession: false },
  })

export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export const xml = (twiml) =>
  new Response(twiml.toString(), { headers: { 'Content-Type': 'text/xml' } })

// Angemeldeten Benutzer (inkl. Profil) aus dem Supabase-Token im Authorization-Header lesen
export async function requireUser(req, db) {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer /, '')
  if (!token) return null
  const { data } = await db.auth.getUser(token)
  if (!data?.user) return null
  const { data: profile } = await db.from('profiles').select('*').eq('id', data.user.id).single()
  return profile?.active ? profile : null
}

// Twilio-Webhook lesen und Signatur prüfen. Gibt null zurück, wenn die Anfrage nicht von Twilio stammt.
export async function twilioParams(req) {
  const body = new URLSearchParams(await req.text())
  const params = Object.fromEntries(body)
  const url = publicUrl(req)
  const ok = twilio.validateRequest(process.env.TWILIO_AUTH_TOKEN, req.headers.get('x-twilio-signature') ?? '', url, params)
  if (!ok) {
    console.warn('Ungültige Twilio-Signatur für', url)
    return null
  }
  return params
}

// Öffentliche URL der Anfrage (so, wie Twilio sie aufgerufen hat)
export function publicUrl(req) {
  const u = new URL(req.url)
  const host = req.headers.get('x-forwarded-host') ?? u.host
  return `https://${host}${u.pathname}${u.search}`
}

export const fnUrl = (req, name, query = '') => {
  const u = new URL(publicUrl(req))
  return `${u.origin}/.netlify/functions/${name}${query}`
}

// Nur Deutschland und Österreich
export const ALLOWED_PREFIXES = ['+49', '+43']
export const isAllowedNumber = (n) => /^\+\d{6,15}$/.test(n ?? '') && ALLOWED_PREFIXES.some((p) => n.startsWith(p))
