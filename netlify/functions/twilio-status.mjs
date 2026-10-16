import { supabaseAdmin, twilioParams } from '../lib/server.mjs'

// Status des angerufenen Teilnehmers: angenommen / beendet (inkl. Gesprächsdauer).
export default async (req) => {
  const p = await twilioParams(req)
  if (!p) return new Response('Forbidden', { status: 403 })
  const db = supabaseAdmin()
  const sid = p.ParentCallSid

  if (p.CallStatus === 'in-progress') {
    await db.from('calls').update({ answered_at: new Date().toISOString() }).eq('provider_sid', sid).is('answered_at', null)
  } else if (['completed', 'busy', 'no-answer', 'failed', 'canceled'].includes(p.CallStatus)) {
    const { data: call } = await db.from('calls').select('answered_at').eq('provider_sid', sid).maybeSingle()
    await db.from('calls').update({
      ended_at: new Date().toISOString(),
      duration_sec: call?.answered_at ? Number(p.CallDuration || 0) : 0,
    }).eq('provider_sid', sid)
  }
  return new Response('', { status: 204 })
}
