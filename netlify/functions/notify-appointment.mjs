import { json, publicUrl, requireUser, supabaseAdmin } from '../lib/server.mjs'
import { appointmentMessage, telegramConfigured, tg } from '../lib/telegram.mjs'

// Schickt dem Berater eine Telegram-Nachricht zu einem Termin (neu / geändert / abgesagt).
export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const db = supabaseAdmin()
  const user = await requireUser(req, db)
  if (!user) return json({ error: 'Nicht angemeldet' }, 401)

  const { appointmentId, event = 'created' } = await req.json()
  const { data: a } = await db.from('appointments').select('*').eq('id', appointmentId).maybeSingle()
  if (!a) return json({ error: 'Termin nicht gefunden' }, 404)
  if (user.role !== 'admin' && a.created_by !== user.id && a.berater_id !== user.id) return json({ error: 'Kein Zugriff' }, 403)

  if (!telegramConfigured()) return json({ sent: false, reason: 'Telegram ist nicht eingerichtet' })
  const { data: berater } = await db.from('profiles').select('name, telegram_chat_id').eq('id', a.berater_id).single()
  if (!berater?.telegram_chat_id) return json({ sent: false, reason: `${berater?.name ?? 'Berater'} hat Telegram noch nicht verbunden` })

  const { data: creator } = await db.from('profiles').select('name').eq('id', a.created_by).maybeSingle()
  const appUrl = new URL(publicUrl(req)).origin
  try {
    await tg('sendMessage', {
      chat_id: berater.telegram_chat_id,
      text: appointmentMessage(a, { event, creator: creator?.name, appUrl }),
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    })
  } catch (e) {
    return json({ sent: false, reason: e.message })
  }
  await db.from('appointments').update({ notified_at: new Date().toISOString() }).eq('id', a.id)
  return json({ sent: true })
}
