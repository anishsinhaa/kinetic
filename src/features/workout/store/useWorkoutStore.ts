import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { WorkoutExerciseDraft, WorkoutPhase, WorkoutSetDraft } from '../types'
import { resolveWorkoutTypes } from '../lib/workoutTypes'
import type { WorkoutExerciseTarget } from '../../../lib/supabase/database.types'

function newId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

interface WorkoutStore {
  phase: WorkoutPhase
  currentWorkoutId: string | null
  workoutDate: string
  workoutStartedAt: string | null
  workoutLabel: string
  workoutTypes: string[]
  suggestedType: string | null
  exercises: WorkoutExerciseDraft[]
  warmupStartedAt: string | null
  warmupEndedAt: string | null
  warmupNote: string
  restEndsAt: string | null
  restTotalSeconds: number
  restDefaultSeconds: number
  weightStep: number
  feel: number | null
  note: string
  summarySnapshot: {
    durationSec: number
    warmupSec: number
    volumeKg: number
    setCount: number
    prLabels: string[]
  } | null

  startWorkout: (workoutId: string, date: string, startedAt: string, label?: string) => void
  setPhase: (phase: WorkoutPhase) => void
  setWorkoutLabel: (label: string) => void
  setWorkoutTypes: (types: string[]) => void
  setSuggestedType: (type: string | null) => void
  addWorkoutType: (label: string) => void
  setWarmupNote: (note: string) => void
  startWarmup: () => void
  endWarmup: () => void
  skipWarmup: () => void
  setPrefs: (prefs: { weightStep?: number; restDefaultSeconds?: number }) => void
  startRest: (seconds?: number) => void
  adjustRest: (deltaSec: number) => void
  clearRest: () => void
  setFeel: (feel: number | null) => void
  setNote: (note: string) => void
  setSummarySnapshot: (snap: WorkoutStore['summarySnapshot']) => void
  addExercise: (exercise: {
    exerciseId: string
    name: string
    muscleGroup?: string
    dbWorkoutExerciseId?: string
    lastPerformance?: string
    personalRecord?: string
    targetLabel?: string
    target?: WorkoutExerciseTarget | null
    note?: string | null
    initialSets?: Array<{ weight: string; reps: string }>
  }) => void
  updateExerciseMeta: (
    exerciseLocalId: string,
    patch: Partial<
      Pick<
        WorkoutExerciseDraft,
        | 'dbWorkoutExerciseId'
        | 'lastPerformance'
        | 'personalRecord'
        | 'targetLabel'
        | 'target'
        | 'note'
        | 'sets'
      >
    >,
  ) => void
  addSet: (exerciseLocalId: string, set?: Partial<WorkoutSetDraft>) => WorkoutSetDraft | null
  updateSet: (
    exerciseLocalId: string,
    setLocalId: string,
    updates: Partial<WorkoutSetDraft>,
  ) => void
  completeSet: (exerciseLocalId: string, setLocalId: string) => void
  uncompleteSet: (exerciseLocalId: string, setLocalId: string) => void
  removeSet: (exerciseLocalId: string, setLocalId: string) => void
  finishWorkout: () => void
  resetToIdle: () => void
}

const initialSession = {
  phase: 'idle' as WorkoutPhase,
  currentWorkoutId: null as string | null,
  workoutDate: new Date().toISOString().slice(0, 10),
  workoutStartedAt: null as string | null,
  workoutLabel: '',
  exercises: [] as WorkoutExerciseDraft[],
  warmupStartedAt: null as string | null,
  warmupEndedAt: null as string | null,
  warmupNote: '',
  restEndsAt: null as string | null,
  restTotalSeconds: 90,
  feel: null as number | null,
  note: '',
  summarySnapshot: null as WorkoutStore['summarySnapshot'],
}

