import { describe, expect, it, vi } from 'vitest'
import { getAdminEmails, isAdminEmail } from './adminEmails'

describe('adminEmails', () => {
  it('parses VITE_ADMIN_EMAILS', () => {
    vi.stubEnv('VITE_ADMIN_EMAILS', 'alice@example.com, Bob@Example.com ')
    expect(getAdminEmails()).toEqual(['alice@example.com', 'bob@example.com'])
    expect(isAdminEmail('alice@example.com')).toBe(true)
    expect(isAdminEmail('bob@example.com')).toBe(true)
    expect(isAdminEmail('other@example.com')).toBe(false)
    vi.unstubAllEnvs()
  })

  it('returns empty list when unset', () => {
    vi.stubEnv('VITE_ADMIN_EMAILS', '')
    expect(getAdminEmails()).toEqual([])
    vi.unstubAllEnvs()
  })
})
