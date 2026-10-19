import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '../components/ui/Button'
import {
  Loader2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  LogOut,
  Plus,
  ChevronUp,
  ChevronDown,
  Eye,
  EyeOff,
  Bell,
  Download,
  Upload,
} from 'lucide-react'
import { countLibraryExercises, getLibraryStats } from '../features/workout/services/exerciseService'
import { importExerciseLibrary, type ImportProgress } from '../features/exercises/services/exerciseImportService'
import { hasApiKey } from '../features/exercises/services/exercisesApiService'
import { logout } from '../features/auth/authService'
import { isAdminEmail } from '../features/auth/adminEmails'
import { useCurrentUser } from '../features/auth/useAuth'
import {
  getUserSettings,
  updateUserSettings,
} from '../features/settings/services/settingsService'
import type { UserSettings, UserSettingsUpdate, WeightUnits } from '../features/settings/types'
import { DEFAULT_WORKOUT_TYPES } from '../features/workout/constants'
import { isDefaultWorkoutType, resolveWorkoutTypes } from '../features/workout/lib/workoutTypes'
import { useWorkoutStore } from '../features/workout/store/useWorkoutStore'
import {
  getVapidPublicKey,
  pushSupported,
  sendTestPushNotification,
  subscribeUserPush,
  unsubscribeUserPush,
} from '../features/settings/lib/pushNotifications'
import { detectBrowserTimezone } from '../features/settings/lib/reminderTimezone'
import { cn } from '../lib/utils'
import {
  exportJson,
  exportCsv,
  exportExcel,
} from '../features/settings/lib/dataExport'
import { useWeightUnits } from '../features/settings/hooks/useWeightUnits'
import {
  applyImport,
  formatImportSummary,
  parseImportFile,
  type ImportPreview,
  type ImportSummary,
} from '../features/settings/lib/dataImport'

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
        {value && <p className="text-xs text-text-muted mt-0.5 wrap-break-word">{value}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'w-10 h-5 rounded-full relative transition-colors disabled:opacity-40',
        checked ? 'bg-primary' : 'bg-surface-3 border border-border',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all',
          checked ? 'left-5' : 'left-0.5',
        )}
      />
    </button>
  )
}

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
    setImportState({
      status: 'running',
      progress: { stage: 'running', currentLabel: '', completedSteps: 0, totalSteps: 112, importedSoFar: 0 },
    })
    try {
      const total = await importExerciseLibrary(userId, (progress) => {
        setImportState({ status: 'running', progress })
      })
      setImportState({ status: 'done', count: total })
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
      <div className="px-5 py-4">
        {!isRunning && importState.status !== 'done' && (
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <p className="text-sm text-text-secondary leading-relaxed">
                Imports all exercises from API Ninjas into your local database.
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
                {importState.progress.completedSteps} / {importState.progress.totalSteps}
              </span>
            </div>
            <div className="w-full h-1.5 bg-surface-3 rounded-full">
              <div
                className="h-1.5 bg-primary rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}
        {importState.status === 'done' && (
          <p className="text-sm text-green-400 flex items-center gap-2">
            <CheckCircle2 size={15} />
            Import complete — {importState.count.toLocaleString()} new exercises
          </p>
        )}
        {importState.status === 'error' && (
          <div className="flex items-start gap-2 text-sm text-red-400">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <p>{importState.message}</p>
          </div>
        )}
      </div>
    </Section>
  )
}

function timeToInput(t: string | null): string {
  if (!t) return '08:00'
  return t.slice(0, 5)
}

function WorkoutTypesEditor({
  types,
  onChange,
  disabled,
}: {
  types: string[]
  onChange: (next: string[]) => void
  disabled?: boolean
}) {
  const [draft, setDraft] = useState('')
  const visible = new Set(types.map((t) => t.toLowerCase()))
  const hiddenDefaults = DEFAULT_WORKOUT_TYPES.filter((d) => !visible.has(d.toLowerCase()))

  const move = (index: number, dir: -1 | 1) => {
    const next = [...types]
    const j = index + dir
    if (j < 0 || j >= next.length) return
    ;[next[index], next[j]] = [next[j]!, next[index]!]
    onChange(next)
  }

  const rename = (index: number, label: string) => {
    const trimmed = label.trim()
    if (!trimmed) return
    const next = [...types]
    next[index] = trimmed
    onChange(resolveWorkoutTypes(next))
  }

  const hide = (index: number) => {
    onChange(types.filter((_, i) => i !== index))
  }

  const showDefault = (label: string) => {
    onChange(resolveWorkoutTypes([...types, label]))
  }

  const addCustom = () => {
    const label = draft.trim()
    if (!label) return
    onChange(resolveWorkoutTypes([...types, label]))
    setDraft('')
  }

  return (
    <div className="px-4 md:px-5 py-4 space-y-3">
      <p className="text-xs text-text-muted">
        Add, rename, hide, or reorder types shown on Start Workout.
      </p>
      <ul className="space-y-2">
        {types.map((label, i) => (
          <li
            key={`${label}-${i}`}
            className="flex items-center gap-2 bg-surface-2 border border-border rounded-xl px-3 py-2"
          >
            <input
              className="flex-1 min-w-0 bg-transparent text-sm text-text-primary focus:outline-hidden"
              value={label}
              disabled={disabled}
              onChange={(e) => {
                const next = [...types]
                next[i] = e.target.value
                onChange(next)
              }}
              onBlur={(e) => rename(i, e.target.value)}
            />
            <button
              type="button"
              disabled={disabled || i === 0}
              onClick={() => move(i, -1)}
              className="p-1.5 text-text-muted hover:text-primary disabled:opacity-30"
              aria-label="Move up"
            >
              <ChevronUp size={16} />
            </button>
            <button
              type="button"
              disabled={disabled || i === types.length - 1}
              onClick={() => move(i, 1)}
              className="p-1.5 text-text-muted hover:text-primary disabled:opacity-30"
              aria-label="Move down"
            >
              <ChevronDown size={16} />
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => hide(i)}
              className="p-1.5 text-text-muted hover:text-red-400"
              aria-label={isDefaultWorkoutType(label) ? 'Hide type' : 'Remove type'}
            >
              <EyeOff size={16} />
            </button>
          </li>
        ))}
      </ul>

      {hiddenDefaults.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {hiddenDefaults.map((label) => (
            <button
              key={label}
              type="button"
              disabled={disabled}
              onClick={() => showDefault(label)}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-border text-text-secondary hover:border-primary hover:text-primary flex items-center gap-1"
            >
              <Eye size={12} />
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addCustom()
            }
          }}
          placeholder="Custom type"
          disabled={disabled}
          className="flex-1 bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm text-text-primary focus:outline-hidden focus:border-primary"
        />
        <Button variant="secondary" size="sm" disabled={disabled || !draft.trim()} onClick={addCustom}>
          <Plus size={14} className="mr-1" />
          Add
        </Button>
      </div>
    </div>
  )
}

function PreferencesSection({ userId }: { userId: string }) {
  const queryClient = useQueryClient()
  const setWorkoutTypes = useWorkoutStore((s) => s.setWorkoutTypes)
  const setPrefs = useWorkoutStore((s) => s.setPrefs)

  const { data: settings, isLoading, error } = useQuery({
    queryKey: ['user-settings', userId],
    queryFn: () => getUserSettings(userId),
  })

  const [local, setLocal] = useState<UserSettings | null>(null)
  const [pushBusy, setPushBusy] = useState(false)
  const [pushMsg, setPushMsg] = useState('')
  const [pushOk, setPushOk] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const vapidPresent = Boolean(getVapidPublicKey())

  useEffect(() => {
    if (settings) setLocal(settings)
  }, [settings])

  const saveMutation = useMutation({
    mutationFn: (patch: UserSettingsUpdate) => updateUserSettings(userId, patch),
    onSuccess: (next) => {
      setLocal(next)
      setWorkoutTypes(next.workoutTypes)
      setPrefs({
        weightStep: next.weightStep,
        restDefaultSeconds: next.restTimerSeconds,
        units: next.units,
      })
      void queryClient.setQueryData(['user-settings', userId], next)
      setSaveMsg('Saved')
      window.setTimeout(() => setSaveMsg(''), 1500)
    },
  })

  // Persist browser timezone whenever Settings opens with missing/UTC
  useEffect(() => {
    if (!settings) return
    const stored = (settings.timezone ?? '').trim()
    if (stored && stored !== 'UTC') return
    const browserTz = detectBrowserTimezone()
    if (!browserTz || browserTz === stored) return
    void updateUserSettings(userId, { timezone: browserTz })
      .then((next) => {
        setLocal(next)
        void queryClient.setQueryData(['user-settings', userId], next)
      })
      .catch((err) => {
        console.warn('[Settings] failed to save timezone', err)
      })
  }, [settings, userId, queryClient])

  const persist = (patch: UserSettingsUpdate) => {
    if (!local) return
    setLocal({ ...local, ...patch })
    saveMutation.mutate(patch)
  }

  /** Turning a reminder on also ensures Web Push is subscribed + saved. */
  const persistReminder = (patch: UserSettingsUpdate, enabling: boolean) => {
    persist(patch)
    if (!enabling) return
    setPushBusy(true)
    setPushOk(false)
    void subscribeUserPush(userId)
      .then(() => {
        setPushMsg('Reminder on — push subscription saved to push_subscriptions.')
        setPushOk(true)
      })
      .catch((err) => {
        setPushMsg(err instanceof Error ? err.message : String(err))
        setPushOk(false)
      })
      .finally(() => setPushBusy(false))
  }

  const handleEnablePush = async () => {
    setPushBusy(true)
    setPushMsg('')
    setPushOk(false)
    try {
      await subscribeUserPush(userId)
      setPushMsg('Push enabled — subscription saved to push_subscriptions.')
      setPushOk(true)
    } catch (err) {
      setPushMsg(err instanceof Error ? err.message : String(err))
      setPushOk(false)
    } finally {
      setPushBusy(false)
    }
  }

  const handleDisablePush = async () => {
    setPushBusy(true)
    setPushOk(false)
    try {
      await unsubscribeUserPush(userId)
      setPushMsg('Push subscription removed')
      setPushOk(true)
    } catch (err) {
      setPushMsg(err instanceof Error ? err.message : String(err))
      setPushOk(false)
    } finally {
      setPushBusy(false)
    }
  }

  const handleTestPush = async () => {
    setPushBusy(true)
    setPushOk(false)
    try {
      // Ensure DB row exists before asking the function to send.
      await subscribeUserPush(userId)
      const { sent } = await sendTestPushNotification(userId)
      setPushMsg(`Test notification sent (${sent}). Check this device.`)
      setPushOk(true)
    } catch (err) {
      setPushMsg(err instanceof Error ? err.message : String(err))
      setPushOk(false)
    } finally {
      setPushBusy(false)
    }
  }

  if (isLoading || !local) {
    return (
      <Section title="Preferences">
        <div className="px-5 py-8 flex items-center gap-2 text-sm text-text-secondary">
          <Loader2 size={14} className="animate-spin" />
          Loading settings…
        </div>
      </Section>
    )
  }

  if (error) {
    return (
      <Section title="Preferences">
        <p className="px-5 py-4 text-sm text-red-400">{(error as Error).message}</p>
      </Section>
    )
  }

  const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return (
    <>
      <Section title="Workout Types">
        <WorkoutTypesEditor
          types={local.workoutTypes}
          disabled={saveMutation.isPending}
          onChange={(workoutTypes) => persist({ workoutTypes })}
        />
      </Section>

      <Section title="Reminders">
        <Row
          label="Timezone"
          value="Local timezone · may arrive up to 5 minutes after the set time"
          action={
            <span className="text-xs font-medium text-text-primary tabular-nums">
              {local.timezone}
            </span>
          }
        />
        <Row
          label="Morning weight"
          value="Local time — sent when it matches in your timezone"
          action={
            <div className="flex items-center gap-3">
              <input
                type="time"
                value={timeToInput(local.reminderMorningWeightTime)}
                disabled={!local.reminderMorningWeightEnabled || saveMutation.isPending}
                onChange={(e) =>
                  persist({
                    reminderMorningWeightTime: e.target.value ? `${e.target.value}:00` : null,
                  })
                }
                className="bg-surface-2 border border-border rounded-lg px-2 py-1.5 text-sm text-text-primary disabled:opacity-40"
              />
              <Toggle
                checked={local.reminderMorningWeightEnabled}
                disabled={saveMutation.isPending || pushBusy}
                onChange={(v) =>
                  persistReminder(
                    {
                      reminderMorningWeightEnabled: v,
                      reminderMorningWeightTime:
                        local.reminderMorningWeightTime ?? '08:00:00',
                    },
                    v,
                  )
                }
              />
            </div>
          }
        />
        <Row
          label="Night recovery check-in"
          value="Remind you to log fatigue / soreness"
          action={
            <div className="flex items-center gap-3">
              <input
                type="time"
                value={timeToInput(local.reminderNightRecoveryTime)}
                disabled={!local.reminderNightRecoveryEnabled || saveMutation.isPending}
                onChange={(e) =>
                  persist({
                    reminderNightRecoveryTime: e.target.value ? `${e.target.value}:00` : null,
                  })
                }
                className="bg-surface-2 border border-border rounded-lg px-2 py-1.5 text-sm text-text-primary disabled:opacity-40"
              />
              <Toggle
                checked={local.reminderNightRecoveryEnabled}
                disabled={saveMutation.isPending || pushBusy}
                onChange={(v) =>
                  persistReminder(
                    {
                      reminderNightRecoveryEnabled: v,
                      reminderNightRecoveryTime:
                        local.reminderNightRecoveryTime ?? '21:00:00',
                    },
                    v,
                  )
                }
              />
            </div>
          }
        />
        <Row
          label="Workout reminder"
          value="Optional — chosen weekdays"
          action={
            <div className="flex items-center gap-3">
              <input
                type="time"
                value={timeToInput(local.reminderWorkoutTime)}
                disabled={!local.reminderWorkoutEnabled || saveMutation.isPending}
                onChange={(e) =>
                  persist({
                    reminderWorkoutTime: e.target.value ? `${e.target.value}:00` : null,
                  })
                }
                className="bg-surface-2 border border-border rounded-lg px-2 py-1.5 text-sm text-text-primary disabled:opacity-40"
              />
              <Toggle
                checked={local.reminderWorkoutEnabled}
                disabled={saveMutation.isPending || pushBusy}
                onChange={(v) =>
                  persistReminder(
                    {
                      reminderWorkoutEnabled: v,
                      reminderWorkoutTime: local.reminderWorkoutTime ?? '17:00:00',
                    },
                    v,
                  )
                }
              />
            </div>
          }
        />
        {local.reminderWorkoutEnabled && (
          <div className="px-4 md:px-5 py-3 flex flex-wrap gap-2 border-t border-border">
            {DAY_LABELS.map((label, day) => {
              const on = local.reminderWorkoutDays.includes(day)
              return (
                <button
                  key={label}
                  type="button"
                  disabled={saveMutation.isPending}
                  onClick={() => {
                    const days = on
                      ? local.reminderWorkoutDays.filter((d) => d !== day)
                      : [...local.reminderWorkoutDays, day].sort((a, b) => a - b)
                    persist({ reminderWorkoutDays: days })
                  }}
                  className={cn(
                    'px-2.5 py-1.5 rounded-lg text-xs font-semibold border',
                    on
                      ? 'border-primary bg-primary/15 text-primary'
                      : 'border-border text-text-muted',
                  )}
                >
                  {label}
                </button>
              )
            })}
          </div>
        )}
        <div className="px-4 md:px-5 py-4 border-t border-border space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-primary flex items-center gap-2">
                <Bell size={14} className="text-primary" />
                Web Push
              </p>
              <p className="text-xs text-text-muted mt-0.5">
                {pushSupported()
                  ? 'Enable saves this device to push_subscriptions so reminders can be delivered.'
                  : 'Not supported in this browser.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 justify-end">
              <Button
                variant="secondary"
                size="sm"
                disabled={!pushSupported() || pushBusy}
                onClick={() => void handleEnablePush()}
              >
                {pushBusy ? <Loader2 size={13} className="animate-spin" /> : 'Enable'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={!pushSupported() || pushBusy}
                onClick={() => void handleTestPush()}
              >
                Send test notification
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={!pushSupported() || pushBusy}
                onClick={() => void handleDisablePush()}
              >
                Disable
              </Button>
            </div>
          </div>
          {!vapidPresent && (
            <p className="text-xs text-red-400" role="alert">
              VITE_VAPID_PUBLIC_KEY is missing from this build. Set it on the host (e.g. Netlify
              env) and redeploy — Enable will fail until then.
            </p>
          )}
          {pushMsg && (
            <p
              className={cn('text-xs', pushOk ? 'text-text-secondary' : 'text-red-400')}
              role={pushOk ? 'status' : 'alert'}
            >
              {pushMsg}
            </p>
          )}
        </div>
      </Section>

      <Section title="Workout defaults">
        <Row
          label="Rest timer"
          value="Default countdown between sets"
          action={
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={15}
                max={600}
                step={15}
                value={local.restTimerSeconds}
                disabled={saveMutation.isPending}
                onChange={(e) => {
                  const n = Number.parseInt(e.target.value, 10)
                  if (!Number.isFinite(n)) return
                  setLocal({ ...local, restTimerSeconds: n })
                }}
                onBlur={() => persist({ restTimerSeconds: local.restTimerSeconds })}
                className="w-20 bg-surface-2 border border-border rounded-lg px-2 py-1.5 text-sm text-center text-text-primary"
              />
              <span className="text-xs text-text-muted">sec</span>
            </div>
          }
        />
        <Row
          label="Weight step"
          value="Stepper increment for set entry"
          action={
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0.25}
                max={50}
                step={0.25}
                value={local.weightStep}
                disabled={saveMutation.isPending}
                onChange={(e) => {
                  const n = Number.parseFloat(e.target.value)
                  if (!Number.isFinite(n)) return
                  setLocal({ ...local, weightStep: n })
                }}
                onBlur={() => persist({ weightStep: local.weightStep })}
                className="w-20 bg-surface-2 border border-border rounded-lg px-2 py-1.5 text-sm text-center text-text-primary"
              />
              <span className="text-xs text-text-muted">{local.units}</span>
            </div>
          }
        />
        <Row
          label="Units"
          value="Display preference for body weight & sets"
          action={
            <div className="flex rounded-lg border border-border overflow-hidden">
              {(['kg', 'lb'] as WeightUnits[]).map((u) => (
                <button
                  key={u}
                  type="button"
                  disabled={saveMutation.isPending}
                  onClick={() => persist({ units: u })}
                  className={cn(
                    'px-3 py-1.5 text-xs font-semibold uppercase',
                    local.units === u
                      ? 'bg-primary text-black'
                      : 'bg-surface-2 text-text-muted hover:text-text-primary',
                  )}
                >
                  {u}
                </button>
              ))}
            </div>
          }
        />
        {(saveMutation.isPending || saveMsg) && (
          <p className="px-5 py-2 text-[10px] text-text-muted uppercase tracking-widest border-t border-border">
            {saveMutation.isPending ? 'Saving…' : saveMsg}
          </p>
        )}
      </Section>
    </>
  )
}

// ─── Data import / export section ────────────────────────────────────────────

function DataSection({ userId }: { userId: string }) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [exporting, setExporting] = useState<'json' | 'csv' | 'xlsx' | null>(null)
  const [importState, setImportState] = useState<
    | { status: 'idle' }
    | { status: 'preview'; preview: ImportPreview }
    | { status: 'applying' }
    | { status: 'done'; summary: ImportSummary }
    | { status: 'error'; message: string }
  >({ status: 'idle' })

  const queryClient = useQueryClient()
  const units = useWeightUnits()

  const handleExport = async (fmt: 'json' | 'csv' | 'xlsx') => {
    setExporting(fmt)
    try {
      const { getExerciseHistory, getDailyLogs } = await import('../features/history/services/historyService')
      const [histories, logs] = await Promise.all([getExerciseHistory(userId), getDailyLogs(userId)])
      if (fmt === 'json') exportJson(histories, logs, units)
      else if (fmt === 'csv') exportCsv(histories, logs, units)
      else await exportExcel(histories, logs, units)
    } catch (err) {
      alert(`Export failed: ${(err as Error).message}`)
    } finally {
      setExporting(null)
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setImportState({ status: 'idle' })
    try {
      const preview = await parseImportFile(file)
      if (preview.dailyLogs.length === 0 && preview.exerciseLogs.length === 0) {
        setImportState({
          status: 'error',
          message: preview.warnings[0] ?? 'No valid Daily Log or Exercises Log rows found.',
        })
        return
      }
      setImportState({ status: 'preview', preview })
    } catch (err) {
      setImportState({ status: 'error', message: (err as Error).message })
    }
  }

  const handleApplyImport = async () => {
    if (importState.status !== 'preview') return
    const preview = importState.preview
    setImportState({ status: 'applying' })
    try {
      const summary = await applyImport(userId, preview)
      await queryClient.invalidateQueries({ queryKey: ['history'] })
      await queryClient.invalidateQueries({ queryKey: ['exercises'] })
      if (summary.errors.length > 0 && summary.dailyLogsImported === 0 && summary.historySetsImported === 0) {
        setImportState({ status: 'error', message: formatImportSummary(summary) })
      } else {
        setImportState({ status: 'done', summary })
      }
    } catch (err) {
      setImportState({ status: 'error', message: (err as Error).message })
    }
  }

  return (
    <Section title="Data">
      {/* Export row */}
      <div className="flex items-start sm:items-center justify-between gap-3 px-4 md:px-5 py-3 md:py-4 border-b border-border">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-text-primary">Export data</p>
          <p className="text-xs text-text-muted mt-0.5">Download all your workout and daily log data</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {(['json', 'csv', 'xlsx'] as const).map((fmt) => (
            <Button
              key={fmt}
              variant="outlined"
              size="sm"
              disabled={exporting !== null}
              onClick={() => void handleExport(fmt)}
            >
              {exporting === fmt ? (
                <Loader2 size={12} className="animate-spin mr-1" />
              ) : (
                <Download size={12} className="mr-1" />
              )}
              {fmt.toUpperCase()}
            </Button>
          ))}
        </div>
      </div>

      {/* Import row */}
      <div className="px-4 md:px-5 py-3 md:py-4">
        <div className="flex items-start sm:items-center justify-between gap-3 mb-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-text-primary">Import Excel / CSV</p>
            <p className="text-xs text-text-muted mt-0.5">
              Daily Log sheet → daily metrics. Exercises Log sheet → exercises + best sets as history.
              Re-import is safe (duplicates skipped).
            </p>
          </div>
          <div className="shrink-0">
            <Button
              variant="outlined"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={importState.status === 'applying'}
            >
              <Upload size={12} className="mr-1" />
              Choose file
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => void handleFileChange(e)}
            />
          </div>
        </div>

        {importState.status === 'preview' && (
          <div className="rounded-lg border border-border bg-surface-2 p-3 mt-2">
            {importState.preview.warnings.slice(0, 8).map((w, i) => (
              <p key={i} className="text-xs text-amber-400 mb-1">{w}</p>
            ))}
            <p className="text-xs text-text-muted mb-2">
              Preview: {importState.preview.dailyLogs.length} daily log
              {importState.preview.dailyLogs.length === 1 ? '' : 's'} ·{' '}
              {importState.preview.exerciseLogs.length} exercise best set
              {importState.preview.exerciseLogs.length === 1 ? '' : 's'}
            </p>
            <div className="max-h-44 overflow-y-auto rounded border border-border bg-background text-xs font-mono p-2 mb-3 space-y-1">
              {importState.preview.dailyLogs.slice(0, 6).map((r, i) => (
                <div key={`d-${i}`} className="text-text-muted">
                  [daily] {r.date} · wt={r.weight ?? '-'} kcal={r.calories ?? '-'} prot={r.protein ?? '-'}g
                </div>
              ))}
              {importState.preview.exerciseLogs.slice(0, 8).map((r, i) => (
                <div key={`e-${i}`} className="text-text-muted">
                  [exercise] {r.date} · {r.exerciseName} · {r.weight}×{r.reps}
                </div>
              ))}
              {(importState.preview.dailyLogs.length > 6 || importState.preview.exerciseLogs.length > 8) && (
                <div className="text-text-muted">… more rows in file</div>
              )}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="primary" onClick={() => void handleApplyImport()}>
                Apply import
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setImportState({ status: 'idle' })}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {importState.status === 'applying' && (
          <div className="flex items-center gap-2 text-xs text-text-muted mt-2">
            <Loader2 size={12} className="animate-spin text-primary" />
            Importing…
          </div>
        )}

        {importState.status === 'done' && (
          <p className="text-xs text-green-400 mt-2 flex items-start gap-1">
            <CheckCircle2 size={12} className="shrink-0 mt-0.5" />
            <span>{formatImportSummary(importState.summary)}</span>
          </p>
        )}

        {importState.status === 'error' && (
          <p className="text-xs text-red-400 mt-2 whitespace-pre-wrap flex gap-1">
            <AlertCircle size={12} className="shrink-0 mt-0.5" />
            {importState.message}
          </p>
        )}
      </div>
    </Section>
  )
}

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
      <div className="mb-6 md:mb-8">
        <p className="text-[10px] text-primary uppercase tracking-widest mb-1">Configuration</p>
        <h1 className="text-3xl md:text-5xl font-black uppercase text-text-primary">Settings</h1>
      </div>

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

      <PreferencesSection userId={userId} />

      <DataSection userId={userId} />

      {isAdminEmail(user?.email) && <LibrarySection userId={userId} />}

      <Section title="About">
        <Row
          label="Kinetic"
          value="Production fitness tracking app · Built with React + Supabase"
        />
        <Row
          label="Install"
          value="Add to Home Screen on Android for the full PWA experience"
        />
      </Section>
    </div>
  )
}
