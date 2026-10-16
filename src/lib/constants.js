// Gesprächsergebnisse. followup: öffnet automatisch die Wiedervorlage.
export const OUTCOMES = [
  { value: 'nicht_erreicht', label: 'Nicht erreicht' },
  { value: 'mailbox', label: 'Mailbox' },
  { value: 'falscher_ansprechpartner', label: 'Falscher Ansprechpartner', followup: true },
  { value: 'entscheider_nicht_erreichbar', label: 'Entscheider nicht erreichbar', followup: true },
  { value: 'wiedervorlage', label: 'Später / Wiedervorlage', followup: true },
  { value: 'interesse', label: 'Interesse vorhanden', followup: true },
  { value: 'unterlagen_angefordert', label: 'Unterlagen angefordert', followup: true },
  { value: 'angebot_gewuenscht', label: 'Angebot gewünscht', followup: true },
  { value: 'termin', label: 'Termin vereinbart' },
  { value: 'vertrag_laeuft', label: 'Vertrag läuft noch', followup: true, contractEnd: true },
  { value: 'kein_interesse', label: 'Kein Interesse' },
  { value: 'kein_bedarf', label: 'Nicht qualifiziert (kein Bedarf / zu kleiner Verbrauch)' },
  { value: 'bereits_kunde', label: 'Bereits Kunde' },
  { value: 'falsche_nummer', label: 'Falsche Nummer' },
  { value: 'firma_existiert_nicht', label: 'Firma existiert nicht mehr' },
  { value: 'nicht_anrufen', label: 'Nicht mehr anrufen (Sperrliste)' },
]

export const STATUSES = [
  { value: 'neu', label: 'Neu' },
  { value: 'in_bearbeitung', label: 'In Bearbeitung' },
  { value: 'wiedervorlage', label: 'Wiedervorlage' },
  { value: 'interessent', label: 'Interessent' },
  { value: 'termin', label: 'Termin' },
  { value: 'kein_interesse', label: 'Kein Interesse' },
  { value: 'bereits_kunde', label: 'Bereits Kunde' },
  { value: 'ungueltig', label: 'Ungültig' },
  { value: 'gesperrt', label: 'Gesperrt' },
]

export const outcomeLabel = (v) => OUTCOMES.find((o) => o.value === v)?.label ?? v ?? '–'
export const statusLabel = (v) => STATUSES.find((s) => s.value === v)?.label ?? v ?? '–'

export const STATES = [
  'Baden-Württemberg', 'Bayern', 'Berlin', 'Brandenburg', 'Bremen', 'Hamburg', 'Hessen',
  'Mecklenburg-Vorpommern', 'Niedersachsen', 'Nordrhein-Westfalen', 'Rheinland-Pfalz',
  'Saarland', 'Sachsen', 'Sachsen-Anhalt', 'Schleswig-Holstein', 'Thüringen',
]

