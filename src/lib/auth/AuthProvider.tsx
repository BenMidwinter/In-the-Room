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

export type ProfileRow = Tables<'profiles'>

type AuthContextValue = {
  configured: boolean
  loading: boolean
  session: Session | null
  user: User | null
  profile: ProfileRow | null
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  requestPasswordReset: (email: string) => Promise<{ error: string | null }>
  completePasswordReset: (password: string) => Promise<{ error: string | null }>
  recovery: boolean
  refreshProfile: () => Promise<void>
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
  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [recovery, setRecovery] = useState(recoveryLinkOpen)

  const refreshProfile = useCallback(async () => {
    const userId = session?.user?.id
    if (!userId) {
      setProfile(null)
      return
    }
    setProfile(await fetchProfile(userId))
  }, [session?.user?.id])

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
    if (!session?.user?.id) {
      setProfile(null)
      return
    }
    let cancelled = false
    fetchProfile(session.user.id).then((row) => {
      if (!cancelled) setProfile(row)
    })
    return () => { cancelled = true }
  }, [session?.user?.id])

  const signIn = useCallback(async (email: string, password: string) => {
    const supabase = getSupabase()
    if (!supabase) return { error: 'Supabase is not configured' }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }, [])

  const signUp = useCallback(async (email: string, password: string, fullName?: string) => {
    const supabase = getSupabase()
    if (!supabase) return { error: 'Supabase is not configured' }
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName?.trim() || undefined },
      },
    })
    return { error: error?.message ?? null }
  }, [])

  const signOut = useCallback(async () => {
    const supabase = getSupabase()
    if (!supabase) return
    await supabase.auth.signOut()
    setProfile(null)
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
    signOut,
    requestPasswordReset,
    completePasswordReset,
    recovery,
    refreshProfile,
  }), [
    configured,
    loading,
    session,
    profile,
    signIn,
    signUp,
    signOut,
    requestPasswordReset,
    completePasswordReset,
    recovery,
    refreshProfile,
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
