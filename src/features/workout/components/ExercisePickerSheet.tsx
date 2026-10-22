import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Search, Loader2, X } from 'lucide-react'
import { BottomSheet } from '../../../components/ui/BottomSheet'
import { cn } from '../../../lib/utils'
import {
  getExercisesByIds,
  getUserCustomExercises,
  searchExercisesFromDb,
} from '../services/exerciseService'
import { getExercisePrefillContext, getRecentExerciseIds } from '../services/workoutService'
import { musclesForWorkoutType } from '../lib/typeMuscleMap'
import type { Exercise } from '../../exercises/types'

type ExercisePickerSheetProps = {
  open: boolean
  onClose: () => void
  userId: string
  workoutType: string
  /** Exercises already in this session — shown with an "Added" badge, not hidden. */
  excludeExerciseIds: string[]
  onPick: (exercise: Exercise) => void
}

function ExerciseRowButton({
  ex,
  added,
  onPick,
}: {
  ex: Exercise
  added: boolean
  onPick: (exercise: Exercise) => void
}) {
  return (
    <button
      type="button"
      disabled={added}
      onClick={() => onPick(ex)}
      className={cn(
        'w-full text-left px-4 py-3 rounded-xl border bg-surface-2 transition-colors min-h-14',
        added ? 'border-border opacity-60' : 'border-border hover:border-primary',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text-primary truncate">{ex.name}</p>
          <p className="text-[11px] uppercase tracking-widest text-text-secondary mt-0.5 truncate">
            {ex.muscleGroup}
            {ex.isCustom ? ' · Custom' : ''}
          </p>
        </div>
        {added && (
          <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-primary">
            Added
          </span>
        )}
      </div>
    </button>
  )
}

export function ExercisePickerSheet({
  open,
  onClose,
  userId,
  workoutType,
  excludeExerciseIds,
  onPick,
}: ExercisePickerSheetProps) {
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [typeFilterOn, setTypeFilterOn] = useState(false)
  const muscles = musclesForWorkoutType(workoutType)
  const queryClient = useQueryClient()

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(search), 200)
    return () => window.clearTimeout(t)
  }, [search])

  const recentQuery = useQuery({
    queryKey: ['exercises', 'recent-ids', userId],
    queryFn: () => getRecentExerciseIds(userId),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  })
  const recentIds = useMemo(() => (recentQuery.data ?? []).slice(0, 8), [recentQuery.data])

  const recentExercisesQuery = useQuery({
    queryKey: ['exercises', 'by-ids', recentIds],
    queryFn: () => getExercisesByIds(recentIds),
    enabled: open && recentIds.length > 0,
    staleTime: 5 * 60 * 1000,
  })

  // Warm last-session/PR cache for recent picks so "Loading last session…" is instant
  useEffect(() => {
    if (!open) return
    for (const exerciseId of recentIds.slice(0, 6)) {
      void queryClient.prefetchQuery({
        queryKey: ['exercise-prefill', userId, exerciseId],
        queryFn: () => getExercisePrefillContext(userId, exerciseId),
        staleTime: 1000 * 60 * 5,
      })
    }
  }, [open, recentIds, userId, queryClient])

  const q = debounced.trim()
  const libraryQuery = useQuery({
    queryKey: ['exercises', 'library', q, null],
    queryFn: () => searchExercisesFromDb({ name: q || undefined, limit: 80 }),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  })

  const customQuery = useQuery({
    queryKey: ['exercises', 'custom', userId],
    queryFn: () => getUserCustomExercises(userId),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  })

  const added = useMemo(() => new Set(excludeExerciseIds), [excludeExerciseIds])
  const searching = q.length > 0
  const filterActive = Boolean(muscles) && typeFilterOn && !searching

  const libraryData = libraryQuery.data
  const customData = customQuery.data
  const recentData = recentExercisesQuery.data

  const { recentRows, rows } = useMemo(() => {
    const matchesFilter = (ex: Exercise) =>
      !filterActive || !muscles || muscles.some((m) => m.toLowerCase() === ex.muscleGroup.toLowerCase())

    const customMatches = (customData ?? []).filter((ex) =>
      searching ? ex.name.toLowerCase().includes(q.toLowerCase()) : true,
    )
    const seen = new Set<string>()
    const all: Exercise[] = []
    for (const ex of [...(libraryData ?? []), ...customMatches]) {
      if (seen.has(ex.id)) continue
      seen.add(ex.id)
      all.push(ex)
    }

    const lc = q.toLowerCase()
    const sorted = all.filter(matchesFilter).sort((a, b) => {
      if (lc) {
        const as = a.name.toLowerCase().startsWith(lc) ? 0 : 1
        const bs = b.name.toLowerCase().startsWith(lc) ? 0 : 1
        if (as !== bs) return as - bs
      }
      return a.name.localeCompare(b.name)
    })

    // Recents lead the browse list (never while a search is active)
    const recents = searching ? [] : (recentData ?? []).filter(matchesFilter)
    const shown = new Set(recents.map((r) => r.id))
    return {
      recentRows: recents,
      rows: sorted.filter((ex) => !shown.has(ex.id)),
    }
  }, [
    libraryData,
    customData,
    recentData,
    muscles,
    filterActive,
    searching,
    q,
  ])

  const loading = libraryQuery.isLoading && rows.length === 0

  return (
    <BottomSheet open={open} onClose={onClose} title="Add exercise" className="h-[min(80dvh,640px)]">
      <div className="sticky top-0 z-10 bg-surface p-4 pb-3 space-y-2 border-b border-border">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search all exercises…"
            aria-label="Search exercises"
            className="w-full bg-surface-2 border border-border rounded-xl pl-10 pr-3 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-hidden focus:border-primary min-h-11"
          />
        </div>
        {muscles && (
          <div className="flex items-center gap-2 min-h-8">
            {typeFilterOn ? (
              <button
                type="button"
                onClick={() => setTypeFilterOn(false)}
                aria-label={`Remove ${workoutType} filter`}
                className="inline-flex items-center gap-1.5 rounded-full border border-primary/60 bg-primary/10 text-primary px-3 min-h-8 text-xs font-semibold"
              >
                {workoutType} exercises
                <X size={12} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setTypeFilterOn(true)}
                className="inline-flex items-center rounded-full border border-border text-text-secondary px-3 min-h-8 text-xs font-semibold hover:border-primary"
              >
                Filter by {workoutType}
              </button>
            )}
            {searching && typeFilterOn && (
              <span className="text-[11px] text-text-secondary">Searching all exercises</span>
            )}
          </div>
        )}
      </div>

      <div className="p-4 space-y-2">
        {loading && (
          <div className="flex justify-center py-10">
            <Loader2 className="animate-spin text-primary" size={20} />
          </div>
        )}

        {recentRows.length > 0 && (
          <>
            <p className="text-[11px] text-text-secondary uppercase tracking-widest pt-1">Recent</p>
            {recentRows.map((ex) => (
              <ExerciseRowButton key={`r-${ex.id}`} ex={ex} added={added.has(ex.id)} onPick={onPick} />
            ))}
            {rows.length > 0 && (
              <p className="text-[11px] text-text-secondary uppercase tracking-widest pt-2">All</p>
            )}
          </>
        )}

        {rows.map((ex) => (
          <ExerciseRowButton key={ex.id} ex={ex} added={added.has(ex.id)} onPick={onPick} />
        ))}

        {!loading && rows.length === 0 && recentRows.length === 0 && (
          <p className="text-sm text-text-muted text-center py-8">No exercises match.</p>
        )}
      </div>
    </BottomSheet>
  )
}
