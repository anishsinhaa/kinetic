import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { WorkoutExerciseDraft, WorkoutSetDraft } from '../types'
import { resolveWorkoutTypes } from '../lib/workoutTypes'

function newId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

interface WorkoutStore {
  currentWorkoutId: string | null
  workoutDate: string
  workoutStartedAt: string | null
  workoutLabel: string
  workoutTypes: string[]
  exercises: WorkoutExerciseDraft[]
  startWorkout: (workoutId: string, date: string, startedAt: string, label?: string) => void
  setWorkoutLabel: (label: string) => void
  setWorkoutTypes: (types: string[]) => void
  addWorkoutType: (label: string) => void
  addExercise: (exercise: {
    exerciseId: string
    name: string
    muscleGroup?: string
    dbWorkoutExerciseId?: string
    lastPerformance?: string
    personalRecord?: string
  }) => void
  addSet: (exerciseLocalId: string, set?: Partial<WorkoutSetDraft>) => WorkoutSetDraft | null
  updateSet: (
    exerciseLocalId: string,
    setLocalId: string,
    updates: Partial<WorkoutSetDraft>,
  ) => void
  finishWorkout: () => void
}

export const useWorkoutStore = create<WorkoutStore>()(
  persist(
    (set, get) => ({
      currentWorkoutId: null,
      workoutDate: new Date().toISOString().slice(0, 10),
      workoutStartedAt: null,
      workoutLabel: '',
      workoutTypes: resolveWorkoutTypes(null),
      exercises: [],

      startWorkout: (workoutId, date, startedAt, label = '') =>
        set({
          currentWorkoutId: workoutId,
          workoutDate: date,
          workoutStartedAt: startedAt,
          workoutLabel: label,
          exercises: [],
        }),

      setWorkoutLabel: (label) => set({ workoutLabel: label }),

      setWorkoutTypes: (types) =>
        set({
          workoutTypes: resolveWorkoutTypes(types),
        }),

      addWorkoutType: (label) =>
        set((state) => {
          const next = resolveWorkoutTypes([...state.workoutTypes, label])
          if (typeof window !== 'undefined') {
            window.localStorage.setItem('workout_types', JSON.stringify(next))
          }
          return { workoutTypes: next }
        }),

      addExercise: (exercise) =>
        set((state) => {
          const exists = state.exercises.some((e) => e.exerciseId === exercise.exerciseId)
          if (exists) return state
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
                sets: [],
              },
            ],
          }
        }),

      addSet: (exerciseLocalId, setData) => {
        const target = get().exercises.find((e) => e.id === exerciseLocalId)
        if (!target) return null

        const fallback = target.sets[target.sets.length - 1]
        // Prefill UI from previous set for speed, but id is the DB primary key for upsert.
        const id = setData?.id ?? newId()
        const nextSet: WorkoutSetDraft = {
          id,
          dbSetId: id,
          reps: setData?.reps ?? fallback?.reps ?? '',
          weight: setData?.weight ?? fallback?.weight ?? '',
          toFailure: setData?.toFailure ?? false,
        }

        set((state) => ({
          exercises: state.exercises.map((e) =>
            e.id === exerciseLocalId
              ? { ...e, sets: [...e.sets, nextSet] }
              : e,
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

      finishWorkout: () =>
        set({
          currentWorkoutId: null,
          workoutStartedAt: null,
          workoutLabel: '',
          exercises: [],
        }),
    }),
    {
      name: 'kinetic-active-workout',
      partialize: (state) => ({
        currentWorkoutId: state.currentWorkoutId,
        workoutDate: state.workoutDate,
        workoutStartedAt: state.workoutStartedAt,
        workoutLabel: state.workoutLabel,
        workoutTypes: state.workoutTypes,
        exercises: state.exercises,
      }),
      // Rehydrate must re-merge defaults so old localStorage lists like ["Upper","Pull"] expand.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<WorkoutStore>
        return {
          ...current,
          ...p,
          workoutTypes: resolveWorkoutTypes(p.workoutTypes ?? current.workoutTypes),
        }
      },
    },
  ),
)
