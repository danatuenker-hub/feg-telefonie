import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export function useProfiles() {
  const [profiles, setProfiles] = useState([])
  useEffect(() => {
    supabase.from('profiles').select('id, name, role, active').order('name')
      .then(({ data }) => setProfiles(data ?? []))
  }, [])
  return profiles
}
