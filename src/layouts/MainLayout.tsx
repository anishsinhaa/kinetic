import { NavLink, Outlet, Link, useNavigate, useLocation } from 'react-router-dom'
import { Suspense } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import fullLogo from '../assets/full_logo.png'
import { cn } from '../lib/utils'
import {
  LayoutDashboard,
  Dumbbell,
  ListChecks,
  History,
  MessageSquare,
  Settings,
  LogOut,
  Bell,
  TrendingUp,
  Loader2,
} from 'lucide-react'
import { logout } from '../features/auth/authService'
import { useCurrentUser } from '../features/auth/useAuth'
import { searchExercisesFromDb } from '../features/workout/services/exerciseService'
import { getRecentExerciseIds } from '../features/workout/services/workoutService'

const navItems = [
  { label: 'Dashboard', icon: LayoutDashboard, to: '/' },
  { label: 'Workouts', icon: Dumbbell, to: '/workout' },
  { label: 'Exercises', icon: ListChecks, to: '/exercises' },
  { label: 'History', icon: History, to: '/history' },
  { label: 'Progress', icon: TrendingUp, to: '/progress' },
  { label: 'Feedback', icon: MessageSquare, to: '/feedback' },
]

function PageFallback() {
  return (
    <div className="flex items-center justify-center py-24 gap-3 text-text-secondary">
      <Loader2 size={20} className="animate-spin text-primary" />
      <span className="text-sm uppercase tracking-widest">Loading…</span>
    </div>
  )
}

export function MainLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useCurrentUser()
  const reduceMotion = useReducedMotion()

  // Prefetch exercise library + recents so Add Exercise opens instantly
  useQuery({
    queryKey: ['exercises', 'library', '', null],
    queryFn: () => searchExercisesFromDb({ limit: 80 }),
    staleTime: 5 * 60 * 1000,
  })
  useQuery({
    queryKey: ['exercises', 'recent-ids', user?.id],
    queryFn: () => getRecentExerciseIds(user!.id),
    enabled: Boolean(user?.id),
    staleTime: 5 * 60 * 1000,
  })

  const handleLogout = async () => {
    await logout()
    navigate('/', { replace: true })
  }

  const userInitial = (user?.email?.[0] ?? 'U').toUpperCase()

  const mobileNavItems = [
    ...navItems,
    { label: 'Settings', icon: Settings, to: '/settings' },
  ]

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* ── Desktop sidebar (hidden on mobile) ── */}
      <aside className="hidden md:flex w-52 shrink-0 flex-col bg-surface border-r border-border">
        {/* Logo */}
        <div className="px-5 pt-5 pb-6">
          <img
            src={fullLogo}
            alt="Kinetic — Track. Recover. Progress."
            className="w-full"
          />
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 space-y-0.5">
          {navItems.map(({ label, icon: Icon, to }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-surface-3 text-primary border-l-2 border-primary pl-2.5'
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface-2',
                )
              }
            >
              <Icon size={16} strokeWidth={1.8} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Bottom actions */}
        <div className="px-3 pb-6 space-y-0.5">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors w-full ${
                isActive
                  ? 'bg-surface-3 text-primary border-l-2 border-primary pl-2.5'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
              }`
            }
          >
            <Settings size={16} strokeWidth={1.8} />
            Settings
          </NavLink>
          <button
            onClick={() => void handleLogout()}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-text-secondary hover:text-red-400 hover:bg-surface-2 transition-colors w-full min-h-11"
          >
            <LogOut size={16} strokeWidth={1.8} />
            Logout
          </button>
        </div>
      </aside>

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Desktop topbar (hidden on mobile) */}
        <header className="hidden md:flex h-14 items-center justify-between px-6 border-b border-border bg-surface shrink-0">
          <div className="flex items-center gap-6">
            <nav className="flex items-center gap-5 text-sm">
              {navItems.map(({ label, to }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  className={({ isActive }) =>
                    cn(
                      'font-medium transition-colors pb-0.5',
                      isActive
                        ? 'text-primary border-b border-primary'
                        : 'text-text-secondary hover:text-text-primary',
                    )
                  }
                >
                  {label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <button className="w-8 h-8 flex items-center justify-center rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors">
              <Bell size={16} />
            </button>
            <Link
              to="/settings"
              title={user?.email ?? 'Settings'}
              className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-xs font-bold text-black select-none hover:opacity-80 transition-opacity"
            >
              {userInitial}
            </Link>
          </div>
        </header>

        {/* Mobile topbar (hidden on desktop) */}
        <header className="md:hidden h-12 flex items-center justify-between px-4 border-b border-border bg-surface shrink-0">
          <img src={fullLogo} alt="Kinetic" className="h-7 w-auto" />
          <Link
            to="/settings"
            className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-xs font-bold text-black select-none"
          >
            {userInitial}
          </Link>
        </header>

        {/* Page content — route transitions */}
        <main className="flex-1 overflow-y-auto pb-[calc(4rem+env(safe-area-inset-bottom,0px))] md:pb-0">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              // min-height (not height): a fixed 100% height lets content overflow past
              // main's bottom padding, hiding page ends behind the bottom nav
              style={{ minHeight: '100%' }}
            >
              <Suspense fallback={<PageFallback />}>
                <Outlet />
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* ── Mobile bottom tab bar (hidden on desktop) ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-surface border-t border-border flex items-stretch h-16">
        {mobileNavItems.map(({ label, icon: Icon, to }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors min-w-0',
                isActive ? 'text-primary' : 'text-text-muted',
              )
            }
          >
            <Icon size={20} strokeWidth={1.8} />
            <span className="text-[9px] uppercase tracking-wider font-semibold truncate">{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
