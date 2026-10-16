import { supabase } from './supabase'

// Filter liegen als URL-Parameter vor, damit Zurück-Button und Lesezeichen funktionieren.
// Der Power Dialer nutzt später dieselbe Funktion für seine Anrufliste.
export const FILTER_KEYS = [
  'q', 'industry', 'state', 'zipFrom', 'zipTo', 'city', 'status', 'outcome', 'assigned',
  'list', 'lastFrom', 'lastTo', 'never', 'minCalls', 'maxCalls', 'due', 'sort',
]

export function filtersFromParams(params) {
  const f = {}
  for (const k of FILTER_KEYS) {
    const v = params.get(k)
    if (v) f[k] = v
  }
  return f
}

const SORTS = {
  company: ['company', true],
  zip: ['zip', true],
  last_call: ['last_call_at', false],
  followup: ['next_followup_at', true],
  created: ['created_at', false],
}

export function buildLeadQuery(f, { select = '*', count } = {}) {
  let q = supabase.from('leads').select(select, count ? { count: 'exact' } : undefined)

  if (f.q) {
    const s = f.q.replace(/[%,()]/g, ' ').trim()
    const digits = s.replace(/\D/g, '')
    const ors = [`company.ilike.%${s}%`, `email.ilike.%${s}%`, `city.ilike.%${s}%`]
    if (digits.length >= 4) ors.push(`phone.ilike.%${digits.replace(/^0/, '')}%`)
    q = q.or(ors.join(','))
  }
  if (f.industry) q = q.in('industry', f.industry.split('|'))
  if (f.state) q = q.in('state', f.state.split('|'))
  if (f.status) q = q.in('status', f.status.split('|'))
  if (f.outcome) q = q.in('last_outcome', f.outcome.split('|'))
  if (f.zipFrom) q = q.gte('zip', f.zipFrom.padEnd(5, '0'))
  if (f.zipTo) q = q.lte('zip', f.zipTo.padEnd(5, '9'))
  if (f.city) q = q.ilike('city', `%${f.city}%`)
  if (f.list) q = q.eq('list_id', f.list)
  if (f.assigned === 'none') q = q.is('assigned_to', null)
  else if (f.assigned) q = q.eq('assigned_to', f.assigned)
  if (f.lastFrom) q = q.gte('last_call_at', f.lastFrom)
  if (f.lastTo) q = q.lte('last_call_at', f.lastTo + 'T23:59:59')
  if (f.never) q = q.eq('call_count', 0)
  if (f.minCalls) q = q.gte('call_count', Number(f.minCalls))
  if (f.maxCalls) q = q.lte('call_count', Number(f.maxCalls))
  if (f.due) q = q.lte('next_followup_at', new Date().toISOString())

  const [col, asc] = SORTS[f.sort] ?? SORTS.company
  return q.order(col, { ascending: asc, nullsFirst: false }).order('id')
}
