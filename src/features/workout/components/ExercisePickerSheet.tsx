import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, Check, Loader2 } from 'lucide-react'
import { BottomSheet } from '../../../components/ui/BottomSheet'
import { cn } from '../../../lib/utils'
import {
  getUserCustomExercises,
  searchExercisesFromDb,
} from '../services/exerciseService'
import { getRecentExerciseIds } from '../services/workoutService'
import { musclesForWorkoutType } from '../lib/typeMuscleMap'
import type { Exercise } from '../../exercises/types'

type ExercisePickerSheetProps = {
  open: boolean
  onClose: () => void
  userId: string
  workoutType: string
  excludeExerciseIds: string[]
  onPick: (exercise: Exercise) => void
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
  const muscles = musclesForWorkoutType(workoutType)

  const recentQuery = useQuery({
    queryKey: ['exercises', 'recent-ids', userId],
    queryFn: () => getRecentExerciseIds(userId),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  })

  const libraryQuery = useQuery({
    queryKey: ['exercises', 'library', search, null],
    queryFn: () =>
      searchExercisesFromDb({
        name: search.trim() || undefined,
        limit: 80,
      }),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  })

  const customQuery = useQuery({
    queryKey: ['exercises', 'custom', userId],
    queryFn: () => getUserCustomExercises(userId),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  })

  const rows = useMemo(() => {
    const exclude = new Set(excludeExerciseIds)
    const recent = recentQuery.data ?? []
    const recentRank = new Map(recent.map((id, i) => [id, i]))
    const pool = [...(libraryQuery.data ?? []), ...(customQuery.data ?? [])]
    const seen = new Set<string>()
    const unique: Exercise[] = []
    for (const ex of pool) {
      if (seen.has(ex.id) || exclude.has(ex.id)) continue
      seen.add(ex.id)
      unique.push(ex)
    }

    const filtered = unique.filter((ex) => {
      if (search.trim()) return true
      if (!muscles) return true
      return muscles.some((m) => m.toLowerCase() === ex.muscleGroup.toLowerCase())
    })

    const q = search.trim().toLowerCase()
    return filtered.sort((a, b) => {
      const ar = recentRank.has(a.id) ? recentRank.get(a.id)! : Number.MAX_SAFE_INTEGER
      const br = recentRank.has(b.id) ? recentRank.get(b.id)! : Number.MAX_SAFE_INTEGER
      if (ar !== br) return ar - br
      if (q) {
        const as = a.name.toLowerCase().startsWith(q) ? 0 : 1
        const bs = b.name.toLowerCase().startsWith(q) ? 0 : 1
        if (as !== bs) return as - bs
      }
      return a.name.localeCompare(b.name)
    })
  }, [
    libraryQuery.data,
    customQuery.data,
    recentQuery.data,
    excludeExerciseIds,
    muscles,
    search,
  ])

  const loading = libraryQuery.isLoading || recentQuery.isLoading

  return (
    <BottomSheet open={open} onClose={onClose} title="Add exercise">
      <div className="p-4 space-y-3">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search exercises…"
            className="w-full bg-surface-2 border border-border rounded-xl pl-10 pr-3 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-hidden focus:border-primary min-h-11"
          />
        </div>
        {muscles && !search.trim() && (
          <p className="text-[10px] text-text-muted uppercase tracking-widest">
            Filtered for {workoutType} · recents first
          </p>
        )}
        {loading && (
          <div className="flex justify-center py-10">
            <Loader2 className="animate-spin text-primary" size={20} />
          </div>
        )}
        <div className="space-y-2 pb-6">
          {rows.map((ex) => (
            <button
              key={ex.id}
              type="button"
              onClick={() => onPick(ex)}
              className={cn(
                'w-full text-left px-4 py-3 rounded-xl border border-border bg-surface-2 hover:border-primary transition-colors min-h-11',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-text-primary">{ex.name}</p>
                  <p className="text-[10px] uppercase tracking-widest text-text-muted mt-0.5">
                    {ex.muscleGroup}
                    {ex.isCustom ? ' · Custom' : ''}
                  </p>
                </div>
                <Check size={14} className="text-primary opacity-40" />
              </div>
            </button>
          ))}
          {!loading && rows.length === 0 && (
            <p className="text-sm text-text-muted text-center py-8">No exercises match.</p>
          )}
        </div>
      </div>
    </BottomSheet>
  )
}
