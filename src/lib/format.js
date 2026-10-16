export const fmtDateTime = (v) =>
  v ? new Date(v).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '–'

export const fmtDate = (v) => (v ? new Date(v).toLocaleDateString('de-DE') : '–')

export function fmtDuration(sec) {
  sec = Math.round(sec || 0)
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} h` : `${m}:${String(s).padStart(2, '0')} min`
}

// Wert für <input type="datetime-local"> in lokaler Zeit
export function toLocalInput(date) {
  const d = new Date(date)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}
