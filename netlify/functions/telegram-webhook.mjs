import { supabaseAdmin } from '../lib/server.mjs'
import { tg, userIdFromCode, webhookSecret } from '../lib/telegram.mjs'

// Empfängt Nachrichten an den Bot. "/start <code>" verknüpft den Telegram-Chat mit einem Benutzer.
export default async (req) => {
  if (req.headers.get('x-telegram-bot-api-secret-token') !== webhookSecret()) return new Response('Forbidden', { status: 403 })
  const update = await req.json()
  const msg = update.message
  if (!msg?.text) return new Response('ok')
  const chatId = String(msg.chat.id)

  const [cmd, code] = msg.text.trim().split(/\s+/)
  if (cmd === '/start' && code) {
    const userId = userIdFromCode(code)
    if (!userId) {
      await tg('sendMessage', { chat_id: chatId, text: 'Dieser Link ist ungültig. Bitte im Telefonie-System erneut auf „Telegram verbinden“ klicken.' })
      return new Response('ok')
    }
    const db = supabaseAdmin()
    // Ein Chat gehört immer nur zu einem Benutzer
    await db.from('profiles').update({ telegram_chat_id: null }).eq('telegram_chat_id', chatId)
    const { data } = await db.from('profiles').update({ telegram_chat_id: chatId }).eq('id', userId).select('name').single()
    await tg('sendMessage', {
      chat_id: chatId,
      text: `✅ Verbunden${data?.name ? `, ${data.name}` : ''}! Ab jetzt bekommst du hier eine Nachricht, sobald ein Termin für dich gelegt wird.`,
    })
    return new Response('ok')
  }

  await tg('sendMessage', { chat_id: chatId, text: 'Hallo! Bitte verbinde Telegram über den Knopf „Telegram verbinden“ im Telefonie-System (Seite „Termine“).' })
  return new Response('ok')
}
