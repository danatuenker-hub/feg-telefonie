import { supabaseAdmin } from '../lib/server.mjs'

// Täglich: Aufnahmen älter als RECORDING_RETENTION_DAYS (Standard 90) löschen.
export default async () => {
  const days = Number(process.env.RECORDING_RETENTION_DAYS || 90)
  const before = new Date(Date.now() - days * 86400_000).toISOString()
  const db = supabaseAdmin()
  const { data } = await db.from('calls').select('id, recording_url')
    .not('recording_url', 'is', null).lt('started_at', before).limit(1000)
  if (!data?.length) return new Response('nichts zu tun')

  await db.storage.from('recordings').remove(data.map((c) => c.recording_url))
  await db.from('calls').update({ recording_url: null }).in('id', data.map((c) => c.id))
  return new Response(`${data.length} Aufnahmen gelöscht`)
}

export const config = { schedule: '@daily' }
