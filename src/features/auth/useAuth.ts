import { useEffect } from 'react'
import { supabase } from '../../lib/supabase/client'
import { useAppStore } from '../../store/useAppStore'

/**
 * useAuthListener — call ONCE at the app root (App.tsx).
 * Sets up the Supabase auth state listener and syncs to the Zustand store.
 */
export function useAuthListener() {
  const setUser = useAppStore((s) => s.setUser)
  const setAuthReady = useAppStore((s) => s.setAuthReady)

  useEffect(() => {
    // Resolve the initial session before showing any UI
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(
        session?.user
          ? { id: session.user.id, email: session.user.email }
          : null,
      )
      setAuthReady(true)
    })

    // Keep store in sync on sign-in / sign-out / token refresh
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(
        session?.user
          ? { id: session.user.id, email: session.user.email }
          : null,
      )
    })

    return () => subscription.unsubscribe()
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
