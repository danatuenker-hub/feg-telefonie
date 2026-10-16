// Freie Terminzeiten aus Wochenzeiten, Abwesenheiten und belegten Terminen berechnen.

export function mondayOf(d) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
export const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const hm = (d) => d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
const atTime = (day, hhmm) => { const [h, m] = hhmm.split(':').map(Number); const x = new Date(day); x.setHours(h, m, 0, 0); return x }

// Startwoche: ab Freitagnachmittag und am Wochenende gleich die nächste Woche
export function defaultWeek() {
  const now = new Date()
  const late = now.getDay() === 6 || now.getDay() === 0 || (now.getDay() === 5 && now.getHours() >= 14)
  return late ? addDays(mondayOf(now), 7) : mondayOf(now)
}

// Liefert pro Tag der Woche { day, absent, slots: [{ start, state: 'free' | 'busy' }] }.
// Vergangene Zeiten fallen weg; das Wochenende nur, wenn dort Zeiten hinterlegt sind.
export function weekSlots(week, avail, absences, busy, durationMin = 60) {
  const now = new Date()
  return [0, 1, 2, 3, 4, 5, 6].map((i) => {
    const day = addDays(week, i)
    const absent = absences.some((a) => a.from_date <= isoDate(day) && a.to_date >= isoDate(day))
    const slots = []
    avail.filter((w) => w.weekday === i + 1).sort((a, b) => a.start_time.localeCompare(b.start_time)).forEach((w) => {
      const end = atTime(day, w.end_time.slice(0, 5))
      for (let t = atTime(day, w.start_time.slice(0, 5)); t.getTime() + durationMin * 60000 <= end.getTime(); t = new Date(t.getTime() + 30 * 60000)) {
        if (t < now) continue
        const tEnd = new Date(t.getTime() + durationMin * 60000)
        const taken = busy.some((b) => new Date(b.starts_at) < tEnd && new Date(b.ends_at) > t)
        slots.push({ start: t, state: taken ? 'busy' : 'free' })
      }
    })
    return { day, absent, slots: absent ? [] : slots }
  }).filter((d, i) => i < 5 || d.slots.length)
}
