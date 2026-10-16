import { createHash, createHmac } from 'node:crypto'

const TZ = 'Europe/Berlin'
const token = () => process.env.TELEGRAM_BOT_TOKEN?.trim()

export const telegramConfigured = () => !!token()

export async function tg(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${token()}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!data.ok) throw new Error(`Telegram ${method}: ${data.description}`)
  return data.result
}

// Geheimnis, mit dem Telegram seine Webhook-Aufrufe kennzeichnet (aus dem Bot-Token abgeleitet)
export const webhookSecret = () => createHash('sha256').update('webhook:' + token()).digest('hex').slice(0, 48)

// Verknüpfungscode für den Telegram-Start-Link: <user-id ohne Bindestriche>_<Signatur>
export function linkCode(userId) {
  const sig = createHmac('sha256', token()).update(userId).digest('hex').slice(0, 16)
  return `${userId.replace(/-/g, '')}_${sig}`
}

export function userIdFromCode(code) {
  const m = /^([0-9a-f]{32})_([0-9a-f]{16})$/.exec(code ?? '')
  if (!m) return null
  const id = m[1].replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5')
  return linkCode(id) === code ? id : null
}

const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
const fmt = (d, opts) => new Date(d).toLocaleString('de-DE', { timeZone: TZ, ...opts })

const HEADLINE = {
  created: '📅 <b>Neuer Termin für dich</b>',
  updated: '✏️ <b>Termin geändert</b>',
  cancelled: '❌ <b>Termin abgesagt</b>',
  reminder: '⏰ <b>Erinnerung: Dein Termin beginnt in einer Stunde</b>',
}

// Nachrichtentext für einen Termin
export function appointmentMessage(a, { event = 'created', creator, appUrl } = {}) {
  const address = [a.street, [a.zip, a.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  const lines = [
    HEADLINE[event] ?? HEADLINE.created,
    '',
    `🗓 ${fmt(a.starts_at, { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}, ${fmt(a.starts_at, { hour: '2-digit', minute: '2-digit' })}–${fmt(a.ends_at, { hour: '2-digit', minute: '2-digit' })} Uhr`,
    a.kind === 'telefon' ? '📞 Telefontermin' : '📍 Vor-Ort-Termin',
    '',
    `🏢 <b>${esc(a.company)}</b>`,
  ]
  if (a.contact_name) lines.push(`👤 ${esc(a.contact_name)}`)
  if (a.contact_phone) lines.push(`☎️ ${esc(a.contact_phone)}`)
  if (address) {
    const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
    lines.push(`🏠 <a href="${maps}">${esc(address)}</a>`)
  }
  const facts = []
  if (a.power_kwh) facts.push(`Strom: ${a.power_kwh.toLocaleString('de-DE')} kWh`)
  if (a.gas_kwh) facts.push(`Gas: ${a.gas_kwh.toLocaleString('de-DE')} kWh`)
  if (a.sites) facts.push(`Lieferstellen: ${a.sites}`)
  if (a.current_supplier) facts.push(`Versorger: ${esc(a.current_supplier)}`)
  if (a.contract_end) facts.push(`Vertragsende: ${new Date(a.contract_end).toLocaleDateString('de-DE')}`)
  if (facts.length) lines.push('', ...facts.map((f) => `⚡ ${f}`))
  if (a.notes) lines.push('', `📝 ${esc(a.notes)}`)
  lines.push('')
  if (creator) lines.push(`Gelegt von ${esc(creator)} am ${fmt(a.created_at, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`)
  if (appUrl) lines.push(`<a href="${appUrl}/termine/${a.id}">Termin im System öffnen</a>`)
  return lines.join('\n')
}