export const useWorkoutStore = create<WorkoutStore>()(
  persist(
    (set, get) => ({
      ...initialSession,
      workoutTypes: resolveWorkoutTypes(null),
      suggestedType: null,
      restDefaultSeconds: 90,
      weightStep: 2.5,

      startWorkout: (workoutId, date, startedAt, label = '') =>
        set({
          ...initialSession,
          phase: 'warmup',
          currentWorkoutId: workoutId,
          workoutDate: date,
          workoutStartedAt: startedAt,
          workoutLabel: label,
          restTotalSeconds: get().restDefaultSeconds,
          workoutTypes: get().workoutTypes,
          suggestedType: get().suggestedType,
          restDefaultSeconds: get().restDefaultSeconds,
          weightStep: get().weightStep,
        }),

      setPhase: (phase) =>
        set((state) => (state.phase === phase ? state : { phase })),
      setWorkoutLabel: (label) =>
        set((state) => (state.workoutLabel === label ? state : { workoutLabel: label })),
      setWorkoutTypes: (types) =>
        set((state) => {
          const next = resolveWorkoutTypes(types)
          if (
            next.length === state.workoutTypes.length &&
            next.every((t, i) => t === state.workoutTypes[i])
          ) {
            return state
          }
          return { workoutTypes: next }
        }),
      setSuggestedType: (type) =>
        set((state) => (state.suggestedType === type ? state : { suggestedType: type })),

      addWorkoutType: (label) =>
        set((state) => {
          const next = resolveWorkoutTypes([...state.workoutTypes, label])
          if (typeof window !== 'undefined') {
            window.localStorage.setItem('workout_types', JSON.stringify(next))
          }
          return { workoutTypes: next }
        }),

      setWarmupNote: (note) => set({ warmupNote: note }),
      startWarmup: () => set({ warmupStartedAt: new Date().toISOString(), warmupEndedAt: null }),
      endWarmup: () =>
        set({
          warmupEndedAt: new Date().toISOString(),
          phase: 'training',
        }),
      skipWarmup: () =>
        set({
          warmupStartedAt: null,
          warmupEndedAt: null,
          phase: 'training',
        }),

      setPrefs: (prefs) =>
        set((state) => ({
          weightStep: prefs.weightStep ?? state.weightStep,
          restDefaultSeconds: prefs.restDefaultSeconds ?? state.restDefaultSeconds,
        })),

      startRest: (seconds) => {
        const total = seconds ?? get().restDefaultSeconds
        set({
          restTotalSeconds: total,
          restEndsAt: new Date(Date.now() + total * 1000).toISOString(),
        })
      },
      adjustRest: (deltaSec) => {
        const ends = get().restEndsAt
        if (!ends) return
        const next = new Date(new Date(ends).getTime() + deltaSec * 1000)
        const remaining = Math.max(5, Math.round((next.getTime() - Date.now()) / 1000))
        set({
          restEndsAt: new Date(Date.now() + remaining * 1000).toISOString(),
          restTotalSeconds: Math.max(get().restTotalSeconds, remaining),
        })
      },
      clearRest: () => set({ restEndsAt: null }),

      setFeel: (feel) => set({ feel }),
      setNote: (note) => set({ note }),
      setSummarySnapshot: (summarySnapshot) => set({ summarySnapshot }),

      addExercise: (exercise) =>
        set((state) => {
          const exists = state.exercises.some((e) => e.exerciseId === exercise.exerciseId)
          if (exists) return state
          const initialSets = (exercise.initialSets ?? [{ weight: '', reps: '' }]).map((s) => {
            const id = newId()
            return {
              id,
              dbSetId: id,
              reps: s.reps,
              weight: s.weight,
              toFailure: false,
              completed: false,
              completedAt: null as string | null,
            }
          })

          return {
            exercises: [
              ...state.exercises,
              {
                id: newId(),
                exerciseId: exercise.exerciseId,
                dbWorkoutExerciseId: exercise.dbWorkoutExerciseId,
                name: exercise.name,
                muscleGroup: exercise.muscleGroup,
                lastPerformance: exercise.lastPerformance,
                personalRecord: exercise.personalRecord,
                targetLabel: exercise.targetLabel,
                target: exercise.target ?? null,
                note: exercise.note ?? null,
                sets: initialSets,
              },
            ],
          }
        }),

      updateExerciseMeta: (exerciseLocalId, patch) =>
        set((state) => ({
          exercises: state.exercises.map((e) =>
            e.id === exerciseLocalId ? { ...e, ...patch } : e,
          ),
        })),

      addSet: (exerciseLocalId, setData) => {
        const target = get().exercises.find((e) => e.id === exerciseLocalId)
        if (!target) return null

        const fallback = target.sets[target.sets.length - 1]
        const id = setData?.id ?? newId()
        const nextSet: WorkoutSetDraft = {
          id,
          dbSetId: id,
          reps: setData?.reps ?? fallback?.reps ?? '',
          weight: setData?.weight ?? fallback?.weight ?? '',
          toFailure: setData?.toFailure ?? false,
          completed: false,
          completedAt: null,
        }

        set((state) => ({
          exercises: state.exercises.map((e) =>
            e.id === exerciseLocalId ? { ...e, sets: [...e.sets, nextSet] } : e,
          ),
        }))

        return nextSet
      },

      updateSet: (exerciseLocalId, setLocalId, updates) =>
        set((state) => ({
          exercises: state.exercises.map((e) =>
            e.id !== exerciseLocalId
              ? e
              : {
                  ...e,
                  sets: e.sets.map((s) => (s.id === setLocalId ? { ...s, ...updates } : s)),
                },
          ),
        })),

      completeSet: (exerciseLocalId, setLocalId) => {
        const completedAt = new Date().toISOString()
        set((state) => ({
          exercises: state.exercises.map((e) =>
            e.id !== exerciseLocalId
              ? e
              : {
                  ...e,
                  sets: e.sets.map((s) =>
                    s.id === setLocalId
                      ? { ...s, completed: true, completedAt, toFailure: s.toFailure }
                      : s,
                  ),
                },
          ),
        }))
        get().startRest()
      },

      uncompleteSet: (exerciseLocalId, setLocalId) => {
        set((state) => ({
          exercises: state.exercises.map((e) =>
            e.id !== exerciseLocalId
              ? e
              : {
                  ...e,
                  sets: e.sets.map((s) =>
                    s.id === setLocalId
                      ? { ...s, completed: false, completedAt: null }
                      : s,
                  ),
                },
          ),
        }))
      },

      removeSet: (exerciseLocalId, setLocalId) => {
        set((state) => ({
          exercises: state.exercises.map((e) =>
            e.id !== exerciseLocalId
              ? e
              : { ...e, sets: e.sets.filter((s) => s.id !== setLocalId) },
          ),
        }))
      },

      finishWorkout: () =>
        set({
          ...initialSession,
          phase: 'idle',
          workoutTypes: get().workoutTypes,
          suggestedType: get().suggestedType,
          restDefaultSeconds: get().restDefaultSeconds,
          weightStep: get().weightStep,
        }),

      resetToIdle: () =>
        set({
          ...initialSession,
          phase: 'idle',
          workoutTypes: get().workoutTypes,
          suggestedType: get().suggestedType,
          restDefaultSeconds: get().restDefaultSeconds,
          weightStep: get().weightStep,
        }),
    }),
    {
      name: 'kinetic-active-workout',
      partialize: (state) => ({
        phase: state.phase,
        currentWorkoutId: state.currentWorkoutId,
        workoutDate: state.workoutDate,
        workoutStartedAt: state.workoutStartedAt,
        workoutLabel: state.workoutLabel,
        workoutTypes: state.workoutTypes,
        suggestedType: state.suggestedType,
        exercises: state.exercises,
        warmupStartedAt: state.warmupStartedAt,
        warmupEndedAt: state.warmupEndedAt,
        warmupNote: state.warmupNote,
        restEndsAt: state.restEndsAt,
        restTotalSeconds: state.restTotalSeconds,
        restDefaultSeconds: state.restDefaultSeconds,
        weightStep: state.weightStep,
        feel: state.feel,
        note: state.note,
        summarySnapshot: state.summarySnapshot,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<WorkoutStore>
        const exercises = (p.exercises ?? current.exercises).map((ex) => ({
          ...ex,
          sets: (ex.sets ?? []).map((s) => {
            const draft = s as WorkoutSetDraft
            return {
              ...draft,
              dbSetId: draft.dbSetId ?? draft.id,
              completedAt: draft.completedAt ?? null,
              completed: Boolean(draft.completed ?? draft.completedAt),
            }
          }),
        }))
        return {
          ...current,
          ...p,
          exercises,
          phase: p.phase ?? (p.currentWorkoutId ? 'training' : 'idle'),
          workoutTypes: resolveWorkoutTypes(p.workoutTypes ?? current.workoutTypes),
        }
      },
    },
  ),
)
