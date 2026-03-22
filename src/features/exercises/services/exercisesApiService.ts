const API_BASE = 'https://api.api-ninjas.com/v1/exercises'

/** Converts API muscle strings like "lower_back" → "Lower Back" */
export function formatMuscle(m: string): string {
  return m.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export type ApiExercise = {
  name: string
  type: string
  muscle: string
  difficulty: string
  instructions: string
  equipments: string[]
  safety_info?: string
}

export type ApiSearchParams = {
  name?: string
  muscle?: string
  difficulty?: string
  offset?: number
}

export function hasApiKey(): boolean {
  return Boolean(import.meta.env.VITE_EXERCISES_API_KEY)
}

export async function searchExercises(params: ApiSearchParams): Promise<ApiExercise[]> {
  const key = import.meta.env.VITE_EXERCISES_API_KEY as string
  if (!key) return []

  const qs = new URLSearchParams()
  if (params.name?.trim()) qs.set('name', params.name.trim())
  if (params.muscle) qs.set('muscle', params.muscle)
  if (params.difficulty) qs.set('difficulty', params.difficulty)
  if (params.offset) qs.set('offset', String(params.offset))

  const res = await fetch(`${API_BASE}?${qs}`, {
    headers: { 'X-Api-Key': key },
  })

  if (!res.ok) {
    const body = await res.text().catch(() => res.statusText)
    throw new Error(`Exercise API error ${res.status}: ${body}`)
  }

  return (await res.json()) as ApiExercise[]
}
