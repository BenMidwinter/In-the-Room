import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { getSupabase, isSupabaseConfigured } from '../supabase/client'
import type { Tables } from '../supabase/database.types'
import { DPA_VERSION } from '../dpa'

export type ProfileRow = Tables<'profiles'>

type AuthContextValue = {
  configured: boolean
  loading: boolean
  session: Session | null
  user: User | null
  profile: ProfileRow | null
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (
    email: string,
    password: string,
    details: { fullName?: string, dpaAccepted: boolean },
  ) => Promise<{ error: string | null }>
  acceptDpa: () => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  requestPasswordReset: (email: string) => Promise<{ error: string | null }>
  completePasswordReset: (password: string) => Promise<{ error: string | null }>
  recovery: boolean
  refreshProfile: () => Promise<void>
  profileReady: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

function recoveryLinkOpen(): boolean {
  if (typeof window === 'undefined') return false
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const query = new URLSearchParams(window.location.search)
  return hash.get('type') === 'recovery' || query.get('type') === 'recovery'
}

async function fetchProfile(userId: string): Promise<ProfileRow | null> {
  const supabase = getSupabase()
  if (!supabase) return null
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  if (error) {
    console.warn('[auth] profile load', error.message)
    return null
  }
  return data
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured()
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [recovery, setRecovery] = useState(recoveryLinkOpen)
  const userId = session?.user?.id ?? null
  const [profileRecord, setProfileRecord] = useState<{
    userId: string | null
    ready: boolean
    profile: ProfileRow | null
  }>({ userId: null, ready: true, profile: null })

  if (profileRecord.userId !== userId) {
    setProfileRecord({ userId, ready: !userId, profile: null })
  }

  const profile = profileRecord.userId === userId ? profileRecord.profile : null
  const profileReady = profileRecord.userId === userId && profileRecord.ready

  const refreshProfile = useCallback(async () => {
    if (!userId) return
    const next = await fetchProfile(userId)
    setProfileRecord({ userId, ready: true, profile: next })
  }, [userId])

  useEffect(() => {
    const supabase = getSupabase()
    if (!supabase) {
      setLoading(false)
      return
    }

    let mounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      if (event === 'SIGNED_OUT') setRecovery(false)
      setSession(next)
      setLoading(false)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    fetchProfile(userId).then((row) => {
      if (!cancelled) setProfileRecord({ userId, ready: true, profile: row })
    })
    return () => { cancelled = true }
  }, [userId])

  const signIn = useCallback(async (email: string, password: string) => {
    const supabase = getSupabase()
    if (!supabase) return { error: 'Supabase is not configured' }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }, [])

  const signUp = useCallback(async (
    email: string,
    password: string,
    details: { fullName?: string, dpaAccepted: boolean },
  ) => {
    const supabase = getSupabase()
    if (!supabase) return { error: 'Supabase is not configured' }
    if (!details.dpaAccepted) {
      return { error: 'Accept the Data Processing Agreement to create an account.' }
    }
    // Copied once into profiles by handle_new_user. Not used for authorisation after that.
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: details.fullName?.trim() || undefined,
          dpa_accepted: true,
          dpa_version: DPA_VERSION,
        },
      },
    })
    return { error: error?.message ?? null }
  }, [])

  const acceptDpa = useCallback(async () => {
    const supabase = getSupabase()
    if (!supabase || !userId) return { error: 'Supabase is not configured' }
    const { data, error } = await supabase
      .from('profiles')
      .update({ dpa_accepted: true })
      .eq('id', userId)
      .select('dpa_accepted')
      .maybeSingle()
    if (error) return { error: error.message }
    if (!data?.dpa_accepted) return { error: 'The agreement was not recorded. Try again.' }
    setProfileRecord({ userId, ready: true, profile: await fetchProfile(userId) })
    return { error: null }
  }, [userId])

  const signOut = useCallback(async () => {
    const supabase = getSupabase()
    if (!supabase) return
    await supabase.auth.signOut()
    setProfileRecord({ userId: null, ready: true, profile: null })
    setRecovery(false)
  }, [])

  const requestPasswordReset = useCallback(async (email: string) => {
    const supabase = getSupabase()
    if (!supabase) return { error: 'Supabase is not configured' }
    const redirectTo = `${window.location.origin}/login`
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
    return { error: error?.message ?? null }
  }, [])

  const completePasswordReset = useCallback(async (password: string) => {
    const supabase = getSupabase()
    if (!supabase) return { error: 'Supabase is not configured' }
    const { error } = await supabase.auth.updateUser({ password })
    if (error) return { error: error.message }
    setRecovery(false)
    window.history.replaceState({}, '', '/login')
    return { error: null }
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    configured,
    loading,
    session,
    user: session?.user ?? null,
    profile,
    signIn,
    signUp,
    acceptDpa,
    signOut,
    requestPasswordReset,
    completePasswordReset,
    recovery,
    refreshProfile,
    profileReady,
  }), [
    configured,
    loading,
    session,
    profile,
    signIn,
    signUp,
    acceptDpa,
    signOut,
    requestPasswordReset,
    completePasswordReset,
    recovery,
    refreshProfile,
    profileReady,
  ])

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
