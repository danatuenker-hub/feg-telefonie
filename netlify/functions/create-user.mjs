import { createClient } from '@supabase/supabase-js'

// Legt einen neuen Benutzer an. Nur für Admins.
// Benötigt in Netlify: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const admin = createClient(new URL(process.env.VITE_SUPABASE_URL.trim()).origin, process.env.SUPABASE_SERVICE_ROLE_KEY.trim(), {
    auth: { persistSession: false },
  })

  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer /, '')
  const { data: caller } = await admin.auth.getUser(token)
  if (!caller?.user) return json({ error: 'Nicht angemeldet' }, 401)
  const { data: callerProfile } = await admin.from('profiles').select('role, active').eq('id', caller.user.id).single()
  if (callerProfile?.role !== 'admin' || !callerProfile.active) return json({ error: 'Nur für Admins' }, 403)

  const { name, email, password, role } = await req.json()
  if (!name || !email || !password || password.length < 8) return json({ error: 'Name, E-Mail und Passwort (min. 8 Zeichen) angeben' }, 400)

  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { name },
  })
  if (error) return json({ error: error.message }, 400)

  await admin.from('profiles').update({ name, role: role === 'admin' ? 'admin' : 'mitarbeiter' }).eq('id', data.user.id)
  return json({ id: data.user.id })
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
