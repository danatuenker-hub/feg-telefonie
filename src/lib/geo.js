// Umkreissuche über Postleitzahlen. Koordinaten: GeoNames (geonames.org), CC BY 4.0.
// Die Daten (ca. 250 KB) werden erst geladen, wenn jemand die Umkreissuche benutzt.

let cache = null
const loadGeo = () => (cache ??= import('../data/plz-geo.json').then((m) => m.default))

function distanceKm([lat1, lon1], [lat2, lon2]) {
  const rad = Math.PI / 180
  const dLat = (lat2 - lat1) * rad
  const dLon = (lon2 - lon1) * rad
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(a))
}

// "Düsseldorf" oder "40210" + Radius -> alle Postleitzahlen im Umkreis.
// Liefert { zips, label } oder { error }.
export async function resolveNear(query, km) {
  const geo = await loadGeo()
  const q = String(query).trim()
  let center
  let own = []
  if (/^\d{5}$/.test(q)) {
    center = geo.p[q]
    own = [q]
    if (!center) return { error: `PLZ ${q} ist unbekannt.` }
  } else {
    own = geo.o[q.toLowerCase()] ?? []
    const pts = own.map((z) => geo.p[z]).filter(Boolean)
    if (!pts.length) return { error: `Ort „${q}“ nicht gefunden – bitte genauen Ortsnamen oder eine PLZ eingeben.` }
    center = [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length]
  }
  const radius = Number(km) || 0
  const zips = new Set(own)
  if (radius > 0) {
    for (const [zip, pt] of Object.entries(geo.p)) {
      if (distanceKm(center, pt) <= radius) zips.add(zip)
    }
  }
  return { zips: [...zips].sort(), label: `${q}${radius ? ` + ${radius} km` : ''}` }
}

// Filter für die Datenbankabfrage vorbereiten (Umkreis -> Liste von Postleitzahlen)
export async function prepareFilters(f) {
  if (!f.near) return f
  const r = await resolveNear(f.near, f.km ?? 25)
  if (r.error) throw new Error(r.error)
  return { ...f, zipIn: r.zips }
}
