import type { AuthUser } from '../../store/useAppStore'

/** Hard-coded break-glass admin — works in all environments including prod. */
export const SUPER_ADMIN_EMAIL = 'superuser@kinetic.com'
export const SUPER_ADMIN_PASSWORD = 'admin222'

/** Stable local id when Supabase auth is unavailable (RLS-backed writes will fail). */
export const SUPER_ADMIN_LOCAL_ID = '00000000-0000-4000-8000-000000000001'

const BYPASS_STORAGE_KEY = 'kinetic_super_admin_bypass'

export function isSuperAdminCredentials(email: string, password: string): boolean {
  return email.trim().toLowerCase() === SUPER_ADMIN_EMAIL && password === SUPER_ADMIN_PASSWORD
}

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  return (email ?? '').trim().toLowerCase() === SUPER_ADMIN_EMAIL
}

export function activateLocalSuperAdminBypass(): AuthUser {
  if (typeof window !== 'undefined') {
    window.sessionStorage.setItem(BYPASS_STORAGE_KEY, '1')
  }
  return { id: SUPER_ADMIN_LOCAL_ID, email: SUPER_ADMIN_EMAIL }
}

export function clearLocalSuperAdminBypass(): void {
  if (typeof window !== 'undefined') {
    window.sessionStorage.removeItem(BYPASS_STORAGE_KEY)
  }
}

export function getLocalSuperAdminUser(): AuthUser | null {
  if (typeof window === 'undefined') return null
  if (window.sessionStorage.getItem(BYPASS_STORAGE_KEY) !== '1') return null
  return { id: SUPER_ADMIN_LOCAL_ID, email: SUPER_ADMIN_EMAIL }
}
