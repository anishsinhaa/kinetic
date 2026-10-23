/**
 * Client-side exercise search over the full catalogue (curated + custom).
 * Pure functions, no I/O. "t bar" finds "T-Bar Row", "pec dec" finds
 * "Pec Deck Fly", "db curl" finds "Dumbbell Curl".
 */

export type SearchableExercise = {
  name: string
  /** Comma-separated aliases (exercises.search_terms). */
  searchTerms?: string | null
  muscleGroup?: string | null
  equipment?: string | null
}

/** Lowercase, strip accents, keep only a-z0-9 ("T-Bar Row" -> "tbarrow"). */
export function compactKey(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '')
}

const ABBREVIATIONS: Record<string, string> = {
  db: 'dumbbell',
  dbs: 'dumbbell',
  bb: 'barbell',
  kb: 'kettlebell',
  bw: 'bodyweight',
  ohp: 'overhead press',
  rdl: 'romanian deadlift',
  sldl: 'stiff leg deadlift',
  bss: 'bulgarian split squat',
  tri: 'triceps',
  tris: 'triceps',
  bi: 'biceps',
  bis: 'biceps',
}

/** Crude singular form so "flies"/"flyes"/"curls"/"raises" match "fly"/"curl"/"raise". */
function singular(word: string): string {
  if (word.length <= 3) return word
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`
  if (word.endsWith('yes')) return word.slice(0, -2)
  if (word.endsWith('ses') || word.endsWith('xes')) return word.slice(0, -2)
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1)
  return word
}

/** Query -> normalized tokens, abbreviations expanded ("db curls" -> ["dumbbell", "curl"]). */
export function queryTokens(query: string): string[] {
  const words = query
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
  const out: string[] = []
  for (const w of words) {
    const expanded = ABBREVIATIONS[w] ?? w
    for (const part of expanded.split(' ')) out.push(singular(part))
  }
  return out
}

type Prepared = {
  nameKey: string
  /** Compact keys starting at each word of the name ("T-Bar Row" -> tbarrow, barrow, row). */
  nameSuffixes: string[]
  /** Same, for every alias separately (never joined across aliases). */
  aliasSuffixes: string[]
  words: string[]
}

function wordSuffixes(text: string): string[] {
  const words = text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  return words.map((_, i) => words.slice(i).join(''))
}

function prepare(ex: SearchableExercise): Prepared {
  const aliases = (ex.searchTerms ?? '').split(',').map((a) => a.trim()).filter(Boolean)
  const all = [ex.name, ...aliases, ex.equipment ?? '', ex.muscleGroup ?? ''].join(' ')
  return {
    nameKey: compactKey(ex.name),
    nameSuffixes: wordSuffixes(ex.name),
    aliasSuffixes: aliases.flatMap(wordSuffixes),
    words: all.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map(singular),
  }
}

/** "t bar" -> ["tbar"]: a one-letter token is glued to the next one. */
function mergeShortTokens(tokens: string[]): string[] {
  const out: string[] = []
  let carry = ''
  for (const t of tokens) {
    if (t.length === 1) {
      carry += t
      continue
    }
    out.push(carry + t)
    carry = ''
  }
  if (carry) out.push(carry)
  return out
}

/**
 * 0 = no match. Higher is better:
 * 100 exact name, 80 name starts with the query, 60 a later word of the name
 * starts with it ("bar" in "T-Bar Row"), 50 an alias does, 30 every query word
 * is the start of some word in the name / aliases / equipment / muscle.
 * Matching ignores case, spaces and hyphens, and only starts at word
 * boundaries, so "rdl" does not match "trap bar dl".
 */
export function scoreExercise(ex: SearchableExercise, query: string): number {
  const qKey = compactKey(query)
  if (!qKey) return 1
  const p = prepare(ex)
  if (p.nameKey === qKey) return 100
  if (p.nameKey.startsWith(qKey)) return 80
  if (p.nameSuffixes.some((s) => s.startsWith(qKey))) return 60
  if (p.aliasSuffixes.some((s) => s.startsWith(qKey))) return 50
  const tokens = mergeShortTokens(queryTokens(query))
  if (tokens.length === 0) return 0
  const suffixes = [...p.nameSuffixes, ...p.aliasSuffixes]
  const ok = tokens.every(
    (t) => p.words.some((w) => w.startsWith(t)) || suffixes.some((s) => s.startsWith(t)),
  )
  return ok ? 30 : 0
}

/** Filter + rank. Ties keep shorter names first, then alphabetical. */
export function searchExercises<T extends SearchableExercise>(items: T[], query: string): T[] {
  const q = query.trim()
  if (!q) return items
  return items
    .map((item) => ({ item, score: scoreExercise(item, q) }))
    .filter((r) => r.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.item.name.length - b.item.name.length ||
        a.item.name.localeCompare(b.item.name),
    )
    .map((r) => r.item)
}
