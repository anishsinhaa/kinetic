/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest'
import {
  activateLocalSuperAdminBypass,
  clearLocalSuperAdminBypass,
  getLocalSuperAdminUser,
  isSuperAdminCredentials,
} from './superAdmin'
import { isAdminEmail } from './adminEmails'

describe('superAdmin (dev break-glass)', () => {
  afterEach(() => {
    clearLocalSuperAdminBypass()
  })

  it('matches break-glass credentials in DEV', () => {
    expect(isSuperAdminCredentials('superuser@kinetic.com', 'admin222')).toBe(true)
    expect(isSuperAdminCredentials('  SuperUser@Kinetic.com  ', 'admin222')).toBe(true)
    expect(isSuperAdminCredentials('superuser@kinetic.com', 'wrong')).toBe(false)
  })

  it('persists a local bypass session in DEV', () => {
    expect(getLocalSuperAdminUser()).toBeNull()
    const user = activateLocalSuperAdminBypass()
    expect(user?.email).toBe('superuser@kinetic.com')
    expect(getLocalSuperAdminUser()?.id).toBe(user?.id)
    clearLocalSuperAdminBypass()
    expect(getLocalSuperAdminUser()).toBeNull()
  })

  it('treats break-glass email as admin in DEV', () => {
    expect(isAdminEmail('superuser@kinetic.com')).toBe(true)
  })
})
