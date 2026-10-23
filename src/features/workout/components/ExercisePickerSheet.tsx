import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Search, Loader2 } from 'lucide-react'
import { BottomSheet } from '../../../components/ui/BottomSheet'
import { cn } from '../../../lib/utils'
import { CreateExerciseForm } from '../../exercises/components/CreateExerciseForm'
import { searchExercises } from '../../exercises/lib/exerciseSearch'
import {
  CATEGORY_CHIPS,
  CATEGORY_LABELS,
  MUSCLE_OPTIONS,
  exerciseCategory,
  type MuscleCategory,
} from '../../exercises/lib/muscles'
import { getExerciseCatalog, getExercisesByIds } from '../services/exerciseService'
import { getExercisePrefillContext, getRecentExerciseIds } from '../services/workoutService'
import { categoriesForWorkoutType, matchesWorkoutType } from '../lib/typeMuscleMap'
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

type PickerFilter = 'type' | 'all' | MuscleCategory

function matchesFilter(ex: Exercise, filter: PickerFilter, workoutType: string): boolean {
  if (filter === 'all') return true
  if (filter === 'type') return matchesWorkoutType(ex, workoutType)
  return exerciseCategory(ex) === filter
}

function defaultMuscle(filter: PickerFilter, workoutType: string): string {
  const category =
    filter !== 'type' && filter !== 'all'
      ? filter
      : filter === 'type'
        ? (categoriesForWorkoutType(workoutType)?.[0] ?? null)
        : null
  if (!category) return 'Chest'
  return MUSCLE_OPTIONS.find((option) => option.category === category)?.muscle ?? 'Chest'
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
  const [filter, setFilter] = useState<PickerFilter>('all')
  const [creating, setCreating] = useState(false)
  const [seenOpen, setSeenOpen] = useState(open)
  if (open !== seenOpen) {
    setSeenOpen(open)
    if (open) {
      setSearch('')
      setDebounced('')
      setCreating(false)
      setFilter(categoriesForWorkoutType(workoutType) ? 'type' : 'all')
    }
  }
  const queryClient = useQueryClient()
  const typeCategories = categoriesForWorkoutType(workoutType)

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

  const catalogQuery = useQuery({
    queryKey: ['exercises', 'catalog', userId],
    queryFn: getExerciseCatalog,
    enabled: open,
    staleTime: 60 * 60 * 1000,
  })

  const added = useMemo(() => new Set(excludeExerciseIds), [excludeExerciseIds])
  const searching = debounced.trim().length > 0
  const allRows = useMemo(() => catalogQuery.data ?? [], [catalogQuery.data])

  const filteredList = useMemo(
    () => allRows.filter((ex) => matchesFilter(ex, filter, workoutType)),
    [allRows, filter, workoutType],
  )

  const searched = useMemo(
    () => searchExercises(filteredList, debounced),
    [filteredList, debounced],
  )
  const allMatches = useMemo(
    () => (searching ? searchExercises(allRows, debounced) : []),
    [searching, allRows, debounced],
  )

  const recentRows = useMemo(() => {
    if (searching) return []
    return (recentExercisesQuery.data ?? []).filter((ex) => matchesFilter(ex, filter, workoutType))
  }, [searching, recentExercisesQuery.data, filter, workoutType])

  const rows = useMemo(() => {
    if (searching) return searched
    const shown = new Set(recentRows.map((ex) => ex.id))
    return filteredList.filter((ex) => !shown.has(ex.id))
  }, [searching, searched, recentRows, filteredList])

  const loading = catalogQuery.isLoading && rows.length === 0 && recentRows.length === 0
  const typedName = search.trim()
  const noMatchesAnywhere = searching && allMatches.length === 0
  const showAllMatches = searching && searched.length === 0 && allMatches.length > 0

  const chips: Array<{ id: PickerFilter; label: string }> = [
    ...(typeCategories ? [{ id: 'type' as const, label: workoutType }] : []),
    { id: 'all', label: 'All' },
    ...CATEGORY_CHIPS.map((id) => ({ id, label: CATEGORY_LABELS[id] })),
  ]

  return (
    <BottomSheet open={open} onClose={onClose} title="Add exercise" className="h-[min(80dvh,640px)]">
      <div className="sticky top-0 z-10 bg-surface p-4 pb-3 space-y-2 border-b border-border">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search exercises (e.g. t bar row)"
            aria-label="Search exercises"
            type="search"
            name="exercise-search"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="search"
            data-1p-ignore=""
            data-lpignore="true"
            className="w-full bg-surface-2 border border-border rounded-xl pl-10 pr-3 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-hidden focus:border-primary min-h-11"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {chips.map((chip) => {
            const selected = filter === chip.id
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => setFilter(chip.id)}
                className={cn(
                  'shrink-0 rounded-full border px-3 min-h-9 text-xs font-semibold whitespace-nowrap',
                  selected
                    ? 'bg-primary text-black border-primary'
                    : 'border-border text-text-secondary',
                )}
              >
                {chip.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="p-4 space-y-2">
        {creating ? (
          <CreateExerciseForm
            userId={userId}
            initialName={typedName}
            defaultMuscle={defaultMuscle(filter, workoutType)}
            onCreated={(ex) => {
              void queryClient.invalidateQueries({ queryKey: ['exercises', 'catalog', userId] })
              setCreating(false)
              onPick(ex)
            }}
            onCancel={() => setCreating(false)}
          />
        ) : (
          <>
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
              </>
            )}

            {rows.map((ex) => (
              <ExerciseRowButton key={ex.id} ex={ex} added={added.has(ex.id)} onPick={onPick} />
            ))}

            {showAllMatches && (
              <button
                type="button"
                onClick={() => setFilter('all')}
                className="w-full rounded-xl border border-border px-4 py-3 text-sm font-semibold text-primary min-h-11"
              >
                Show {allMatches.length} matches in all exercises
              </button>
            )}

            {typedName && noMatchesAnywhere && (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="w-full rounded-xl border border-dashed border-primary px-4 py-8 text-sm font-semibold text-primary"
              >
                Can&apos;t find it? Create &quot;{typedName}&quot;
              </button>
            )}

            {typedName && !noMatchesAnywhere && (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="w-full rounded-xl border border-dashed border-border px-4 py-3 text-sm font-medium text-text-secondary hover:border-primary hover:text-primary"
              >
                Can&apos;t find it? Create &quot;{typedName}&quot;
              </button>
            )}

            {!loading && !typedName && rows.length === 0 && recentRows.length === 0 && (
              <p className="text-sm text-text-muted text-center py-8">No exercises match.</p>
            )}
          </>
        )}
      </div>
    </BottomSheet>
  )
}
