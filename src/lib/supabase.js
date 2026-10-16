import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

// Fehlen die Umgebungsvariablen beim Build, zeigt App.jsx einen Hinweis statt einer weißen Seite.
export const configError = !url || !key
  ? 'VITE_SUPABASE_URL oder VITE_SUPABASE_ANON_KEY fehlt. In Netlify eintragen und neu deployen.'
  : null

export const supabase = configError ? null : createClient(url.trim(), key.trim())
