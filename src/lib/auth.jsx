import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)
  const [recovery, setRecovery] = useState(false)
  const [profileError, setProfileError] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      setSession(s)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    setProfileError('')
    if (!session) return setProfile(null)
    supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle()
      .then(({ data, error }) => {
        if (error) setProfileError(error.message)
        else if (!data) setProfileError('Zu diesem Login existiert kein Profil. Wurde das SQL-Schema vor dem Anlegen des Benutzers ausgeführt?')
        setProfile(data)
      })
  }, [session])

  const value = {
    session,
    profile,
    isAdmin: profile?.role === 'admin',
    recovery,
    endRecovery: () => setRecovery(false),
    profileError,
    loading: session === undefined || (session && !profile && !profileError),
    signOut: () => supabase.auth.signOut(),
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
