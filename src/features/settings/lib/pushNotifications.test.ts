import { afterEach, describe, expect, it, vi } from 'vitest'
import { getVapidPublicKey, requireVapidPublicKey, PushSubscribeError } from './pushNotifications'

describe('VAPID public key (build-time)', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('getVapidPublicKey returns null when unset', () => {
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', '')
    expect(getVapidPublicKey()).toBeNull()
  })

  it('requireVapidPublicKey throws a clear build-time error when missing', () => {
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', '')
    expect(() => requireVapidPublicKey()).toThrow(PushSubscribeError)
    try {
      requireVapidPublicKey()
    } catch (err) {
      expect(err).toBeInstanceOf(PushSubscribeError)
      expect((err as PushSubscribeError).step).toBe('vapid')
      expect((err as PushSubscribeError).message).toMatch(/missing from this build/i)
    }
  })

  it('requireVapidPublicKey accepts a plausible URL-safe key', () => {
    const key =
      'BLc4B3kvvsNUbwYnZctq7XgKahvsZkd9M8GRbdsyqKctFtt4p4hDMAE0zJfTrv4Xjh85gjnDzMAzWmxRbjAD0U8'
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', key)
    expect(requireVapidPublicKey()).toBe(key)
  })

  it('requireVapidPublicKey rejects a short key', () => {
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'tooshort')
    expect(() => requireVapidPublicKey()).toThrow(/invalid/i)
  })
})
