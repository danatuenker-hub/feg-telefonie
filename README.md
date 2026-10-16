# FEG Telefonie

Schlankes Telefonie-CRM für die Kaltakquise (Strom/Gas-Terminierung).
React (Vite) auf Netlify, Datenbank und Login über Supabase. Twilio wird für die Browser-Telefonie angebunden.

## Stand

| Bereich | Status |
|---|---|
| Login, Rollen Admin/Mitarbeiter, Zugänge anlegen | ✅ |
| CSV-Import mit Spaltenzuordnung, Dubletten- und Sperrlistenprüfung | ✅ |
| Leadliste mit Filtern (Branche, Bundesland, PLZ-Bereich, Ort, Status, Ergebnis, letzter Anruf, Versuche, Liste, Mitarbeiter, nie angerufen, Wiedervorlage fällig) | ✅ |
| Leads zuweisen (Mehrfachauswahl oder alle Treffer eines Filters) | ✅ |
| Lead-Detail: Firmendaten bearbeiten, Ansprechpartner, Notizen, Verlauf | ✅ |
| Anrufergebnis + Notiz + Wiedervorlage erfassen (auch manuell, z. B. vom Handy) | ✅ |
| Wiedervorlagen-Übersicht (überfällig / heute / demnächst) | ✅ |
| Sperrliste („Nicht mehr anrufen“) | ✅ |
| Browser-Telefonie über Twilio, Aufnahme mit Ansage, Speicherung in Supabase (EU), Löschung nach 90 Tagen | ✅ (Twilio-Konto nötig) |
| Power Dialer | ✅ |
| Auswertungen (Anrufe, Erreichbarkeit, Gesprächszeit, Ergebnisse, Bearbeitungsstand) | ✅ |
| Rückrufe auf Twilio-Nummern + verpasste Anrufe | ✅ (eigene Twilio-Nummer nötig) |
| Rolle „Berater“, Termine mit Berater-Auswahl, Wochenkalender mit freien Zeiten | ✅ |
| Verfügbarkeiten (Wochenzeiten, Abwesenheiten) | ✅ |
| Telegram-Benachrichtigung an Berater (neu / geändert / abgesagt) | ✅ (Bot nötig) |
| Kalender-Abo (iCal) für Berater, Rückmeldung nach Termin, Termin-Auswertung | ✅ |
| Transkription | ⏳ |

## Einrichtung

### 1. Supabase

