"""Erzeugt src/data/plz-geo.json aus dem GeoNames-Postleitzahlen-Export (CC BY 4.0).

Aufruf: python3 scripts/build-plz-geo.py <zipcodes.de.csv>
Quelle: https://github.com/zauberware/postal-codes-json-xml-csv (Daten von geonames.org)
"""
import csv, json, sys, collections

COMPANY_WORDS = ('GmbH', ' AG', 'AG ', '& Co', 'mbH', 'Versicherung', 'Bank', 'Sparkasse', ' KG', ' SE', 'e.V.', 'Verlag',
                 'Postfach', 'Großkunde', 'Deutsche ', 'Bundes', 'Finanzamt', 'Telekom', 'Universität', 'Klinik')
rows = collections.defaultdict(list)
places = collections.defaultdict(set)
with open(sys.argv[1], encoding='utf-8') as f:
    for r in csv.DictReader(f):
        plz = r['zipcode'].strip()
        if len(plz) != 5 or not plz.isdigit():
            continue
        place = r['place'].strip()
        # Großkunden-Postleitzahlen (Firmen statt Orte) auslassen – sie liegen oft weit weg vom Leitbereich
        if not place or any(w in place for w in COMPANY_WORDS):
            continue
        rows[plz].append((float(r['latitude']), float(r['longitude'])))
        places[place.lower()].add(plz)

geo = {plz: [round(sum(a for a, _ in v) / len(v), 4), round(sum(b for _, b in v) / len(v), 4)] for plz, v in sorted(rows.items())}
# Restliche Ausreißer (Koordinate > 150 km vom Durchschnitt des PLZ-Leitbereichs) entfernen
import math
lead = collections.defaultdict(list)
for plz, (la, lo) in geo.items():
    lead[plz[:2]].append((la, lo))
mid = {k: (sum(a for a, _ in v) / len(v), sum(b for _, b in v) / len(v)) for k, v in lead.items()}
geo = {plz: p for plz, p in geo.items()
       if math.hypot((p[0] - mid[plz[:2]][0]) * 111, (p[1] - mid[plz[:2]][1]) * 70) <= 150}
places = {k: {z for z in v if z in geo} for k, v in places.items()}
places = {k: v for k, v in places.items() if v}

out = {'p': geo, 'o': {k: sorted(v) for k, v in sorted(places.items())}}
json.dump(out, open('src/data/plz-geo.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(len(geo), 'PLZ,', len(places), 'Orte')
