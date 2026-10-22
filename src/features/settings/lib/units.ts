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

/** Plate increment for the active unit: 2.5 kg or 5 lb. */
export function defaultWeightStep(units: WeightUnits): number {
  return units === 'lb' ? 5 : 2.5
}

/**
 * Step is stored in the active display unit. Switching units converts it.
 * The usual plate pair stays exact (2.5 kg ↔ 5 lb); any other step is scaled
 * by the kg/lb factor and snapped to 0.25.
 */
export function convertWeightStep(step: number, from: WeightUnits, to: WeightUnits): number {
  if (from === to) return step
  if (!Number.isFinite(step) || step <= 0) return defaultWeightStep(to)
  if (from === 'kg' && to === 'lb' && Math.abs(step - 2.5) < 0.001) return 5
  if (from === 'lb' && to === 'kg' && Math.abs(step - 5) < 0.001) return 2.5
  const converted = from === 'kg' ? step * LB_PER_KG : step / LB_PER_KG
  return snapToStep(converted, 0.25)
}

/** Body weight stays at 0.1 in the display unit. It does not use the lifting step. */
export function roundBodyWeight(kg: number, units: WeightUnits): number {
  const display = kgToDisplay(kg, units)
  return Math.round(display * 10) / 10
}

/**
 * Volume in kg from the same rounded display weights the set lines show,
 * so the summary total matches those lines.
 */
export function volumeKgMatchingDisplay(
  sets: Array<{ weight: number | null; reps: number | null }>,
  units: WeightUnits,
  step?: number | null,
): number {
  let display = 0
  for (const set of sets) {
    if (set.weight == null || set.reps == null) continue
    if (!Number.isFinite(set.weight) || !Number.isFinite(set.reps)) continue
    display += roundWeightForDisplay(set.weight, units, step) * set.reps
  }
  if (display <= 0) return 0
  return units === 'kg' ? display : displayToKg(display, 'lb')
}

/**
 * Weight shown in the UI for a stored kg value.
 *
 * `step` is in the active display unit (2.5 kg or 5 lb by default). Both kg
 * and lb snap to that step. A lb value within 0.05 of a whole number is
 * treated as that whole number, so a weight typed in lb (226) round-trips
 * through kg storage unchanged.
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
