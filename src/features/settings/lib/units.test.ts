import { describe, expect, it } from 'vitest'
import {
  LB_PER_KG,
  displayToKg,
  displayWeightString,
  formatVolume,
  formatWeight,
  kgToDisplay,
  roundDisplayWeight,
  toStoredKg,
} from './units'

describe('weight units (canonical kg)', () => {
  it('converts lb display to kg for storage', () => {
    expect(displayToKg(20, 'lb')).toBeCloseTo(20 / LB_PER_KG, 6)
    expect(displayToKg(100, 'kg')).toBe(100)
  })

  it('converts kg storage to lb for display', () => {
    expect(kgToDisplay(20 / LB_PER_KG, 'lb')).toBeCloseTo(20, 6)
    expect(kgToDisplay(100, 'kg')).toBe(100)
  })

  it('round-trips display → kg → display for lb', () => {
    const entered = 45
    const stored = displayToKg(entered, 'lb')
    const shown = roundDisplayWeight(kgToDisplay(stored, 'lb'), 'lb')
    expect(shown).toBeCloseTo(entered, 1)
  })

  it('does not alter existing kg rows when displaying as kg', () => {
    expect(formatWeight(20, 'kg')).toBe('20 kg')
    expect(formatWeight(102.5, 'kg')).toBe('102.5 kg')
  })

  it('labels volume in the active unit', () => {
    expect(formatVolume(160, 'kg')).toBe('160 kg')
    // 160 kg ≈ 353 lb
    expect(formatVolume(160, 'lb')).toMatch(/353 lb/)
  })

  it('formats null safely', () => {
    expect(formatWeight(null, 'lb')).toBe('—')
    expect(formatVolume(0, 'lb')).toBe('—')
  })

  it('stores lb input as kg with NUMERIC(6,2) precision', () => {
    expect(toStoredKg(20, 'lb')).toBeCloseTo(9.07, 2)
    expect(toStoredKg(20, 'kg')).toBe(20)
  })

  it('formats display strings without unit suffix', () => {
    expect(displayWeightString(20, 'kg')).toBe('20')
    expect(displayWeightString(toStoredKg(20, 'lb'), 'lb')).toBe('20')
  })
})
