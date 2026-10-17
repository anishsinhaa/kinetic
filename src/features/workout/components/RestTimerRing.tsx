import { useEffect, useRef, useState } from 'react'
import { Button } from '../../../components/ui/Button'

type RestTimerRingProps = {
  endsAt: string | null
  totalSeconds: number
  onSkip: () => void
  onAdjust: (deltaSec: number) => void
  onComplete: () => void
}

function vibrateDone() {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([200, 100, 200])
    }
  } catch {
    // ignore
  }
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification('Rest done', { body: 'Time for your next set.', silent: false })
    }
  } catch {
    // ignore
  }
}

/** Compact rest bar — sits above the Finish bar without covering Add set. */
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
      const sec = Math.ceil(ms / 1000)
      setRemainingSec(sec)
      if (ms <= 0 && completedFor.current !== endsAt) {
        completedFor.current = endsAt
        vibrateDone()
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
    <div className="fixed bottom-19 md:bottom-16 left-0 md:left-52 right-0 z-40 px-4 pointer-events-none">
      <div className="pointer-events-auto max-w-lg mx-auto bg-surface/95 backdrop-blur border border-border rounded-xl px-3 py-2 shadow-card flex items-center gap-3">
        <div className="tabular-nums font-black text-primary text-sm w-10 shrink-0">
          {remainingSec}s
        </div>
        <div className="flex-1 h-1.5 bg-surface-3 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-[width] duration-200"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="sm" onClick={() => onAdjust(-15)}>
            −15
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onAdjust(15)}>
            +15
          </Button>
          <Button variant="secondary" size="sm" onClick={onSkip}>
            Skip
          </Button>
        </div>
      </div>
    </div>
  )
}
