import { describe, expect, it } from 'vitest'
import { suggestNextType } from './suggestNextType'

describe('suggestNextType', () => {
  it('suggests Pull after Push in PPL rotation', () => {
    expect(suggestNextType(['Push'])).toBe('Pull')
    expect(suggestNextType(['Pull'])).toBe('Legs')
    expect(suggestNextType(['Legs'])).toBe('Push')
  })

  it('falls back to first available type when no history', () => {
    expect(suggestNextType([])).toBe('Push')
  })

  it('cycles available types when last is outside PPL', () => {
    expect(suggestNextType(['Upper'])).toBe('Lower')
  })
})
