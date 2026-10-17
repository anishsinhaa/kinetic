import { supabase } from '../../lib/supabase/client'
import { useAppStore } from '../../store/useAppStore'
import {
  activateLocalSuperAdminBypass,
  clearLocalSuperAdminBypass,
  isSuperAdminCredentials,
} from './superAdmin'

export async function signUp(email: string, password: string) {
  if (import.meta.env.DEV && isSuperAdminCredentials(email, password)) {
    return loginAsSuperAdmin()
  }
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) throw error
  return data
}

/**
 * Dev-only super-admin login: Supabase sign-in → auto-signup → local bypass.
 * Entire path is gated by `import.meta.env.DEV` so it is absent from production.
 */
async function loginAsSuperAdmin() {
  if (!import.meta.env.DEV) {
    throw new Error('Super-admin login is only available in development.')
  }

  const credentials = {
    email: 'superuser@kinetic.com',
    password: 'admin222',
  }

  const first = await supabase.auth.signInWithPassword(credentials)
  if (!first.error && first.data.session) {
    clearLocalSuperAdminBypass()
    return first.data
  }

  const created = await supabase.auth.signUp(credentials)
  if (!created.error && created.data.session) {
    clearLocalSuperAdminBypass()
    return created.data
  }

  const retry = await supabase.auth.signInWithPassword(credentials)
  if (!retry.error && retry.data.session) {
    clearLocalSuperAdminBypass()
    return retry.data
  }

  const user = activateLocalSuperAdminBypass()
  if (!user) {
    throw new Error('Super-admin login is only available in development.')
  }
  useAppStore.getState().setUser(user)
  useAppStore.getState().setAuthReady(true)
  return { user: { id: user.id, email: user.email ?? credentials.email }, session: null }
}

export async function login(email: string, password: string) {
  if (import.meta.env.DEV && isSuperAdminCredentials(email, password)) {
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
