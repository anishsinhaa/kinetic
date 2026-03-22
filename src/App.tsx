import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { MainLayout } from './layouts/MainLayout'
import Dashboard from './pages/Dashboard'
import Workout from './pages/Workout'
import History from './pages/History'
import Exercises from './pages/Exercises'
import Feedback from './pages/Feedback'
import Settings from './pages/Settings'
import AuthPage from './features/auth/AuthPage'
import { useAuthListener, useCurrentUser } from './features/auth/useAuth'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
})

// ─────────────────────────────────────────────────────────────────────────────
// AppShell: sets up the auth listener + handles routing/guarding
// Must be rendered inside QueryClientProvider + BrowserRouter
// ─────────────────────────────────────────────────────────────────────────────
function AppShell() {
  // Set up the Supabase auth state listener once — syncs to Zustand store
  useAuthListener()

  const { user, isAuthReady } = useCurrentUser()

  // Wait for session check before rendering anything
  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center gap-3 text-text-secondary">
        <Loader2 size={20} className="animate-spin text-primary" />
        <span className="text-sm uppercase tracking-widest">Loading…</span>
      </div>
    )
  }

  // Not logged in → show auth page
  if (!user) {
    return <AuthPage />
  }

  // Logged in → show main app
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/workout" element={<Workout />} />
        <Route path="/history" element={<History />} />
        <Route path="/exercises" element={<Exercises />} />
        <Route path="/feedback" element={<Feedback />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
