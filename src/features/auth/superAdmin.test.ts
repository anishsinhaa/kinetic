/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest'
import {
  SUPER_ADMIN_EMAIL,
  SUPER_ADMIN_PASSWORD,
  activateLocalSuperAdminBypass,
  clearLocalSuperAdminBypass,
  getLocalSuperAdminUser,
  isSuperAdminCredentials,
  isSuperAdminEmail,
} from './superAdmin'

describe('superAdmin', () => {
  afterEach(() => {
    clearLocalSuperAdminBypass()
  })

  it('matches the break-glass credentials', () => {
    expect(isSuperAdminCredentials(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD)).toBe(true)
    expect(isSuperAdminCredentials('  SuperUser@Kinetic.com  ', SUPER_ADMIN_PASSWORD)).toBe(true)
    expect(isSuperAdminCredentials(SUPER_ADMIN_EMAIL, 'wrong')).toBe(false)
    expect(isSuperAdminEmail(SUPER_ADMIN_EMAIL)).toBe(true)
  })

  it('persists a local bypass session', () => {
    expect(getLocalSuperAdminUser()).toBeNull()
    const user = activateLocalSuperAdminBypass()
    expect(user.email).toBe(SUPER_ADMIN_EMAIL)
    expect(getLocalSuperAdminUser()?.id).toBe(user.id)
    clearLocalSuperAdminBypass()
    expect(getLocalSuperAdminUser()).toBeNull()
  })
})
