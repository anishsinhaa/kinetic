import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Search } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { useToast } from '../components/ui/toastContext'
import { useCurrentUser } from '../features/auth/useAuth'
import { CreateExerciseForm } from '../features/exercises/components/CreateExerciseForm'
import { searchExercises } from '../features/exercises/lib/exerciseSearch'
import {
  CATEGORY_CHIPS,
  CATEGORY_LABELS,
  MUSCLE_OPTIONS,
  categoryForMuscle,
  exerciseCategory,
  type MuscleCategory,
} from '../features/exercises/lib/muscles'
import type { Exercise } from '../features/exercises/types'
import {
  deleteCustomExercise,
  getExerciseCatalog,
  updateCustomExercise,
} from '../features/workout/services/exerciseService'
import { cn } from '../lib/utils'

type Chip = 'all' | MuscleCategory

function isMine(ex: Exercise, userId: string): boolean {
  return ex.isCustom && ex.createdBy === userId
}

function EditExerciseForm({
  exercise,
  onSaved,
  onCancel,
}: {
  exercise: Exercise
  onSaved: () => void
  onCancel: () => void
}) {
  const known = MUSCLE_OPTIONS.some((option) => option.muscle === exercise.muscleGroup)
  const [name, setName] = useState(exercise.name)
  const [muscle, setMuscle] = useState(known ? exercise.muscleGroup : MUSCLE_OPTIONS[0].muscle)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    const trimmed = name.trim()
    if (!trimmed || saving) return
    setSaving(true)
    setError(null)
    try {
      await updateCustomExercise(exercise.id, {
        name: trimmed,
        muscleGroup: muscle,
        category: categoryForMuscle(muscle),
      })
      onSaved()
    } catch (err) {
      setError((err as Error).message)
      setSaving(false)
    }
  }

  return (
    <form
      className="rounded-xl border border-border bg-surface p-3 space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <label className="block">
        <span className="text-[10px] text-text-secondary uppercase tracking-widest">Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full bg-surface-2 border border-border rounded-xl px-3 py-3 text-sm text-text-primary focus:outline-hidden focus:border-primary min-h-11"
        />
      </label>
      <label className="block">
        <span className="text-[10px] text-text-secondary uppercase tracking-widest">Target muscle</span>
        <select
          value={muscle}
          onChange={(e) => setMuscle(e.target.value)}
          className="mt-1 w-full bg-surface-2 border border-border rounded-xl px-3 py-3 text-sm text-text-primary focus:outline-hidden focus:border-primary min-h-11"
        >
          {MUSCLE_OPTIONS.map((option) => (
            <option key={option.muscle} value={option.muscle}>
              {option.muscle}
            </option>
          ))}
        </select>
      </label>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving || !name.trim()}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

export default function Exercises() {
  const { user } = useCurrentUser()
  const userId = user!.id
  const queryClient = useQueryClient()
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [chip, setChip] = useState<Chip>('all')
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const catalogQuery = useQuery({
    queryKey: ['exercises', 'catalog', userId],
    queryFn: getExerciseCatalog,
    staleTime: 60 * 60 * 1000,
  })

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['exercises', 'catalog', userId] })
    void queryClient.invalidateQueries({ queryKey: ['exercises', 'recent-ids', userId] })
  }

  const filtered = useMemo(() => {
    const searched = searchExercises(catalogQuery.data ?? [], search)
    if (chip === 'all') return searched
    return searched.filter((ex) => exerciseCategory(ex) === chip)
  }, [catalogQuery.data, search, chip])

  const mine = filtered.filter((ex) => isMine(ex, userId))
  const rest = filtered.filter((ex) => !isMine(ex, userId))

  const remove = async (ex: Exercise) => {
    if (!window.confirm(`Delete ${ex.name}?`)) return
    try {
      const result = await deleteCustomExercise(ex.id)
      if (result === 'hidden') {
        toast.show("Hidden — it's in your workout history, so it was kept there.")
      }
      if (editingId === ex.id) setEditingId(null)
      refresh()
    } catch (err) {
      toast.show((err as Error).message, { kind: 'error' })
    }
  }

  const renderRow = (ex: Exercise) => {
    if (editingId === ex.id) {
      return (
        <EditExerciseForm
          key={ex.id}
          exercise={ex}
          onSaved={() => {
            setEditingId(null)
            refresh()
          }}
          onCancel={() => setEditingId(null)}
        />
      )
    }
    return (
      <div key={ex.id} className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2 min-h-12">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-text-primary truncate">{ex.name}</p>
          <p className="text-xs text-text-secondary truncate">
            {ex.muscleGroup}
            {ex.equipment ? ` · ${ex.equipment}` : ''}
          </p>
        </div>
        {isMine(ex, userId) && (
          <div className="flex gap-1 shrink-0">
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditingId(ex.id)}>
              Edit
            </Button>
            <Button type="button" variant="ghost" size="sm" className="text-red-400" onClick={() => void remove(ex)}>
              Delete
            </Button>
          </div>
        )}
      </div>
    )
  }

  const chips: Array<{ id: Chip; label: string }> = [
    { id: 'all', label: 'All' },
    ...CATEGORY_CHIPS.map((id) => ({ id, label: CATEGORY_LABELS[id] })),
  ]

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <Link to="/settings" className="text-sm text-primary min-h-11 inline-flex items-center">
        ← Settings
      </Link>
      <h1 className="text-3xl md:text-5xl font-black uppercase text-text-primary mb-6">Exercises</h1>

      <div className="relative mb-3">
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
          className="w-full bg-surface-2 border border-border rounded-xl pl-10 pr-3 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-hidden focus:border-primary min-h-11"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto mb-4">
        {chips.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setChip(item.id)}
            className={cn(
              'shrink-0 rounded-full border px-3 min-h-9 text-xs font-semibold whitespace-nowrap',
              chip === item.id ? 'bg-primary text-black border-primary' : 'border-border text-text-secondary',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <Button type="button" variant="outlined" className="mb-4" onClick={() => setCreating((open) => !open)}>
        + New exercise
      </Button>

      {creating && (
        <div className="mb-4 rounded-xl border border-border bg-surface p-3">
          <CreateExerciseForm
            userId={userId}
            initialName={search}
            onCreated={() => {
              setCreating(false)
              refresh()
            }}
            onCancel={() => setCreating(false)}
          />
        </div>
      )}

      {catalogQuery.isLoading && (
        <div className="flex justify-center py-10">
          <Loader2 className="animate-spin text-primary" size={20} />
        </div>
      )}
      {catalogQuery.isError && (
        <p className="text-sm text-red-400">{(catalogQuery.error as Error).message}</p>
      )}

      {!catalogQuery.isLoading && (
        <div className="space-y-2">
          {mine.length > 0 && (
            <>
              <p className="text-[11px] text-text-secondary uppercase tracking-widest pt-1">My exercises</p>
              {mine.map(renderRow)}
            </>
          )}
          <p className="text-[11px] text-text-secondary uppercase tracking-widest pt-2">All exercises</p>
          {rest.map(renderRow)}
          {filtered.length === 0 && (
            <p className="text-sm text-text-muted text-center py-8">No exercises match.</p>
          )}
        </div>
      )}
    </div>
  )
}
