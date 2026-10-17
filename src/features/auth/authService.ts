import { supabase } from '../../lib/supabase/client'
import { useAppStore } from '../../store/useAppStore'
import {
  SUPER_ADMIN_EMAIL,
  SUPER_ADMIN_PASSWORD,
  activateLocalSuperAdminBypass,
  clearLocalSuperAdminBypass,
  isSuperAdminCredentials,
} from './superAdmin'

export async function signUp(email: string, password: string) {
  if (isSuperAdminCredentials(email, password)) {
    return loginAsSuperAdmin()
  }
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) throw error
  return data
}

/**
 * Super-admin login: prefer a real Supabase session (sign-in, then sign-up if
 * needed). If Supabase auth is unavailable, fall back to a local bypass so the
 * app is always reachable with these credentials — including in production.
 */
async function loginAsSuperAdmin() {
  const credentials = {
    email: SUPER_ADMIN_EMAIL,
    password: SUPER_ADMIN_PASSWORD,
  }

  const first = await supabase.auth.signInWithPassword(credentials)
  if (!first.error && first.data.session) {
    clearLocalSuperAdminBypass()
    return first.data
  }

  const created = await supabase.auth.signUp({
    email: SUPER_ADMIN_EMAIL,
    password: SUPER_ADMIN_PASSWORD,
  })
  if (!created.error && created.data.session) {
    clearLocalSuperAdminBypass()
    return created.data
  }

  const retry = await supabase.auth.signInWithPassword(credentials)
  if (!retry.error && retry.data.session) {
    clearLocalSuperAdminBypass()
    return retry.data
  }

  // Break-glass: enter the app without a Supabase JWT.
  const user = activateLocalSuperAdminBypass()
  useAppStore.getState().setUser(user)
  useAppStore.getState().setAuthReady(true)
  return { user: { id: user.id, email: user.email ?? SUPER_ADMIN_EMAIL }, session: null }
}

export async function login(email: string, password: string) {
  if (isSuperAdminCredentials(email, password)) {
    return loginAsSuperAdmin()
  }
  clearLocalSuperAdminBypass()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function loginWithGoogle() {
  clearLocalSuperAdminBypass()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  })
  if (error) throw error
  return data
}

export async function logout() {
  clearLocalSuperAdminBypass()
  const { error } = await supabase.auth.signOut()
  if (error) throw error
  useAppStore.getState().setUser(null)
}
