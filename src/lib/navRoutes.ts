export type SubTab = { label: string; to: string; end?: boolean }

/** Sub-tabs of the Workout section (/workout/*). */
export const WORKOUT_TABS: SubTab[] = [
  { label: 'Session', to: '/workout', end: true },
]

/** Sub-tabs of the Progress section (/progress/*). */
export const PROGRESS_TABS: SubTab[] = [
  { label: 'Overview', to: '/progress', end: true },
  { label: 'History', to: '/progress/history' },
]

/** Sub-tabs of the Log section (/logs/*). */
export const LOG_TABS: SubTab[] = [
  { label: 'Calendar', to: '/logs', end: true },
  { label: 'Recovery', to: '/logs/recovery' },
]

/** Old top-level routes → their new home (kept so bookmarks / installed PWAs don't 404). */
export const LEGACY_REDIRECTS: Array<{ from: string; to: string }> = [
  { from: '/exercises', to: '/settings/exercises' },
  { from: '/workout/library', to: '/settings/exercises' },
  { from: '/feedback', to: '/logs/recovery' },
  { from: '/history', to: '/progress/history' },
  { from: '/progress/logs', to: '/logs' },
  { from: '/workout/recovery', to: '/logs/recovery' },
]

/**
 * Key for the route-transition wrapper: the top-level section only, so
 * switching sub-tabs never remounts the page (an active session or a
 * half-filled form keeps its state).
 */
export function sectionKey(pathname: string): string {
  const first = pathname.split('/').filter(Boolean)[0]
  return first ?? 'home'
}
