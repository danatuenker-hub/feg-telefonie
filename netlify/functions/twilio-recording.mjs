import { supabaseAdmin, twilioParams } from '../lib/server.mjs'

// Aufnahme fertig: von Twilio holen, im privaten Supabase-Speicher (EU) ablegen, bei Twilio löschen.
export default async (req) => {
  const p = await twilioParams(req)
  if (!p) return new Response('Forbidden', { status: 403 })
  if (p.RecordingStatus !== 'completed') return new Response('', { status: 204 })

  const db = supabaseAdmin()
  const { data: call } = await db.from('calls').select('id, lead_id').eq('provider_sid', p.CallSid).maybeSingle()
  if (!call) return new Response('', { status: 204 })

  const auth = 'Basic ' + Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')
  const audio = await fetch(`${p.RecordingUrl}.mp3`, { headers: { Authorization: auth } })
  if (!audio.ok) {
    console.error('Aufnahme nicht abrufbar', audio.status)
    return new Response('', { status: 500 })
  }

  const path = `${call.lead_id ?? 'ohne-lead'}/${call.id}.mp3`
  const { error } = await db.storage.from('recordings')
    .upload(path, await audio.arrayBuffer(), { contentType: 'audio/mpeg', upsert: true })
  if (error) {
    console.error('Upload fehlgeschlagen', error.message)
    return new Response('', { status: 500 })
  }
  await db.from('calls').update({ recording_url: path }).eq('id', call.id)

  await fetch(p.RecordingUrl + '.json', { method: 'DELETE', headers: { Authorization: auth } })
  return new Response('', { status: 204 })
}
