import { createClient } from '@supabase/supabase-js'

// Nur https://<projekt>.supabase.co verwenden – kopierte Zusätze wie /rest/v1/ werden entfernt
function baseUrl(raw) {
  try { return new URL(raw.trim()).origin } catch { return null }
}

const url = import.meta.env.VITE_SUPABASE_URL ? baseUrl(import.meta.env.VITE_SUPABASE_URL) : null
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

// Fehlen die Umgebungsvariablen beim Build, zeigt App.jsx einen Hinweis statt einer weißen Seite.
export const configError = !url || !key
  ? 'VITE_SUPABASE_URL oder VITE_SUPABASE_ANON_KEY fehlt. In Netlify eintragen und neu deployen.'
  : null

export const supabase = configError ? null : createClient(url, key.trim())
