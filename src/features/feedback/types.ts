// ---------------------------------------------------------------------------
// Domain types for body feedback / recovery tracking
// ---------------------------------------------------------------------------

export interface SorenessEntry {
  muscle_group: string
  level: number   // 1 = mild, 2 = moderate, 3 = severe
}

export interface BodyFeedback {
  id: string
  date: string            // "YYYY-MM-DD"
  fatigue: number | null         // 1–10
  sleep_quality: number | null   // 1–10
  pain_flag: boolean
  soreness: SorenessEntry[]
  /** ISO timestamp of last save (updated_at ?? created_at). */
  savedAt: string | null
}

export interface FeedbackPayload {
  fatigue: number         // 1–10
  /** Optional — sleep hours live on the daily log; quality is optional here */
  sleepQuality: number | null
  painFlag: boolean
  soreness: SorenessEntry[]
}

// Derived helpers — never invent fake defaults for missing fields
export function recoveryScoreFromFeedback(fb: BodyFeedback): number | null {
  if (fb.fatigue == null) return null
  const invertedFatigue = 11 - fb.fatigue
  if (fb.sleep_quality == null) {
    return Math.round((invertedFatigue / 10) * 100)
  }
  const raw = ((invertedFatigue + fb.sleep_quality) / 20) * 100
  return Math.round(raw)
}

export function recoveryLabel(score: number): string {
  if (score >= 80) return 'Optimal'
  if (score >= 60) return 'Good'
  if (score >= 40) return 'Moderate'
  return 'Low'
}

export const SORENESS_LEVELS = [
  { level: 1, label: 'Mild', color: 'text-yellow-400 border-yellow-600 bg-yellow-900/30' },
  { level: 2, label: 'Moderate', color: 'text-orange-400 border-orange-600 bg-orange-900/30' },
  { level: 3, label: 'Severe', color: 'text-red-400 border-red-600 bg-red-900/30' },
] as const

export const MUSCLE_GROUPS = [
  'Chest',
  'Back',
  'Shoulders',
  'Arms',
  'Quads',
  'Hamstrings',
  'Glutes',
  'Calves',
] as const
