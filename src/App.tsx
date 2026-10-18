import { Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { ErrorBoundary } from './components/ErrorBoundary'
import { MainLayout } from './layouts/MainLayout'
import { useAuthListener, useCurrentUser } from './features/auth/useAuth'
import { lazyWithReload } from './lib/lazyWithReload'

// Code-split all pages — only the auth page is eager (tiny and always needed)
import AuthPage from './features/auth/AuthPage'

const Dashboard  = lazyWithReload(() => import('./pages/Dashboard'))
const Workout    = lazyWithReload(() => import('./pages/Workout'))
const History    = lazyWithReload(() => import('./pages/History'))
const Exercises  = lazyWithReload(() => import('./pages/Exercises'))
const Progress   = lazyWithReload(() => import('./pages/Progress'))
const Feedback   = lazyWithReload(() => import('./pages/Feedback'))
const Settings   = lazyWithReload(() => import('./pages/Settings'))

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

  // Logged in → show main app with lazy routes
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center gap-3 text-text-secondary">
          <Loader2 size={20} className="animate-spin text-primary" />
          <span className="text-sm uppercase tracking-widest">Loading…</span>
        </div>
      }
    >
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/"          element={<Dashboard />} />
          <Route path="/workout"   element={<Workout />} />
          <Route path="/history"   element={<History />} />
          <Route path="/exercises" element={<Exercises />} />
          <Route path="/progress"  element={<Progress />} />
          <Route path="/feedback"  element={<Feedback />} />
          <Route path="/settings"  element={<Settings />} />
        </Route>
      </Routes>
    </Suspense>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AppShell />
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}