// Bundesland aus den ersten zwei PLZ-Ziffern. Grenzregionen sind nicht 100 % exakt –
// wer es genau braucht, gibt die Spalte "bundesland" in der CSV mit.
const ZIP2_STATE = {
  '01': 'Sachsen', '02': 'Sachsen', '03': 'Brandenburg', '04': 'Sachsen', '06': 'Sachsen-Anhalt',
  '07': 'Thüringen', '08': 'Sachsen', '09': 'Sachsen',
  '10': 'Berlin', '12': 'Berlin', '13': 'Berlin', '14': 'Brandenburg', '15': 'Brandenburg',
  '16': 'Brandenburg', '17': 'Mecklenburg-Vorpommern', '18': 'Mecklenburg-Vorpommern',
  '19': 'Mecklenburg-Vorpommern', '20': 'Hamburg', '21': 'Niedersachsen', '22': 'Hamburg',
  '23': 'Schleswig-Holstein', '24': 'Schleswig-Holstein', '25': 'Schleswig-Holstein',
  '26': 'Niedersachsen', '27': 'Niedersachsen', '28': 'Bremen', '29': 'Niedersachsen',
  '30': 'Niedersachsen', '31': 'Niedersachsen', '32': 'Nordrhein-Westfalen', '33': 'Nordrhein-Westfalen',
  '34': 'Hessen', '35': 'Hessen', '36': 'Hessen', '37': 'Niedersachsen', '38': 'Niedersachsen',
  '39': 'Sachsen-Anhalt', '40': 'Nordrhein-Westfalen', '41': 'Nordrhein-Westfalen',
  '42': 'Nordrhein-Westfalen', '44': 'Nordrhein-Westfalen', '45': 'Nordrhein-Westfalen',
  '46': 'Nordrhein-Westfalen', '47': 'Nordrhein-Westfalen', '48': 'Nordrhein-Westfalen',
  '49': 'Niedersachsen', '50': 'Nordrhein-Westfalen', '51': 'Nordrhein-Westfalen',
  '52': 'Nordrhein-Westfalen', '53': 'Nordrhein-Westfalen', '54': 'Rheinland-Pfalz',
  '55': 'Rheinland-Pfalz', '56': 'Rheinland-Pfalz', '57': 'Nordrhein-Westfalen',
  '58': 'Nordrhein-Westfalen', '59': 'Nordrhein-Westfalen', '60': 'Hessen', '61': 'Hessen',
  '63': 'Hessen', '64': 'Hessen', '65': 'Hessen', '66': 'Saarland', '67': 'Rheinland-Pfalz',
  '68': 'Baden-Württemberg', '69': 'Baden-Württemberg', '70': 'Baden-Württemberg',
  '71': 'Baden-Württemberg', '72': 'Baden-Württemberg', '73': 'Baden-Württemberg',
  '74': 'Baden-Württemberg', '75': 'Baden-Württemberg', '76': 'Baden-Württemberg',
  '77': 'Baden-Württemberg', '78': 'Baden-Württemberg', '79': 'Baden-Württemberg',
  '80': 'Bayern', '81': 'Bayern', '82': 'Bayern', '83': 'Bayern', '84': 'Bayern', '85': 'Bayern',
  '86': 'Bayern', '87': 'Bayern', '88': 'Baden-Württemberg', '89': 'Baden-Württemberg',
  '90': 'Bayern', '91': 'Bayern', '92': 'Bayern', '93': 'Bayern', '94': 'Bayern', '95': 'Bayern',
  '96': 'Bayern', '97': 'Bayern', '98': 'Thüringen', '99': 'Thüringen',
}

export function stateFromZip(zip) {
  const z = String(zip ?? '').trim()
  if (!/^\d{5}$/.test(z)) return null
  return ZIP2_STATE[z.slice(0, 2)] ?? null
}

export const ROLES = [
  { value: 'mitarbeiter', label: 'Callcenter' },
  { value: 'berater', label: 'Berater' },
  { value: 'admin', label: 'Admin' },
]
export const roleLabel = (v) => ROLES.find((r) => r.value === v)?.label ?? v

export const APPOINTMENT_STATUSES = [
  { value: 'geplant', label: 'Geplant' },
  { value: 'bestaetigt', label: 'Bestätigt' },
  { value: 'durchgefuehrt', label: 'Durchgeführt' },
  { value: 'abschluss', label: 'Abschluss ✓' },
  { value: 'kein_abschluss', label: 'Kein Abschluss' },
  { value: 'nicht_angetroffen', label: 'Nicht angetroffen' },
  { value: 'verschoben', label: 'Verschoben' },
  { value: 'abgesagt', label: 'Abgesagt' },
]
export const appointmentStatusLabel = (v) => APPOINTMENT_STATUSES.find((s) => s.value === v)?.label ?? v

// "80-85, 90, 972" -> passt die PLZ in einen der Bereiche? (Vergleich über die Präfixlänge)
export function zipInRegions(zip, regions) {
  if (!zip || !regions) return false
  return regions.split(/[,;\s]+/).filter(Boolean).some((part) => {
    const [a, b = a] = part.split('-').map((x) => x.trim())
    if (!/^\d+$/.test(a) || !/^\d+$/.test(b)) return false
    const p = zip.slice(0, a.length)
    return p >= a && p <= b.padEnd(a.length, '9')
  })
}
