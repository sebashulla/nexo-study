import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, supabaseConfigured } from '../lib/supabase'

type AuthContextValue = {
  configured: boolean
  loading: boolean
  session: Session | null
  user: User | null
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  configured: supabaseConfigured,
  loading: true,
  session: null,
  user: null,
  signOut: async () => {},
})

const LAUNCH_KEY = 'nexo-onboarding-launch'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    let mounted = true
    let launchTimer: number | undefined

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return
      const holdLaunch = event === 'SIGNED_IN' && sessionStorage.getItem(LAUNCH_KEY) === '1'
      if (holdLaunch) {
        setLoading(false)
        launchTimer = window.setTimeout(() => {
          sessionStorage.removeItem(LAUNCH_KEY)
          if (mounted) setSession(nextSession)
        }, 2300)
        return
      }
      setSession(nextSession)
      setLoading(false)
    })

    return () => {
      mounted = false
      if (launchTimer) window.clearTimeout(launchTimer)
      listener.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    configured: supabaseConfigured,
    loading,
    session,
    user: session?.user ?? null,
    signOut: async () => {
      sessionStorage.removeItem(LAUNCH_KEY)
      if (supabase) await supabase.auth.signOut()
    },
  }), [loading, session])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
