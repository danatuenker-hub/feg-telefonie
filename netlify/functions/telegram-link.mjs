import { fnUrl, json, requireUser, supabaseAdmin } from '../lib/server.mjs'
import { linkCode, telegramConfigured, tg, webhookSecret } from '../lib/telegram.mjs'

// GET: persönlicher Start-Link für den Bot. POST (nur Admin): Webhook bei Telegram registrieren.
export default async (req) => {
  const db = supabaseAdmin()
  const user = await requireUser(req, db)
  if (!user) return json({ error: 'Nicht angemeldet' }, 401)
  if (!telegramConfigured()) return json({ error: 'TELEGRAM_BOT_TOKEN ist in Netlify nicht eingetragen.' }, 500)

  try {
    if (req.method === 'POST') {
      if (user.role !== 'admin') return json({ error: 'Nur für Admins' }, 403)
      await tg('setWebhook', { url: fnUrl(req, 'telegram-webhook'), secret_token: webhookSecret(), allowed_updates: ['message'] })
      const me = await tg('getMe', {})
      return json({ ok: true, bot: me.username })
    }
    const me = await tg('getMe', {})
    return json({ url: `https://t.me/${me.username}?start=${linkCode(user.id)}`, connected: !!user.telegram_chat_id })
  } catch (e) {
    return json({ error: e.message }, 500)
  }
}
