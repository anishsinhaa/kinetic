/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Workout from './Workout'
import { useWorkoutStore } from '../features/workout/store/useWorkoutStore'
import { createWorkout } from '../features/workout/services/workoutService'

vi.mock('../features/auth/useAuth', () => ({
  useCurrentUser: () => ({
    user: { id: 'user-1', email: 'test@example.com' },
    isAuthReady: true,
  }),
}))

vi.mock('../features/settings/services/settingsService', () => ({
  getUserSettings: vi.fn(async () => ({
    workoutTypes: ['Push', 'Pull', 'Legs'],
    weightStep: 2.5,
    restTimerSeconds: 90,
  })),
}))

vi.mock('../features/workout/services/workoutService', () => ({
  getLatestCompletedWorkout: vi.fn(async () => null),
  getRecentWorkoutTypes: vi.fn(async () => ['Push', 'Pull']),
  createWorkout: vi.fn(async (_userId: string, _date: string, _type?: string, id?: string) => ({
    id: id ?? 'workout-1',
    startedAt: new Date().toISOString(),
  })),
  addExerciseToWorkout: vi.fn(async () => 'we-1'),
  finishWorkout: vi.fn(async () => undefined),
  getLastPerformance: vi.fn(async () => []),
  getExercisePersonalRecord: vi.fn(async () => null),
  updateWorkoutLabel: vi.fn(async () => undefined),
  updateWorkoutMeta: vi.fn(async () => undefined),
  updateWorkoutExercise: vi.fn(async () => undefined),
  upsertSet: vi.fn(async () => undefined),
}))

function renderWorkout(initialEntry = '/workout') {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/workout" element={<Workout />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function assertNoUpdateDepthLoop(errorSpy: { mock: { calls: unknown[][] } }) {
  const joined = errorSpy.mock.calls.map((c) => c.map(String).join(' ')).join('\n')
  expect(joined).not.toMatch(/Maximum update depth exceeded/i)
  expect(joined).not.toMatch(/#185/)
}

describe('Workout page render', () => {
  beforeEach(() => {
    useWorkoutStore.setState({
      phase: 'idle',
      currentWorkoutId: null,
      workoutStartedAt: null,
      workoutLabel: '',
      workoutTypes: ['Push', 'Pull', 'Legs'],
      exercises: [],
      warmupStartedAt: null,
      warmupEndedAt: null,
      warmupNote: '',
      restEndsAt: null,
      restTotalSeconds: 90,
      weightStep: 2.5,
      restDefaultSeconds: 90,
      feel: null,
      note: '',
      summarySnapshot: null,
      suggestedType: null,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders bare /workout without a maximum update depth loop', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    renderWorkout('/workout')

    expect(screen.getByText('Ready')).toBeInTheDocument()
    await waitFor(() => {
      expect(useWorkoutStore.getState().phase).toBe('idle')
    })
    await new Promise((r) => setTimeout(r, 50))

    assertNoUpdateDepthLoop(errorSpy)
    errorSpy.mockRestore()
  })

  it('renders deep-link entries without looping', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const entries = ['/workout?start=1', '/workout?repeat=1', '/workout?type=Push']

    for (const entry of entries) {
      useWorkoutStore.setState({ phase: 'idle', currentWorkoutId: null, suggestedType: null })
      const { unmount } = renderWorkout(entry)

      await waitFor(() => {
        expect(screen.getByText('Pick a type')).toBeInTheDocument()
      })
      await new Promise((r) => setTimeout(r, 30))
      assertNoUpdateDepthLoop(errorSpy)
      unmount()
    }

    errorSpy.mockRestore()
  })

  it('starts a workout from type chip without looping', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(createWorkout).mockClear()

    renderWorkout('/workout?start=1')

    await waitFor(() => {
      expect(screen.getByText('Pick a type')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /^push$/i }))

    await waitFor(() => {
      expect(useWorkoutStore.getState().currentWorkoutId).toBeTruthy()
      expect(useWorkoutStore.getState().phase).toBe('warmup')
    })

    expect(await screen.findByRole('heading', { name: 'Warmup' })).toBeInTheDocument()
    await waitFor(() => {
      expect(createWorkout).toHaveBeenCalled()
    })
    await new Promise((r) => setTimeout(r, 50))

    assertNoUpdateDepthLoop(errorSpy)
    errorSpy.mockRestore()
  })
})