1. Auf [supabase.com](https://supabase.com) ein **neues Projekt** anlegen (nicht das CRM-Projekt), Region **Frankfurt (eu-central-1)**.
2. Im Projekt links **SQL Editor** öffnen, den Inhalt von `supabase/migrations/001_schema.sql` einfügen und **Run** klicken.
3. **Authentication → Sign In / Providers**: „Allow new users to sign up“ **ausschalten** (Zugänge legt nur der Admin an).
4. **Authentication → Users → Add user**: dich selbst mit E-Mail und Passwort anlegen („Auto Confirm User“ anhaken).
5. Dich zum Admin machen, im SQL Editor:
   ```sql
   update profiles set role = 'admin', name = 'Dein Name' where email = 'deine@email.de';
   ```
6. **Project Settings → API**: `Project URL`, `anon public` Key und `service_role` Key notieren.

### 2. Netlify

1. **Add new site → Import an existing project → GitHub →** `feg-telefonie`.
   Build-Einstellungen werden aus `netlify.toml` übernommen.
2. **Site configuration → Environment variables**:
   | Name | Wert |
   |---|---|
   | `VITE_SUPABASE_URL` | Project URL |
   | `VITE_SUPABASE_ANON_KEY` | anon public Key |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role Key (**geheim**, nur hier eintragen) |
3. Neu deployen.
4. **Domain management → Add domain** → `telefonie.feg.tools`, dann beim Domain-Anbieter einen CNAME-Eintrag `telefonie` → `<deine-site>.netlify.app` setzen.
5. In Supabase unter **Authentication → URL Configuration** die Site URL auf `https://telefonie.feg.tools` setzen (wichtig für „Passwort vergessen“).

### 3. Twilio (Browser-Telefonie)

1. Konto auf [twilio.com](https://www.twilio.com) anlegen, **Upgrade** (Guthaben aufladen).
2. Im SQL Editor von Supabase `supabase/migrations/002_telefonie.sql` und `003_ergebnisse.sql` ausführen.
3. **Absendernummer**: *Phone Numbers → Manage → Verified Caller IDs → Add* → eure bestehende Nummer per Kontrollanruf bestätigen
   (oder unter *Buy a number* eine deutsche Nummer kaufen).
4. **Länder freigeben**: *Voice → Settings → Geo permissions* → nur **Germany** und **Austria** anhaken.
5. **API Key**: *Account → API keys & tokens → Create API key* (Typ *Standard*) → SID (`SK…`) und Secret notieren.
6. **TwiML App**: *Voice → TwiML Apps → Create* → Voice Request URL
   `https://telefonie.feg.tools/.netlify/functions/twilio-voice` (HTTP POST) → SID (`AP…`) notieren.
   Solange die eigene Domain noch nicht eingerichtet ist: `https://telefoniefeg.netlify.app/.netlify/functions/twilio-voice`.
   **Wichtig:** Nach dem Umzug auf die eigene Domain die URL hier anpassen.
7. Gekaufte Twilio-Nummern (für Rückrufe): bei der Nummer *A call comes in* → dieselbe URL eintragen.
8. In Netlify zusätzlich eintragen und neu deployen:
   | Name | Wert |
   |---|---|
   | `TWILIO_ACCOUNT_SID` | Account SID (`AC…`, Startseite der Twilio Console) |
   | `TWILIO_AUTH_TOKEN` | Auth Token (Startseite der Twilio Console) |
   | `TWILIO_API_KEY` | API Key SID (`SK…`) |
   | `TWILIO_API_SECRET` | API Key Secret |
   | `TWILIO_TWIML_APP_SID` | TwiML App SID (`AP…`) |
   | `TWILIO_CALLER_ID` | Standard-Absendernummer, z. B. `+4917612345678` |
   | `RECORDING_RETENTION_DAYS` | optional, Standard `90` |

Pro Mitarbeiter kann unter *Mitarbeiter → Anzeige-Rufnummer* eine eigene Absendernummer hinterlegt werden.
Jeder Anruf beginnt beim Angerufenen mit der Ansage „Dieses Gespräch wird zur Qualitätssicherung aufgezeichnet.“

### 4. Termine und Telegram

1. Im Supabase SQL Editor `supabase/migrations/004_termine.sql` ausführen.
2. Unter *Mitarbeiter* Berater anlegen (Rolle „Berater“) und ihr PLZ-Gebiet eintragen, z. B. `80-85, 90`.
3. Verfügbarkeiten unter *Verfügbarkeiten* pflegen (oder vom Berater selbst).
4. Telegram-Bot: in Telegram bei **@BotFather** `/newbot` → Namen vergeben → Token kopieren.
   In Netlify `TELEGRAM_BOT_TOKEN` eintragen (geheim) und neu deployen.
   Danach unter *Mitarbeiter* auf **„Telegram-Bot einrichten“** klicken.
5. Jeder Berater meldet sich an und klickt unter *Meine Termine* auf **„Telegram verbinden“** → im Bot „Start“.

Der Bot sollte ein eigener, neuer Bot sein: ein Bot kann nur an ein System Nachrichten weiterleiten.

### 5. Lokal entwickeln

```bash
cp .env.example .env   # Werte eintragen
npm install
npm run dev            # http://localhost:5173
```
Für die Netlify Functions lokal: `npx netlify dev`.

## CSV-Format

Vorlage auf der Import-Seite herunterladen. Trennzeichen `;` oder `,`.

```
firma;telefon;telefon2;email;website;strasse;plz;ort;bundesland;branche;ansprechpartner;position;ansprechpartner_telefon;ansprechpartner_email;notiz
```

- Pflicht: `firma`, `telefon`. Abweichende Spaltennamen kann man beim Import zuordnen.
- Telefonnummern werden vereinheitlicht (`089 / 123-45` → `+498912345`). Dubletten = gleiche Nummer.
- Fehlt `bundesland`, wird es aus der PLZ abgeleitet (in Grenzregionen nicht 100 % exakt).

## Datenmodell

- `profiles` – Benutzer mit Rolle (`admin` / `mitarbeiter`) und Anzeige-Rufnummer
- `lead_lists` – Importlisten
- `leads` – Firmen; `status`, `last_outcome`, `last_call_at`, `call_count`, `next_followup_at` pflegt die Datenbank automatisch
- `contacts` – Ansprechpartner je Lead
- `notes` – Notizen
- `calls` – Anrufe (Dauer, Ergebnis, Aufnahme, Transkript)
- `followups` – Wiedervorlagen
- `blocked_phones` – Sperrliste

Zugriffsrechte sind in der Datenbank (Row Level Security) hinterlegt:
Mitarbeiter sehen und bearbeiten nur ihnen zugewiesene Leads; nur Admins importieren, weisen zu und löschen.
