import { supabaseAdmin } from '../lib/server.mjs'

// Kalender-Abo (iCal) mit den Terminen eines Beraters: /.netlify/functions/calendar?token=<geheimer Token>
const ics = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => '\\' + c)
const stamp = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

export default async (req) => {
  const token = new URL(req.url).searchParams.get('token')
  if (!/^[0-9a-f-]{36}$/.test(token ?? '')) return new Response('Not found', { status: 404 })
  const db = supabaseAdmin()
  const { data: t } = await db.from('calendar_tokens').select('user_id').eq('token', token).maybeSingle()
  if (!t) return new Response('Not found', { status: 404 })

  const since = new Date(Date.now() - 60 * 86400_000).toISOString()
  const { data: appts } = await db.from('appointments').select('*')
    .eq('berater_id', t.user_id).gte('starts_at', since).neq('status', 'abgesagt').order('starts_at')
  const origin = new URL(req.url).origin

  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//FEG//Telefonie//DE', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:FEG Termine', 'REFRESH-INTERVAL;VALUE=DURATION:PT15M']
  for (const a of appts ?? []) {
    const address = [a.street, [a.zip, a.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')
    const desc = [
      a.kind === 'telefon' ? 'Telefontermin' : 'Vor-Ort-Termin',
      a.contact_name && `Ansprechpartner: ${a.contact_name}`,
      a.contact_phone && `Telefon: ${a.contact_phone}`,
      a.power_kwh && `Strom: ${a.power_kwh} kWh`,
      a.gas_kwh && `Gas: ${a.gas_kwh} kWh`,
      a.current_supplier && `Versorger: ${a.current_supplier}`,
      a.notes && `\n${a.notes}`,
      `\n${origin}/termine/${a.id}`,
    ].filter(Boolean).join('\n')
    lines.push(
      'BEGIN:VEVENT',
      `UID:${a.id}@feg-telefonie`,
      `DTSTAMP:${stamp(a.updated_at)}`,
      `DTSTART:${stamp(a.starts_at)}`,
      `DTEND:${stamp(a.ends_at)}`,
      `SUMMARY:${ics(`${a.kind === 'telefon' ? '📞' : '📍'} ${a.company ?? 'Termin'}`)}`,
      address && a.kind !== 'telefon' ? `LOCATION:${ics(address)}` : null,
      `DESCRIPTION:${ics(desc)}`,
      a.status === 'verschoben' ? 'STATUS:TENTATIVE' : 'STATUS:CONFIRMED',
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return new Response(lines.filter(Boolean).join('\r\n'), {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-cache' },
  })
}
