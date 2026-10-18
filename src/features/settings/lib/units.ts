/**
 * Canonical storage is kilograms. Convert at the UI boundary only.
 */

import type { WeightUnits } from '../../../lib/supabase/database.types'

/** Exact factor used for lb ↔ kg (NIST). */
export const LB_PER_KG = 2.2046226218

export function kgToDisplay(kg: number, units: WeightUnits): number {
  if (units === 'kg') return kg
  return kg * LB_PER_KG
}

export function displayToKg(display: number, units: WeightUnits): number {
  if (units === 'kg') return display
  return display / LB_PER_KG
}

/** Round for stepper / display (1 decimal lb, 2 decimal kg). */
export function roundDisplayWeight(value: number, units: WeightUnits): number {
  const places = units === 'lb' ? 1 : 2
  const f = 10 ** places
  return Math.round(value * f) / f
}

/** Canonical kg rounded to match `sets.weight NUMERIC(6,2)`. */
export function toStoredKg(display: number, units: WeightUnits): number {
  return Math.round(displayToKg(display, units) * 100) / 100
}

/** Display string for a kg value (no unit suffix). */
export function displayWeightString(
  kg: number | null | undefined,
  units: WeightUnits,
): string {
  if (kg == null || !Number.isFinite(kg)) return ''
  return String(roundDisplayWeight(kgToDisplay(kg, units), units))
}

export function formatWeight(
  kg: number | null | undefined,
  units: WeightUnits,
  opts?: { decimals?: number },
): string {
  if (kg == null || !Number.isFinite(kg)) return '—'
  const display = kgToDisplay(kg, units)
  const decimals = opts?.decimals ?? (units === 'lb' ? 1 : 2)
  const n = Number(display.toFixed(decimals))
  return `${n} ${units}`
}

export function formatVolume(
  volumeKg: number | null | undefined,
  units: WeightUnits,
): string {
  if (volumeKg == null || !Number.isFinite(volumeKg) || volumeKg <= 0) return '—'
  const display = units === 'kg' ? volumeKg : volumeKg * LB_PER_KG
  if (display >= 1000) return `${(display / 1000).toFixed(1)}k ${units}`
  return `${Math.round(display)} ${units}`
}

export function weightUnitLabel(units: WeightUnits): string {
  return units
}
