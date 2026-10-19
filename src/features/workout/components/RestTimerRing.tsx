import { useEffect, useRef, useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { showRestDoneNotification } from '../../settings/lib/pushNotifications'

type RestTimerRingProps = {
  endsAt: string | null
  totalSeconds: number
  onSkip: () => void
  onAdjust: (deltaSec: number) => void
  onComplete: () => void
}

async function vibrateDone() {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([200, 100, 200])
    }
  } catch {
    // ignore
  }
  try {
    await showRestDoneNotification()
  } catch {
    // ignore
  }
}

function formatClock(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * Large rest-timer panel pinned above the bottom nav. It lives apart from the
 * Finish button (which is in the session header) and is unmounted by the page
 * while the finish confirmation is open.
 */
export function RestTimerRing({
  endsAt,
  totalSeconds,
  onSkip,
  onAdjust,
  onComplete,
}: RestTimerRingProps) {
  const [remainingSec, setRemainingSec] = useState(totalSeconds)
  const completedFor = useRef<string | null>(null)

  useEffect(() => {
    if (!endsAt) return
    completedFor.current = null

    const tick = () => {
      const ms = Math.max(0, new Date(endsAt).getTime() - Date.now())
      setRemainingSec(Math.ceil(ms / 1000))
      if (ms <= 0 && completedFor.current !== endsAt) {
        completedFor.current = endsAt
        void vibrateDone()
        onComplete()
      }
    }

    const immediate = window.setTimeout(tick, 0)
    const t = window.setInterval(tick, 200)
    return () => {
      window.clearTimeout(immediate)
      window.clearInterval(t)
    }
  }, [endsAt, onComplete])

  const progress =
    totalSeconds > 0 ? 1 - Math.min(1, Math.max(0, remainingSec / totalSeconds)) : 1

  if (!endsAt) return null

  return (
    <div className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] md:bottom-0 left-0 md:left-52 right-0 z-30 px-3 pb-2 pointer-events-none">
      <div
        role="timer"
        aria-label="Rest timer"
        className="pointer-events-auto max-w-lg mx-auto bg-surface border border-primary/40 rounded-2xl shadow-card px-4 py-3"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-text-secondary">Rest</p>
            <p className="tabular-nums font-black text-primary text-4xl leading-none">
              {formatClock(remainingSec)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="md"
              className="min-h-11 min-w-12"
              aria-label="Subtract 15 seconds"
              onClick={() => onAdjust(-15)}
            >
              −15
            </Button>
            <Button
              variant="secondary"
              size="md"
              className="min-h-11 min-w-12"
              aria-label="Add 15 seconds"
              onClick={() => onAdjust(15)}
            >
              +15
            </Button>
            <Button variant="primary" size="md" className="min-h-11" onClick={onSkip}>
              Skip
            </Button>
          </div>
        </div>
        <div className="mt-3 h-2 bg-surface-3 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-[width] duration-200"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      </div>
    </div>
  )
}
