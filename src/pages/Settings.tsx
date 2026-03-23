import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '../components/ui/Button'
import {
  Loader2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  LogOut,
} from 'lucide-react'
import { countLibraryExercises, getLibraryStats } from '../features/workout/services/exerciseService'
import { importExerciseLibrary, type ImportProgress } from '../features/exercises/services/exerciseImportService'
import { hasApiKey } from '../features/exercises/services/exercisesApiService'
import { logout } from '../features/auth/authService'
import { useCurrentUser } from '../features/auth/useAuth'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h2 className="text-[10px] text-text-secondary uppercase tracking-widest font-semibold mb-3 flex items-center gap-2">
        <span className="w-1 h-3.5 bg-primary rounded-full inline-block" />
        {title}
      </h2>
      <div className="bg-surface rounded-xl border border-border overflow-hidden">{children}</div>
    </div>
  )
}

function Row({
  label,
  value,
  action,
}: {
  label: string
  value?: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-start sm:items-center justify-between gap-3 px-4 md:px-5 py-3 md:py-4 border-b border-border last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text-primary">{label}</p>
        {value && <p className="text-xs text-text-muted mt-0.5 break-words">{value}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Library Import Section
// ─────────────────────────────────────────────────────────────────────────────

type ImportState =
  | { status: 'idle' }
  | { status: 'running'; progress: ImportProgress }
  | { status: 'done'; count: number }
  | { status: 'error'; message: string }

function LibrarySection({ userId }: { userId: string }) {
  const queryClient = useQueryClient()
  const apiKeyConfigured = hasApiKey()

  const [importState, setImportState] = useState<ImportState>({ status: 'idle' })

  const { data: libraryCount, refetch: refetchCount } = useQuery({
    queryKey: ['exercises', 'library-count'],
    queryFn: countLibraryExercises,
    staleTime: 30 * 1000,
  })

  const stats = getLibraryStats()
  const isRunning = importState.status === 'running'

  const handleImport = async () => {
    if (!apiKeyConfigured) return
    setImportState({ status: 'running', progress: { stage: 'running', currentLabel: '', completedSteps: 0, totalSteps: 112, importedSoFar: 0 } })
    try {
      const total = await importExerciseLibrary(userId, (progress) => {
        setImportState({ status: 'running', progress })
      })
      setImportState({ status: 'done', count: total })
      // Invalidate queries so Exercises page refreshes
      await refetchCount()
      await queryClient.invalidateQueries({ queryKey: ['exercises', 'library'] })
    } catch (err) {
      setImportState({ status: 'error', message: (err as Error).message })
    }
  }

  const progressPercent =
    importState.status === 'running'
      ? Math.round((importState.progress.completedSteps / importState.progress.totalSteps) * 100)
      : 0

  return (
    <Section title="Exercise Library">
      <Row
        label="Library size"
        value={
          libraryCount != null
            ? `${libraryCount.toLocaleString()} standard exercises in database`
            : 'Loading…'
        }
        action={
          stats.lastImported ? (
            <span className="text-[10px] text-text-muted uppercase tracking-widest">
              Last refreshed {fmtDate(stats.lastImported)}
            </span>
          ) : undefined
        }
      />

      <Row
        label="API Ninjas key"
        value={
          apiKeyConfigured
            ? 'Key is configured — VITE_EXERCISES_API_KEY is set'
            : 'Key not configured — add VITE_EXERCISES_API_KEY to .env and restart'
        }
        action={
          apiKeyConfigured ? (
            <span className="flex items-center gap-1 text-xs text-green-400 font-semibold">
              <CheckCircle2 size={13} />
              Configured
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-yellow-400 font-semibold">
              <KeyRound size={13} />
              Missing
            </span>
          )
        }
      />

      {/* Import button + progress */}
      <div className="px-5 py-4">
        {!isRunning && importState.status !== 'done' && (
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <p className="text-sm text-text-secondary leading-relaxed">
                Imports all exercises from API Ninjas into your local database (~400–700 API calls,
                one time). After import, browsing and searching use <strong className="text-text-primary">zero API calls</strong>.
              </p>
            </div>
            <Button
              variant={libraryCount === 0 ? 'primary' : 'secondary'}
              size="sm"
              disabled={!apiKeyConfigured || isRunning}
              onClick={() => void handleImport()}
            >
              <RefreshCw size={13} className="mr-1.5" />
              {(libraryCount ?? 0) > 0 ? 'Refresh Library' : 'Import Library'}
            </Button>
          </div>
        )}

        {isRunning && importState.status === 'running' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-text-primary font-medium flex items-center gap-2">
                <Loader2 size={14} className="animate-spin text-primary" />
                Importing exercises…
              </p>
              <span className="text-xs text-text-muted">
                {importState.progress.completedSteps} / {importState.progress.totalSteps} combinations
              </span>
            </div>
            {/* Progress bar */}
            <div className="w-full h-1.5 bg-surface-3 rounded-full">
              <div
                className="h-1.5 bg-primary rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-text-muted">
              <span>
                {importState.progress.currentLabel
                  ? `Processing: ${importState.progress.currentLabel}`
                  : 'Preparing…'}
              </span>
              <span>
                {importState.progress.completedSteps}/{importState.progress.totalSteps} combos ·{' '}
                {importState.progress.importedSoFar.toLocaleString()} saved
              </span>
            </div>
            <p className="text-[10px] text-text-muted uppercase tracking-widest">
              Do not close this page until complete
            </p>
          </div>
        )}

        {importState.status === 'done' && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-green-400 flex items-center gap-2">
              <CheckCircle2 size={15} />
              {importState.count > 0
                ? `Import complete — ${importState.count.toLocaleString()} new exercises added`
                : 'Library is already up to date — no new exercises found'}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setImportState({ status: 'idle' })}
            >
              Dismiss
            </Button>
          </div>
        )}

        {importState.status === 'error' && (
          <div className="flex items-start gap-2 text-sm text-red-400">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Import failed</p>
              <p className="text-xs mt-0.5 text-red-500">{importState.message}</p>
              <button
                onClick={() => setImportState({ status: 'idle' })}
                className="text-xs text-text-muted hover:text-text-secondary mt-2 underline"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
      </div>
    </Section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings page
// ─────────────────────────────────────────────────────────────────────────────

export default function Settings() {
  const { user } = useCurrentUser()
  const userId = user!.id
  const navigate = useNavigate()
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const handleLogout = async () => {
    setIsLoggingOut(true)
    await logout()
    navigate('/', { replace: true })
  }

  return (
    <div className="p-4 md:p-8">
      {/* Header */}
      <div className="mb-6 md:mb-8">
        <p className="text-[10px] text-primary uppercase tracking-widest mb-1">Configuration</p>
        <h1 className="text-3xl md:text-5xl font-black uppercase text-text-primary">Settings</h1>
      </div>

      {/* Account */}
      <Section title="Account">
        <Row
          label="Email"
          value={user?.email ?? '—'}
          action={
            <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-xs font-bold text-black select-none">
              {(user?.email?.[0] ?? 'U').toUpperCase()}
            </div>
          }
        />
        <Row
          label="Session"
          value="Authenticated via Supabase Auth"
          action={
            <Button
              variant="ghost"
              size="sm"
              disabled={isLoggingOut}
              onClick={() => void handleLogout()}
              className="text-red-400 hover:text-red-300 hover:bg-red-900/20 border-red-900/40"
            >
              {isLoggingOut ? (
                <Loader2 size={13} className="animate-spin mr-1.5" />
              ) : (
                <LogOut size={13} className="mr-1.5" />
              )}
              Logout
            </Button>
          }
        />
      </Section>

      {/* Exercise Library + import — admin only */}
      {user?.email === 'anishsinha4911@gmail.com' && <LibrarySection userId={userId} />}

      {/* About */}
      <Section title="About">
        <Row
          label="Kinetic"
          value="Production fitness tracking app · Built with React + Supabase"
        />
        <Row
          label="Exercise data"
          value="Powered by API Ninjas (api-ninjas.com)"
          action={
            <a
              href="https://api-ninjas.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline"
            >
              api-ninjas.com ↗
            </a>
          }
        />
      </Section>
    </div>
  )
}
