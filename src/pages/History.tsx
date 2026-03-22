import { Fragment, useState } from 'react'
import { Card } from '../components/ui/Card'
import { Table, TableHead, TableBody, TableRow, TableTh, TableTd } from '../components/ui/Table'
import { Button } from '../components/ui/Button'
import {
  Calendar,
  ChevronRight,
  Search,
  Dumbbell,
  TrendingUp,
  AlertCircle,
  Loader2,
  Heart,
  Zap,
  Moon,
  Activity,
} from 'lucide-react'
import { useDailyLogs, useExerciseHistory } from '../features/history/hooks/useHistory'
import { useFeedbackHistory } from '../features/feedback/hooks/useFeedback'
import { recoveryScoreFromFeedback, recoveryLabel } from '../features/feedback/types'
import type { ExerciseHistory } from '../features/history/types'
import { cn } from '../lib/utils'

type Tab = 'daily' | 'exercise' | 'recovery'

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function fmtDate(iso: string): string {
  try {
    return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

function fmtDateLong(iso: string): string {
  try {
    return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

function fmtWeight(v: number | null): string {
  return v != null ? `${v} kg` : '—'
}

function fmtCalories(v: number | null): string {
  return v != null ? `${v.toLocaleString()} kcal` : '—'
}

function fmtProtein(v: number | null): string {
  return v != null ? `${v}g` : '—'
}

function fmtSleep(v: number | null): string {
  if (v == null) return '—'
  const h = Math.floor(v)
  const m = Math.round((v - h) * 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function fmtVolume(v: number): string {
  return v > 0 ? `${v.toLocaleString()} kg` : '—'
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <TableRow>
      {Array.from({ length: cols }).map((_, i) => (
        <TableTd key={i}>
          <div className="h-4 bg-surface-3 rounded animate-pulse w-3/4" />
        </TableTd>
      ))}
    </TableRow>
  )
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ icon: Icon, title, subtitle }: {
  icon: React.ElementType
  title: string
  subtitle: string
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
      <div className="w-12 h-12 rounded-2xl bg-surface-2 border border-border flex items-center justify-center">
        <Icon size={20} className="text-text-muted" />
      </div>
      <p className="text-text-primary font-semibold">{title}</p>
      <p className="text-text-secondary text-sm max-w-xs">{subtitle}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-3 p-4 rounded-xl bg-red-900/20 border border-red-800/50 text-red-400 text-sm">
      <AlertCircle size={16} className="shrink-0" />
      <span>{message}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Daily Logs Tab
// ---------------------------------------------------------------------------

function WorkoutCell({ workoutCount, workoutType, workoutDurationMins }: {
  workoutCount: number
  workoutType: string | null
  workoutDurationMins: number | null
}) {
  if (workoutCount === 0) {
    return (
      <span className="flex items-center gap-1.5 text-text-muted text-xs">
        <Moon size={11} className="text-text-muted/60" />
        Rest Day
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1.5 text-xs">
      <Dumbbell size={11} className="text-primary shrink-0" />
      <span className="text-text-primary font-medium">
        {workoutType ?? 'Workout'}
      </span>
      {workoutDurationMins != null && workoutDurationMins > 0 && (
        <span className="text-text-muted">· {workoutDurationMins}m</span>
      )}
    </span>
  )
}

function DailyLogsTab() {
  const { data: logs, isLoading, error } = useDailyLogs()

  return (
    <Card>
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <h2 className="font-semibold text-text-primary flex items-center gap-2">
          <Calendar size={15} className="text-primary" />
          Daily Activity Log
        </h2>
        {logs && logs.length > 0 && (
          <span className="text-xs text-text-muted">{logs.length} entries</span>
        )}
      </div>

      {error && (
        <div className="p-5">
          <ErrorState message={(error as Error).message ?? 'Failed to load daily logs.'} />
        </div>
      )}

      {!error && (
        <div className="overflow-x-auto">
        <Table>
          <TableHead>
            <TableRow>
              <TableTh>Date</TableTh>
              <TableTh>Workout</TableTh>
              <TableTh>Weight</TableTh>
              <TableTh>Protein</TableTh>
              <TableTh>Calories</TableTh>
              <TableTh>Sleep</TableTh>
              <TableTh>Notes</TableTh>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading && Array.from({ length: 5 }).map((_, i) => (
              <SkeletonRow key={i} cols={7} />
            ))}

            {!isLoading && logs?.length === 0 && (
              <TableRow>
                <TableTd colSpan={7} className="text-center py-16">
                  <div className="flex flex-col items-center gap-2 text-text-muted">
                    <Calendar size={28} className="opacity-30" />
                    <p className="text-sm">No daily logs yet. Start tracking from the Dashboard.</p>
                  </div>
                </TableTd>
              </TableRow>
            )}

            {!isLoading && logs?.map((row) => (
              <TableRow key={row.id}>
                <TableTd className="font-medium text-text-primary whitespace-nowrap">
                  {fmtDate(row.date)}
                </TableTd>
                <TableTd className="whitespace-nowrap">
                  <WorkoutCell
                    workoutCount={row.workoutCount}
                    workoutType={row.workoutType}
                    workoutDurationMins={row.workoutDurationMins}
                  />
                </TableTd>
                <TableTd>{fmtWeight(row.weight)}</TableTd>
                <TableTd>
                  <span className={row.protein != null ? 'text-primary font-semibold' : 'text-text-muted'}>
                    {fmtProtein(row.protein)}
                  </span>
                </TableTd>
                <TableTd>{fmtCalories(row.calories)}</TableTd>
                <TableTd>{fmtSleep(row.sleep)}</TableTd>
                <TableTd className="max-w-[200px]">
                  {row.notes ? (
                    <span title={row.notes} className="text-text-secondary text-xs truncate block">
                      {row.notes}
                    </span>
                  ) : (
                    <span className="text-text-muted text-xs">—</span>
                  )}
                </TableTd>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Exercise History Tab
// ---------------------------------------------------------------------------

function ExerciseSessionDetail({ exercise }: { exercise: ExerciseHistory }) {
  if (exercise.sessions.length === 0) {
    return (
      <EmptyState
        icon={Dumbbell}
        title="No sessions yet"
        subtitle="Complete a workout with this exercise to see history."
      />
    )
  }

  return (
    <div className="space-y-6">
      {exercise.sessions.map((session, i) => (
        <div key={session.date}>
          <div className="flex items-start gap-3 mb-3">
            <div
              className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
                i === 0 ? 'bg-primary' : 'bg-surface-3 border border-border'
              }`}
            />
            <div className="flex-1">
              <div className="flex items-baseline gap-3 mb-2">
                <p className="font-semibold text-text-primary">{fmtDateLong(session.date)}</p>
                {session.totalVolume > 0 && (
                  <span className="text-xs text-text-muted">
                    Volume: {fmtVolume(Math.round(session.totalVolume))}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {session.sets.map((set, j) => (
                  <div
                    key={j}
                    className="bg-surface-2 border border-border rounded-xl px-3 py-2 text-center min-w-[70px]"
                  >
                    <p className="text-[9px] text-text-muted uppercase tracking-widest mb-0.5">
                      Set {j + 1}
                    </p>
                    <p className="font-bold text-text-primary text-sm">
                      {set.weight != null ? `${set.weight}kg` : '—'}
                      {' '}
                      <span className="text-text-secondary font-normal">
                        × {set.reps ?? '—'}
                      </span>
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function ExerciseHistoryTab() {
  const { data: exercises, isLoading, error } = useExerciseHistory()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list')

  const filtered = (exercises ?? []).filter((e) =>
    e.exerciseName.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const selected = exercises?.find((e) => e.exerciseId === selectedId)
    ?? (exercises && exercises.length > 0 ? exercises[0] : null)

  const handleSelect = (id: string) => {
    setSelectedId(id)
    setMobileView('detail')
  }

  return (
    <div className="md:grid md:grid-cols-3 md:gap-5 space-y-4 md:space-y-0">
      {/* Left: Exercise list — hidden on mobile when detail is shown */}
      <div className={cn(mobileView === 'detail' ? 'hidden md:block' : 'block')}>
        <Card className="p-4 h-fit">
          <p className="text-[10px] text-text-secondary uppercase tracking-widest mb-3">
            Exercises ({filtered.length})
          </p>

          <div className="relative mb-3">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              placeholder="Search exercises..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-surface-2 border border-border rounded-xl pl-8 pr-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary transition-colors"
            />
          </div>

          {isLoading && (
            <div className="flex justify-center py-8">
              <Loader2 size={20} className="text-primary animate-spin" />
            </div>
          )}

          {error && (
            <ErrorState message="Failed to load exercises." />
          )}

          {!isLoading && !error && filtered.length === 0 && (
            <p className="text-text-muted text-sm text-center py-6">
              {searchQuery ? 'No matches found.' : 'No exercise history yet.'}
            </p>
          )}

          <div className="space-y-0.5">
            {filtered.map((ex) => {
              const isActive = (selected?.exerciseId ?? null) === ex.exerciseId
              return (
                <button
                  key={ex.exerciseId}
                  onClick={() => handleSelect(ex.exerciseId)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-colors text-left ${
                    isActive
                      ? 'bg-primary text-black font-semibold'
                      : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="truncate">{ex.exerciseName}</p>
                    <p className={`text-[10px] truncate ${isActive ? 'text-black/60' : 'text-text-muted'}`}>
                      {ex.muscleGroup} · {ex.sessions.length} session{ex.sessions.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <ChevronRight size={14} className="shrink-0 ml-1" />
                </button>
              )
            })}
          </div>
        </Card>
      </div>

      {/* Right: Exercise detail — hidden on mobile when list is shown */}
      <div className={cn('md:col-span-2', mobileView === 'list' ? 'hidden md:block' : 'block')}>
        {/* Mobile back button */}
        <button
          onClick={() => setMobileView('list')}
          className="md:hidden flex items-center gap-1.5 text-sm text-text-secondary hover:text-primary mb-3 transition-colors"
        >
          <ChevronRight size={14} className="rotate-180" />
          Back to list
        </button>

        {!selected && !isLoading && (
          <Card className="p-6">
            <EmptyState
              icon={TrendingUp}
              title="Select an exercise"
              subtitle="Choose an exercise from the list to view its full history."
            />
          </Card>
        )}

        {selected && (
          <Card className="p-4 md:p-6">
            <div className="flex items-start justify-between mb-5 md:mb-6">
              <div>
                <h2 className="text-lg md:text-xl font-bold text-text-primary">{selected.exerciseName}</h2>
                <p className="text-text-secondary text-sm mt-0.5">
                  {selected.muscleGroup} · {selected.sessions.length} session{selected.sessions.length !== 1 ? 's' : ''}
                </p>
              </div>
              {selected.allTimeBest != null && (
                <div className="text-right">
                  <p className="text-[9px] text-text-muted uppercase tracking-widest mb-0.5">All-time best</p>
                  <p className="text-primary font-bold text-lg">{selected.allTimeBest} kg</p>
                </div>
              )}
            </div>

            <ExerciseSessionDetail exercise={selected} />
          </Card>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Recovery History Tab
// ---------------------------------------------------------------------------

function ScoreBadge({ score }: { score: number }) {
  const label = recoveryLabel(score)
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold',
        score >= 80 && 'bg-primary/15 text-primary border border-primary/30',
        score >= 60 && score < 80 && 'bg-green-900/30 text-green-400 border border-green-800',
        score >= 40 && score < 60 && 'bg-yellow-900/30 text-yellow-400 border border-yellow-800',
        score < 40 && 'bg-red-900/30 text-red-400 border border-red-800',
      )}
    >
      {score}% · {label}
    </span>
  )
}

function SorenessDots({ level }: { level: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'w-2 h-2 rounded-full',
            i < level
              ? level === 1
                ? 'bg-yellow-500'
                : level === 2
                ? 'bg-orange-500'
                : 'bg-red-500'
              : 'bg-surface-3 border border-border',
          )}
        />
      ))}
    </div>
  )
}

function RecoveryTab() {
  const { data: history, isLoading, error } = useFeedbackHistory()
  const [expandedId, setExpandedId] = useState<string | null>(null)

  return (
    <Card>
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <h2 className="font-semibold text-text-primary flex items-center gap-2">
          <Heart size={15} className="text-primary" />
          Recovery Log
        </h2>
        {history && history.length > 0 && (
          <span className="text-xs text-text-muted">{history.length} entries</span>
        )}
      </div>

      {error && (
        <div className="p-5">
          <ErrorState message={(error as Error).message ?? 'Failed to load recovery history.'} />
        </div>
      )}

      {!error && (
        <div className="overflow-x-auto">
        <Table>
          <TableHead>
            <TableRow>
              <TableTh>Date</TableTh>
              <TableTh>
                <span className="flex items-center gap-1">
                  <Zap size={11} />
                  Fatigue
                </span>
              </TableTh>
              <TableTh>
                <span className="flex items-center gap-1">
                  <Moon size={11} />
                  Sleep
                </span>
              </TableTh>
              <TableTh>Recovery Score</TableTh>
              <TableTh>Pain</TableTh>
              <TableTh>Soreness</TableTh>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading && Array.from({ length: 5 }).map((_, i) => (
              <SkeletonRow key={i} cols={6} />
            ))}

            {!isLoading && (!history || history.length === 0) && (
              <TableRow>
                <TableTd colSpan={6} className="text-center py-16">
                  <div className="flex flex-col items-center gap-2 text-text-muted">
                    <Heart size={28} className="opacity-30" />
                    <p className="text-sm">No recovery logs yet. Log your first check-in from the Feedback page.</p>
                  </div>
                </TableTd>
              </TableRow>
            )}

            {!isLoading && history?.map((entry) => {
              const score = recoveryScoreFromFeedback(entry)
              const isExpanded = expandedId === entry.id
              const soreCount = entry.soreness.length

              return (
                <Fragment key={entry.id}>
                  <TableRow
                    className="cursor-pointer hover:bg-surface-2/50 transition-colors"
                    onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                  >
                    <TableTd className="font-medium text-text-primary whitespace-nowrap">
                      {fmtDate(entry.date)}
                    </TableTd>
                    <TableTd>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1 bg-surface-3 rounded-full">
                          <div
                            className={cn(
                              'h-1 rounded-full',
                              (entry.fatigue ?? 5) >= 7 ? 'bg-red-500' :
                              (entry.fatigue ?? 5) >= 4 ? 'bg-yellow-500' : 'bg-primary',
                            )}
                            style={{ width: `${((entry.fatigue ?? 5) / 10) * 100}%` }}
                          />
                        </div>
                        <span className="text-text-secondary text-sm">{entry.fatigue ?? '—'}/10</span>
                      </div>
                    </TableTd>
                    <TableTd>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1 bg-surface-3 rounded-full">
                          <div
                            className="h-1 bg-primary rounded-full"
                            style={{ width: `${((entry.sleep_quality ?? 5) / 10) * 100}%` }}
                          />
                        </div>
                        <span className="text-text-secondary text-sm">{entry.sleep_quality ?? '—'}/10</span>
                      </div>
                    </TableTd>
                    <TableTd>
                      <ScoreBadge score={score} />
                    </TableTd>
                    <TableTd>
                      {entry.pain_flag ? (
                        <span className="text-red-400 text-xs font-semibold">⚠ Yes</span>
                      ) : (
                        <span className="text-text-muted text-xs">No</span>
                      )}
                    </TableTd>
                    <TableTd>
                      {soreCount > 0 ? (
                        <button
                          className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
                          onClick={(e) => { e.stopPropagation(); setExpandedId(isExpanded ? null : entry.id) }}
                        >
                          <Activity size={12} className="text-orange-400" />
                          {soreCount} muscle{soreCount !== 1 ? 's' : ''}
                          <ChevronRight
                            size={12}
                            className={cn('transition-transform', isExpanded && 'rotate-90')}
                          />
                        </button>
                      ) : (
                        <span className="text-text-muted text-xs">None</span>
                      )}
                    </TableTd>
                  </TableRow>

                  {/* Expanded soreness detail row */}
                  {isExpanded && soreCount > 0 && (
                    <TableRow className="bg-surface-2/30">
                      <TableTd colSpan={6} className="px-6 py-3">
                        <div className="flex flex-wrap gap-3">
                          {entry.soreness.map((s) => (
                            <div
                              key={s.muscle_group}
                              className="flex items-center gap-2 bg-surface-2 border border-border rounded-xl px-3 py-1.5"
                            >
                              <span className="text-sm text-text-secondary">{s.muscle_group}</span>
                              <SorenessDots level={s.level} />
                              <span className="text-[10px] text-text-muted uppercase tracking-wider">
                                {s.level === 1 ? 'Mild' : s.level === 2 ? 'Moderate' : 'Severe'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </TableTd>
                    </TableRow>
                  )}
                </Fragment>
              )
            })}
          </TableBody>
        </Table>
        </div>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Main History Page
// ---------------------------------------------------------------------------

export default function History() {
  const [activeTab, setActiveTab] = useState<Tab>('daily')

  return (
    <div className="p-4 md:p-8">
      {/* Header */}
      <div className="mb-5 md:mb-6">
        <div className="mb-4">
          <p className="text-[10px] text-text-secondary uppercase tracking-widest mb-1">
            Performance Archive
          </p>
          <h1 className="text-3xl md:text-4xl font-black text-text-primary">History</h1>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-surface-2 border border-border rounded-xl p-1 w-full md:w-fit">
          <Button
            variant={activeTab === 'daily' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('daily')}
            className={cn('flex-1 md:flex-none', activeTab === 'daily' ? 'border-primary text-primary' : 'border-transparent')}
          >
            <Calendar size={13} className="mr-1 md:mr-1.5" />
            <span className="hidden sm:inline">Daily Logs</span>
            <span className="sm:hidden">Daily</span>
          </Button>
          <Button
            variant={activeTab === 'exercise' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('exercise')}
            className={cn('flex-1 md:flex-none', activeTab === 'exercise' ? 'border-primary text-primary' : 'border-transparent')}
          >
            <Dumbbell size={13} className="mr-1 md:mr-1.5" />
            <span className="hidden sm:inline">Exercise History</span>
            <span className="sm:hidden">Exercise</span>
          </Button>
          <Button
            variant={activeTab === 'recovery' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('recovery')}
            className={cn('flex-1 md:flex-none', activeTab === 'recovery' ? 'border-primary text-primary' : 'border-transparent')}
          >
            <Heart size={13} className="mr-1 md:mr-1.5" />
            Recovery
          </Button>
        </div>
      </div>

      {activeTab === 'daily' && <DailyLogsTab />}
      {activeTab === 'exercise' && <ExerciseHistoryTab />}
      {activeTab === 'recovery' && <RecoveryTab />}
    </div>
  )
}
