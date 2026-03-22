import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '../components/ui/Button'
import {
  Search,
  Plus,
  Check,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Loader2,
  Dumbbell,
  Settings,
} from 'lucide-react'
import { cn } from '../lib/utils'
import {
  countLibraryExercises,
  createExercise,
  findOrCreateExerciseByName,
  getUserCustomExercises,
  searchExercisesFromDb,
} from '../features/workout/services/exerciseService'
import {
  addExerciseToWorkout,
  getExercisePersonalRecord,
  getLastPerformance,
} from '../features/workout/services/workoutService'
import { useWorkoutStore } from '../features/workout/store/useWorkoutStore'
import { useCurrentUser } from '../features/auth/useAuth'
import type { Exercise } from '../features/exercises/types'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * These labels match what the import service stores in muscle_group
 * (formatMuscle applied to API Ninjas' snake_case values).
 */
const MUSCLE_FILTERS = [
  { label: 'Chest', value: 'Chest' },
  { label: 'Lats', value: 'Lats' },
  { label: 'Mid Back', value: 'Middle Back' },
  { label: 'Lower Back', value: 'Lower Back' },
  { label: 'Biceps', value: 'Biceps' },
  { label: 'Triceps', value: 'Triceps' },
  { label: 'Forearms', value: 'Forearms' },
  { label: 'Traps', value: 'Traps' },
  { label: 'Quads', value: 'Quadriceps' },
  { label: 'Hamstrings', value: 'Hamstrings' },
  { label: 'Glutes', value: 'Glutes' },
  { label: 'Calves', value: 'Calves' },
  { label: 'Abs', value: 'Abdominals' },
  { label: 'Neck', value: 'Neck' },
  { label: 'Abductors', value: 'Abductors' },
  { label: 'Adductors', value: 'Adductors' },
] as const

/** Matches API Ninjas / imported library `exercise_type` values */
const EXERCISE_TYPE_OPTIONS = [
  { label: '— Not set —', value: '' },
  { label: 'Strength', value: 'strength' },
  { label: 'Cardio', value: 'cardio' },
  { label: 'Stretching', value: 'stretching' },
  { label: 'Plyometrics', value: 'plyometrics' },
  { label: 'Powerlifting', value: 'powerlifting' },
  { label: 'Olympic weightlifting', value: 'olympic_weightlifting' },
  { label: 'Strongman', value: 'strongman' },
] as const

const DIFFICULTY_OPTIONS = [
  { label: '— Not set —', value: '' },
  { label: 'Beginner', value: 'beginner' },
  { label: 'Intermediate', value: 'intermediate' },
  { label: 'Expert', value: 'expert' },
] as const

const DIFF_STYLE: Record<string, string> = {
  beginner: 'text-green-400 bg-green-900/20 border border-green-900',
  intermediate: 'text-yellow-400 bg-yellow-900/20 border border-yellow-900',
  expert: 'text-red-400 bg-red-900/20 border border-red-900',
}

function initials(name: string): string {
  return name.split(' ').slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join('') || 'EX'
}

// ─────────────────────────────────────────────────────────────────────────────
// Exercise card (library + custom share the same card)
// ─────────────────────────────────────────────────────────────────────────────

function ExerciseCard({
  exercise,
  isSelected,
  isPending,
  onSelect,
}: {
  exercise: Exercise
  isSelected: boolean
  isPending: boolean
  onSelect: () => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className={cn(
        'rounded-xl border transition-all',
        isSelected ? 'border-primary bg-primary/5' : 'border-border bg-surface',
      )}
    >
      <button
        className="w-full flex items-start gap-3 p-4 text-left"
        onClick={onSelect}
        disabled={isPending}
      >
        <div className="w-11 h-11 rounded-lg bg-surface-3 border border-border flex-shrink-0 flex items-center justify-center">
          {isPending ? (
            <Loader2 size={13} className="animate-spin text-primary" />
          ) : isSelected ? (
            <Check size={13} className="text-primary" strokeWidth={3} />
          ) : (
            <span className="text-[11px] font-bold text-text-secondary">{initials(exercise.name)}</span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
            <span className="text-[10px] uppercase tracking-widest text-text-muted">
              {exercise.muscleGroup}
            </span>
            {exercise.exerciseType && (
              <>
                <span className="text-text-muted/40">·</span>
                <span className="text-[10px] uppercase tracking-widest text-text-muted">
                  {exercise.exerciseType}
                </span>
              </>
            )}
            {exercise.isCustom && (
              <>
                <span className="text-text-muted/40">·</span>
                <span className="text-[10px] uppercase tracking-widest text-primary">Custom</span>
              </>
            )}
          </div>
          <p className="font-semibold text-text-primary text-sm leading-tight">{exercise.name}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {exercise.difficulty && (
              <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-semibold', DIFF_STYLE[exercise.difficulty] ?? 'text-text-muted')}>
                {exercise.difficulty}
              </span>
            )}
            {exercise.equipment && (
              <span className="text-[10px] text-text-muted">{exercise.equipment}</span>
            )}
          </div>
        </div>
      </button>

      {exercise.instructions && (
        <>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="w-full flex items-center gap-1.5 px-4 pb-2 text-[10px] text-text-muted hover:text-text-secondary transition-colors uppercase tracking-widest"
          >
            {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            {expanded ? 'Hide' : 'Instructions'}
          </button>
          {expanded && (
            <div className="px-4 pb-4 text-xs text-text-secondary leading-relaxed border-t border-border pt-3">
              {exercise.instructions}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty library prompt
// ─────────────────────────────────────────────────────────────────────────────

function EmptyLibraryPrompt() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center px-4">
      <Dumbbell size={36} className="text-text-muted mb-4 opacity-30" />
      <p className="text-text-primary font-semibold mb-1">Exercise library is empty</p>
      <p className="text-text-muted text-sm max-w-xs mb-5">
        Import 3,000+ exercises from API Ninjas once — browsing and searching will be instant
        afterward with zero API calls.
      </p>
      <Link to="/settings">
        <Button variant="primary" size="md">
          <Settings size={14} className="mr-2" />
          Go to Settings → Import Library
        </Button>
      </Link>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function Exercises() {
  const { user } = useCurrentUser()
  const userId = user!.id
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const isSelectMode = searchParams.get('select') === '1'

  const { currentWorkoutId, exercises: workoutExercises, addExercise } = useWorkoutStore()

  const [activeTab, setActiveTab] = useState<'library' | 'custom'>('library')

  // Library state
  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [activeMuscle, setActiveMuscle] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  // Custom state
  const [customSearch, setCustomSearch] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [customName, setCustomName] = useState('')
  const [customMuscle, setCustomMuscle] = useState('Chest')
  const [customEquipment, setCustomEquipment] = useState('')
  const [customDifficulty, setCustomDifficulty] = useState('')
  const [customExerciseType, setCustomExerciseType] = useState('')
  const [customInstructions, setCustomInstructions] = useState('')
  const customNameRef = useRef<HTMLInputElement>(null)

  const resetCustomForm = () => {
    setCustomName('')
    setCustomMuscle('Chest')
    setCustomEquipment('')
    setCustomDifficulty('')
    setCustomExerciseType('')
    setCustomInstructions('')
  }

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput), 350)
    return () => clearTimeout(t)
  }, [searchInput])

  // ── Library count (to detect empty library) ──────────────────────────────
  const libraryCountQuery = useQuery({
    queryKey: ['exercises', 'library-count'],
    queryFn: countLibraryExercises,
    staleTime: 30 * 1000,
  })
  const libraryIsEmpty = (libraryCountQuery.data ?? 0) < 5

  // ── Library search from Supabase ──────────────────────────────────────────
  const libraryQuery = useQuery({
    queryKey: ['exercises', 'library', debouncedSearch, activeMuscle],
    queryFn: () =>
      searchExercisesFromDb({
        name: debouncedSearch || undefined,
        muscleGroup: activeMuscle ?? undefined,
        limit: 40,
      }),
    enabled: !libraryIsEmpty,
    staleTime: 5 * 60 * 1000,
    placeholderData: (prev) => prev,
  })

  // ── Custom exercises ───────────────────────────────────────────────────────
  const customQuery = useQuery({
    queryKey: ['exercises', 'custom', userId],
    queryFn: () => getUserCustomExercises(userId),
    enabled: activeTab === 'custom',
  })

  const filteredCustom = useMemo(() => {
    const all = customQuery.data ?? []
    if (!customSearch.trim()) return all
    return all.filter((e) => e.name.toLowerCase().includes(customSearch.toLowerCase()))
  }, [customQuery.data, customSearch])

  // ── Create custom ──────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: () =>
      createExercise({
        name: customName,
        muscleGroup: customMuscle,
        userId,
        equipment: customEquipment || null,
        difficulty: customDifficulty || null,
        exerciseType: customExerciseType || null,
        instructions: customInstructions || null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['exercises', 'custom', userId] })
      resetCustomForm()
      setShowCreateForm(false)
    },
  })

  useEffect(() => {
    if (showCreateForm) setTimeout(() => customNameRef.current?.focus(), 50)
  }, [showCreateForm])

  // ── Add to workout ─────────────────────────────────────────────────────────
  const addToWorkout = async (exercise: Exercise) => {
    if (!currentWorkoutId) return
    const orderIndex = workoutExercises.length
    const dbWeId = await addExerciseToWorkout(currentWorkoutId, exercise.id, orderIndex)
    const lastSets = await getLastPerformance(userId, exercise.id)
    const lastPerformance =
      lastSets.length > 0
        ? `Last: ${lastSets.map((s) => `${s.weight ?? '-'}kg × ${s.reps ?? '-'}`).join(' • ')}`
        : 'No previous performance'
    const pr = await getExercisePersonalRecord(userId, exercise.id)
    const personalRecord = pr
      ? `PR: ${pr.weight ?? '-'}kg × ${pr.reps ?? '-'}${pr.date ? ` (${pr.date})` : ''}`
      : 'No PR yet'

    addExercise({
      exerciseId: exercise.id,
      name: exercise.name,
      muscleGroup: exercise.muscleGroup,
      dbWorkoutExerciseId: dbWeId,
      lastPerformance,
      personalRecord,
    })
  }

  const handleExerciseSelect = async (exercise: Exercise) => {
    if (!currentWorkoutId) {
      // Not in workout — just toggle selection
      setSelectedIds((prev) =>
        prev.includes(exercise.id) ? prev.filter((x) => x !== exercise.id) : [...prev, exercise.id],
      )
      return
    }

    if (isSelectMode) {
      setPendingId(exercise.id)
      try {
        // For API-imported exercises that might not have a Supabase record yet
        const ex = exercise.id
          ? exercise
          : await findOrCreateExerciseByName(exercise.name, exercise.muscleGroup, exercise.equipment, userId)
        await addToWorkout(ex)
        navigate('/workout')
      } finally {
        setPendingId(null)
      }
      return
    }

    setSelectedIds((prev) =>
      prev.includes(exercise.id) ? prev.filter((x) => x !== exercise.id) : [...prev, exercise.id],
    )
  }

  const addSelectedToWorkout = async () => {
    const pool = activeTab === 'library'
      ? (libraryQuery.data ?? []).filter((e) => selectedIds.includes(e.id))
      : filteredCustom.filter((e) => selectedIds.includes(e.id))

    for (const ex of pool) {
      await addToWorkout(ex)
    }
    setSelectedIds([])
    navigate('/workout')
  }

  const selectedCount = selectedIds.length
  const hasSelection = selectedCount > 0

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="px-8 pt-8 pb-5 border-b border-border">
        <p className="text-[10px] text-primary uppercase tracking-widest mb-1">
          {isSelectMode ? 'Select for workout' : 'Browse & manage'}
        </p>
        <h1 className="text-5xl font-black uppercase text-text-primary">Exercises</h1>
      </div>

      <div className="px-8 pt-5">
        {/* Tabs */}
        <div className="flex gap-1 bg-surface-2 rounded-xl p-1 w-fit mb-6">
          {(['library', 'custom'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); setSelectedIds([]) }}
              className={cn(
                'px-5 py-2 rounded-lg text-sm font-semibold uppercase tracking-wider transition-all',
                activeTab === tab
                  ? 'bg-primary text-black'
                  : 'text-text-secondary hover:text-text-primary',
              )}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* ── Library Tab ────────────────────────────────────────────────── */}
        {activeTab === 'library' && (
          <div>
            {/* Empty library → prompt to import */}
            {!libraryCountQuery.isLoading && libraryIsEmpty && <EmptyLibraryPrompt />}

            {!libraryIsEmpty && (
              <>
                {/* Search */}
                <div className="relative mb-4">
                  <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input
                    type="text"
                    placeholder="Search exercises…"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    className="w-full bg-surface border border-border rounded-xl pl-11 pr-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary transition-colors"
                  />
                  {searchInput && (
                    <button
                      onClick={() => setSearchInput('')}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Muscle filter chips */}
                <div className="flex gap-2 flex-wrap mb-5">
                  <button
                    onClick={() => setActiveMuscle(null)}
                    className={cn(
                      'px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider border transition-colors',
                      !activeMuscle
                        ? 'bg-primary text-black border-primary'
                        : 'border-border text-text-secondary hover:border-text-secondary hover:text-text-primary',
                    )}
                  >
                    All
                  </button>
                  {MUSCLE_FILTERS.map(({ label, value }) => (
                    <button
                      key={value}
                      onClick={() => setActiveMuscle(activeMuscle === value ? null : value)}
                      className={cn(
                        'px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider border transition-colors',
                        activeMuscle === value
                          ? 'bg-primary text-black border-primary'
                          : 'border-border text-text-secondary hover:border-text-secondary hover:text-text-primary',
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Results */}
                {libraryQuery.isLoading && (
                  <div className="grid grid-cols-2 gap-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="h-20 rounded-xl bg-surface-2 border border-border animate-pulse" />
                    ))}
                  </div>
                )}

                {libraryQuery.isError && (
                  <div className="flex items-center gap-2 rounded-xl border border-red-900 bg-red-900/15 px-4 py-3 text-sm text-red-400">
                    <AlertCircle size={14} />
                    {(libraryQuery.error as Error).message}
                  </div>
                )}

                {!libraryQuery.isLoading && !libraryQuery.isError && (
                  <>
                    {(libraryQuery.data?.length ?? 0) === 0 ? (
                      <div className="text-center py-12 text-text-muted text-sm">
                        No exercises found. Try a different search or muscle filter.
                      </div>
                    ) : (
                      <>
                        <p className="text-[10px] text-text-muted uppercase tracking-widest mb-3">
                          {libraryQuery.data!.length} results
                          {libraryQuery.data!.length === 40 && ' (showing first 40)'}
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                          {libraryQuery.data!.map((ex) => (
                            <ExerciseCard
                              key={ex.id}
                              exercise={ex}
                              isSelected={selectedIds.includes(ex.id)}
                              isPending={pendingId === ex.id}
                              onSelect={() => void handleExerciseSelect(ex)}
                            />
                          ))}
                        </div>
                      </>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Custom Tab ─────────────────────────────────────────────────── */}
        {activeTab === 'custom' && (
          <div>
            {/* Create form */}
            {showCreateForm ? (
              <div className="rounded-xl border border-border bg-surface p-5 mb-5">
                <p className="text-[10px] text-primary uppercase tracking-widest mb-4 font-semibold">
                  New Custom Exercise
                </p>
                <p className="text-xs text-text-muted mb-4">
                  Same fields as the imported library — fill what you know; leave the rest blank.
                </p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] text-text-secondary uppercase tracking-widest mb-1.5">Name</label>
                    <input
                      ref={customNameRef}
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          if (customName.trim()) createMutation.mutate()
                        }
                      }}
                      placeholder="e.g. Cable Pull-Through"
                      className="w-full bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] text-text-secondary uppercase tracking-widest mb-1.5">Muscle group</label>
                      <select
                        value={customMuscle}
                        onChange={(e) => setCustomMuscle(e.target.value)}
                        className="w-full bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-primary"
                      >
                        {MUSCLE_FILTERS.map(({ label, value }) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] text-text-secondary uppercase tracking-widest mb-1.5">Equipment</label>
                      <input
                        value={customEquipment}
                        onChange={(e) => setCustomEquipment(e.target.value)}
                        placeholder="e.g. Barbell, cable machine"
                        className="w-full bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] text-text-secondary uppercase tracking-widest mb-1.5">Difficulty</label>
                      <select
                        value={customDifficulty}
                        onChange={(e) => setCustomDifficulty(e.target.value)}
                        className="w-full bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-primary"
                      >
                        {DIFFICULTY_OPTIONS.map(({ label, value }) => (
                          <option key={label} value={value}>{label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] text-text-secondary uppercase tracking-widest mb-1.5">Exercise type</label>
                      <select
                        value={customExerciseType}
                        onChange={(e) => setCustomExerciseType(e.target.value)}
                        className="w-full bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-primary"
                      >
                        {EXERCISE_TYPE_OPTIONS.map(({ label, value }) => (
                          <option key={label} value={value}>{label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] text-text-secondary uppercase tracking-widest mb-1.5">Instructions</label>
                    <textarea
                      value={customInstructions}
                      onChange={(e) => setCustomInstructions(e.target.value)}
                      placeholder="How to perform the movement, cues, setup…"
                      rows={4}
                      className="w-full resize-y min-h-[88px] bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary"
                    />
                  </div>
                  {createMutation.isError && (
                    <p className="text-xs text-red-400 flex items-center gap-1">
                      <AlertCircle size={12} />
                      {(createMutation.error as Error).message}
                    </p>
                  )}
                  <div className="flex gap-2 pt-1">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => createMutation.mutate()}
                      disabled={!customName.trim() || createMutation.isPending}
                    >
                      {createMutation.isPending ? <Loader2 size={13} className="animate-spin mr-1.5" /> : <Plus size={13} className="mr-1.5" />}
                      Create Exercise
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowCreateForm(false)
                        resetCustomForm()
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowCreateForm(true)}
                className="w-full flex items-center gap-2 rounded-xl border border-dashed border-border bg-surface hover:border-primary hover:text-primary text-text-secondary transition-colors px-4 py-3 mb-5 text-sm font-medium"
              >
                <Plus size={15} />
                Create custom exercise
              </button>
            )}

            {/* Search custom */}
            <div className="relative mb-4">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                placeholder="Search your exercises…"
                value={customSearch}
                onChange={(e) => setCustomSearch(e.target.value)}
                className="w-full bg-surface border border-border rounded-xl pl-10 pr-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary"
              />
            </div>

            {customQuery.isLoading && (
              <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-primary" /></div>
            )}

            {!customQuery.isLoading && filteredCustom.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Dumbbell size={32} className="text-text-muted mb-3 opacity-40" />
                <p className="text-text-muted text-sm">
                  {customSearch ? 'No matches found.' : 'No custom exercises yet.'}
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              {filteredCustom.map((ex) => (
                <ExerciseCard
                  key={ex.id}
                  exercise={ex}
                  isSelected={selectedIds.includes(ex.id)}
                  isPending={pendingId === ex.id}
                  onSelect={() => void handleExerciseSelect(ex)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom bar — exercises selected */}
      {hasSelection && currentWorkoutId && (
        <div className="fixed bottom-0 left-52 right-0 bg-surface/95 backdrop-blur border-t border-border px-8 py-4 flex items-center gap-4">
          <div className="flex-1">
            <p className="text-sm font-bold text-text-primary uppercase tracking-wider">
              {selectedCount} exercise{selectedCount !== 1 ? 's' : ''} selected
            </p>
          </div>
          <button
            onClick={() => setSelectedIds([])}
            className="text-text-secondary hover:text-text-primary text-sm font-medium transition-colors px-3"
          >
            Clear
          </button>
          <Button variant="primary" size="md" onClick={() => void addSelectedToWorkout()}>
            Add to Workout →
          </Button>
        </div>
      )}

      {hasSelection && !currentWorkoutId && (
        <div className="fixed bottom-0 left-52 right-0 bg-surface/95 backdrop-blur border-t border-border px-8 py-4 flex items-center gap-4">
          <p className="text-sm text-text-secondary flex-1">Start a workout first to add exercises.</p>
          <Button variant="secondary" size="sm" onClick={() => navigate('/workout')}>Go to Workout</Button>
        </div>
      )}
    </div>
  )
}
