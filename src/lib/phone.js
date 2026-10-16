import { parsePhoneNumberFromString } from 'libphonenumber-js'

// "089 / 123-45" -> "+498912345". Gibt null zurück, wenn die Nummer ungültig ist.
export function normalizePhone(raw) {
  if (!raw) return null
  let s = String(raw).trim()
  if (s.startsWith('00')) s = '+' + s.slice(2)
  const p = parsePhoneNumberFromString(s, 'DE')
  return p && p.isPossible() ? p.number : null
}

export function formatPhone(e164) {
  if (!e164) return ''
  const p = parsePhoneNumberFromString(e164)
  if (!p) return e164
  return p.country === 'DE' ? p.formatNational() : p.formatInternational()
}
