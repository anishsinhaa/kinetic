import type { AuthUser } from '../../store/useAppStore'

const BYPASS_STORAGE_KEY = 'kinetic_super_admin_bypass'

/**
 * Dev-only break-glass credentials. Credential string literals live only inside
 * `import.meta.env.DEV` branches so production builds strip them completely.
 */
export function isSuperAdminCredentials(email: string, password: string): boolean {
  if (!import.meta.env.DEV) return false
  return (
    email.trim().toLowerCase() === 'superuser@kinetic.com' && password === 'admin222'
  )
}

export function activateLocalSuperAdminBypass(): AuthUser | null {
  if (!import.meta.env.DEV) return null
  if (typeof window !== 'undefined') {
    window.sessionStorage.setItem(BYPASS_STORAGE_KEY, '1')
  }
  return {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'superuser@kinetic.com',
  }
}

export function clearLocalSuperAdminBypass(): void {
  if (typeof window !== 'undefined') {
    window.sessionStorage.removeItem(BYPASS_STORAGE_KEY)
  }
}

export function getLocalSuperAdminUser(): AuthUser | null {
  if (!import.meta.env.DEV) return null
  if (typeof window === 'undefined') return null
  if (window.sessionStorage.getItem(BYPASS_STORAGE_KEY) !== '1') return null
  return {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'superuser@kinetic.com',
  }
}
