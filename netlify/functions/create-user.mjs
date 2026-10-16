import { json, requireUser, supabaseAdmin } from '../lib/server.mjs'

// Legt einen neuen Benutzer an. Nur für Admins.
export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const db = supabaseAdmin()
  const caller = await requireUser(req, db)
  if (caller?.role !== 'admin') return json({ error: 'Nur für Admins' }, 403)

  const { name, email, password, role } = await req.json()
  if (!name || !email || !password || password.length < 8) return json({ error: 'Name, E-Mail und Passwort (min. 8 Zeichen) angeben' }, 400)

  const { data, error } = await db.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { name },
  })
  if (error) return json({ error: error.message }, 400)

  await db.from('profiles').update({ name, role: ['admin', 'berater'].includes(role) ? role : 'mitarbeiter' }).eq('id', data.user.id)
  return json({ id: data.user.id })
}
