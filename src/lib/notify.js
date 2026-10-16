import { supabase } from './supabase'

// Telegram-Benachrichtigung an den Berater auslösen. Liefert { sent, reason }.
export async function notifyAppointment(appointmentId, event = 'created') {
  const { data } = await supabase.auth.getSession()
  try {
    const res = await fetch('/.netlify/functions/notify-appointment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token}` },
      body: JSON.stringify({ appointmentId, event }),
    })
    return await res.json()
  } catch (e) {
    return { sent: false, reason: e.message }
  }
}
