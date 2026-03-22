import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { WorkoutExerciseDraft, WorkoutSetDraft } from '../types'

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

interface WorkoutStore {
  currentWorkoutId: string | null
  workoutDate: string
  workoutStartedAt: string | null
  workoutLabel: string
  workoutTypes: string[]
  exercises: WorkoutExerciseDraft[]
  startWorkout: (workoutId: string, date: string, startedAt: string) => void
  setWorkoutLabel: (label: string) => void
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
      workoutTypes:
        typeof window !== 'undefined'
          ? JSON.parse(window.localStorage.getItem('workout_types') ?? '[]')
          : [],
      exercises: [],

      startWorkout: (workoutId, date, startedAt) =>
        set({
          currentWorkoutId: workoutId,
          workoutDate: date,
          workoutStartedAt: startedAt,
          workoutLabel: '',
          exercises: [],
        }),

      setWorkoutLabel: (label) => set({ workoutLabel: label }),

      addWorkoutType: (label) =>
        set((state) => {
          const normalized = label.trim()
          if (!normalized) return state
          if (state.workoutTypes.some((t) => t.toLowerCase() === normalized.toLowerCase())) {
            return state
          }
          const next = [...state.workoutTypes, normalized]
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
                id: uid(),
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
        const nextSet: WorkoutSetDraft = {
          id: uid(),
          reps: setData?.reps ?? fallback?.reps ?? '',
          weight: setData?.weight ?? fallback?.weight ?? '',
          toFailure: setData?.toFailure ?? false,
          dbSetId: setData?.dbSetId,
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
      // Only persist session state (not derived data like workoutTypes which has its own key)
      partialize: (state) => ({
        currentWorkoutId: state.currentWorkoutId,
        workoutDate: state.workoutDate,
        workoutStartedAt: state.workoutStartedAt,
        workoutLabel: state.workoutLabel,
        workoutTypes: state.workoutTypes,
        exercises: state.exercises,
      }),
    },
  ),
)
