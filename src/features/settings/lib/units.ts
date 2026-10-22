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
  opts?: { decimals?: number; step?: number | null },
): string {
  if (kg == null || !Number.isFinite(kg)) return '—'
  if (opts?.step != null && Number.isFinite(opts.step) && opts.step > 0) {
    return `${roundWeightForDisplay(kg, units, opts.step)} ${units}`
  }
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

/** Snap a number to the nearest multiple of `step` (float-noise free). */
export function snapToStep(value: number, step: number): number {
  if (!Number.isFinite(step) || step <= 0) return value
  return Number((Math.round(value / step) * step).toFixed(4))
}

/**
 * Weight shown in the UI for a stored kg value.
 *
 * kg values are shown as stored (2 decimals max). lb values are converted and
 * snapped to the user's weight step so conversion noise (187.39, 220.46) never
 * leaks into the UI. `step` is in display units (see Settings → Weight step).
 * A value within 0.05 of a whole number is treated as that whole number, so a
 * weight typed in lb (226) round-trips through kg storage unchanged.
 */
export function roundWeightForDisplay(
  kg: number,
  units: WeightUnits,
  step?: number | null,
): number {
  const display = units === 'kg' ? kg : kgToDisplay(kg, 'lb')
  // A value typed as a whole number (226 lb) round-trips through kg storage.
  if (units === 'lb') {
    const whole = Math.round(display)
    if (Math.abs(display - whole) <= 0.05) return whole
  }
  if (step != null && Number.isFinite(step) && step > 0) return snapToStep(display, step)
  if (units === 'kg') return roundDisplayWeight(kg, 'kg')
  return Math.round(display)
}

/** Like displayWeightString, but snapped to the user's step for lb. */
export function displayWeightStringStepped(
  kg: number | null | undefined,
  units: WeightUnits,
  step?: number | null,
): string {
  if (kg == null || !Number.isFinite(kg)) return ''
  return String(roundWeightForDisplay(kg, units, step))
}

/** "100 kg × 5" / "226 lb × 5". Missing reps render as "—". */
export function formatSetLine(
  kg: number | null | undefined,
  reps: number | null | undefined,
  units: WeightUnits,
  step?: number | null,
): string {
  const w =
    kg == null || !Number.isFinite(kg) ? '—' : `${roundWeightForDisplay(kg, units, step)} ${units}`
  const r = reps == null || !Number.isFinite(reps) ? '—' : String(reps)
  return `${w} × ${r}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2026-10-18" → "18 Oct" (no timezone math). */
export function formatShortDate(isoDate: string | null | undefined): string {
  if (!isoDate) return ''
  const m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return ''
  const month = MONTHS[Number(m[2]) - 1]
  if (!month) return ''
  return `${Number(m[3])} ${month}`
}

/** "PR 226 lb × 5 · 18 Oct" */
export function formatPrLine(
  pr: { weight: number | null; reps: number | null; date?: string | null },
  units: WeightUnits,
  step?: number | null,
): string {
  const date = formatShortDate(pr.date)
  return `PR ${formatSetLine(pr.weight, pr.reps, units, step)}${date ? ` · ${date}` : ''}`
}
