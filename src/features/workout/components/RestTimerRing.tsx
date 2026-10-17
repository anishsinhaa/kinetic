import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
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

export function RestTimerRing({
  endsAt,
  totalSeconds,
  onSkip,
  onAdjust,
  onComplete,
}: RestTimerRingProps) {
  const reduceMotion = useReducedMotion()
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

  const size = 140
  const stroke = 8
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const dash = useMemo(() => c * Math.min(1, Math.max(0, progress)), [c, progress])

  if (!endsAt) return null

  return (
    <div className="fixed bottom-20 md:bottom-6 left-0 md:left-52 right-0 z-40 flex justify-center pointer-events-none px-4">
      <div className="pointer-events-auto bg-surface/95 backdrop-blur border border-border rounded-2xl px-5 py-4 shadow-card flex items-center gap-4">
        <div className="relative" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="-rotate-90">
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke="currentColor"
              className="text-surface-3"
              strokeWidth={stroke}
            />
            <motion.circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke="currentColor"
              className="text-primary"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={c}
              animate={{ strokeDashoffset: c - dash }}
              transition={{ duration: reduceMotion ? 0 : 0.2 }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-black text-text-primary tabular-nums">
              {remainingSec}
            </span>
            <span className="text-[10px] uppercase tracking-widest text-text-muted">Rest</span>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => onAdjust(-15)}>
              −15s
            </Button>
            <Button variant="secondary" size="sm" onClick={() => onAdjust(15)}>
              +15s
            </Button>
          </div>
          <Button variant="ghost" size="sm" onClick={onSkip}>
            Skip rest
          </Button>
        </div>
      </div>
    </div>
  )
}
