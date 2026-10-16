import { supabaseAdmin } from '../lib/server.mjs'
import { appointmentMessage, telegramConfigured, tg } from '../lib/telegram.mjs'

// Alle 10 Minuten: Berater per Telegram an Termine erinnern, die in ca. einer Stunde beginnen.
export default async () => {
  if (!telegramConfigured()) return new Response('Telegram nicht eingerichtet')
  const db = supabaseAdmin()
  const now = Date.now()
  const { data: due } = await db.from('appointments').select('*')
    .is('reminded_at', null).in('status', ['geplant', 'bestaetigt'])
    .gte('starts_at', new Date(now).toISOString())
    .lte('starts_at', new Date(now + 65 * 60000).toISOString())
  if (!due?.length) return new Response('nichts fällig')

  const ids = [...new Set(due.map((a) => a.berater_id))]
  const { data: beraters } = await db.from('profiles').select('id, telegram_chat_id').in('id', ids)
  const chat = Object.fromEntries((beraters ?? []).map((b) => [b.id, b.telegram_chat_id]))
  const appUrl = process.env.URL

  let sent = 0
  for (const a of due) {
    // Termine, die erst kurz vorher gelegt wurden, brauchen keine zusätzliche Erinnerung
    const lateBooking = new Date(a.starts_at) - new Date(a.created_at) < 75 * 60000
    if (chat[a.berater_id] && !lateBooking) {
      try {
        await tg('sendMessage', {
          chat_id: chat[a.berater_id],
          text: appointmentMessage(a, { event: 'reminder', appUrl }),
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        })
        sent++
      } catch (e) {
        console.error('Erinnerung fehlgeschlagen', a.id, e.message)
        continue
      }
    }
    await db.from('appointments').update({ reminded_at: new Date().toISOString() }).eq('id', a.id)
  }
  return new Response(`${sent} Erinnerungen gesendet`)
}

export const config = { schedule: '*/10 * * * *' }
