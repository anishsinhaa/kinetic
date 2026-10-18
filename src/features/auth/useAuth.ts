import { useEffect } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase/client'
import { useAppStore } from '../../store/useAppStore'

function sessionToUser(session: Session | null) {
  return session?.user
    ? { id: session.user.id, email: session.user.email }
    : null
}

/**
 * useAuthListener — call ONCE at the app root (App.tsx).
 * Sets up the Supabase auth state listener and syncs to the Zustand store.
 * On session/refresh failure, signs out and marks auth ready so the login page shows.
 */
export function useAuthListener() {
  const setUser = useAppStore((s) => s.setUser)
  const setAuthReady = useAppStore((s) => s.setAuthReady)

  useEffect(() => {
    let cancelled = false

    const clearSessionAndShowLogin = async () => {
      try {
        await supabase.auth.signOut()
      } catch {
        // Ignore sign-out failures — still clear local auth state below.
      }
      if (cancelled) return
      setUser(null)
      setAuthReady(true)
    }

    supabase.auth
      .getSession()
      .then(({ data: { session }, error }) => {
        if (cancelled) return
        if (error) {
          void clearSessionAndShowLogin()
          return
        }
        setUser(sessionToUser(session))
        setAuthReady(true)
      })
      .catch(() => {
        void clearSessionAndShowLogin()
      })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return

      // Refresh failed — sign out cleanly instead of hanging on Loading.
      if (event === 'TOKEN_REFRESHED' && !session) {
        void clearSessionAndShowLogin()
        return
      }

      setUser(sessionToUser(session))
      setAuthReady(true)
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [setUser, setAuthReady])
}

/**
 * useCurrentUser — read-only, safe to call from any component.
 * Returns the authenticated user and whether auth has finished initialising.
 */
export function useCurrentUser() {
  const user = useAppStore((s) => s.user)
  const isAuthReady = useAppStore((s) => s.isAuthReady)
  return { user, isAuthReady }
}
