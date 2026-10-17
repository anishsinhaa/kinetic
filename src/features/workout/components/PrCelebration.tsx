import { motion, useReducedMotion } from 'framer-motion'
import { Flame } from 'lucide-react'

type PrCelebrationProps = {
  labels: string[]
}

const PARTICLES = Array.from({ length: 18 }, (_, i) => ({
  id: i,
  x: (i % 6) * 18 - 45,
  delay: (i % 5) * 0.04,
  rotate: (i * 37) % 360,
}))

export function PrCelebration({ labels }: PrCelebrationProps) {
  const reduceMotion = useReducedMotion()

  if (labels.length === 0) return null

  return (
    <motion.div
      className="relative overflow-hidden rounded-xl border border-primary/40 bg-primary/10 p-4 mb-6"
      initial={reduceMotion ? false : { scale: 0.92, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 380, damping: 22 }}
    >
      {!reduceMotion && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          {PARTICLES.map((p) => (
            <motion.span
              key={p.id}
              className="absolute left-1/2 top-1/2 h-2 w-2 rounded-full bg-primary"
              initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
              animate={{
                x: p.x * 2.2,
                y: -40 - (p.id % 4) * 18,
                opacity: 0,
                scale: 0.3,
                rotate: p.rotate,
              }}
              transition={{ duration: 0.85, delay: p.delay, ease: 'easeOut' }}
            />
          ))}
        </div>
      )}

      <motion.p
        className="relative text-sm font-bold text-primary flex items-center gap-2 mb-2"
        initial={reduceMotion ? false : { y: 8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: reduceMotion ? 0 : 0.1 }}
      >
        <Flame size={16} />
        PRs hit
      </motion.p>
      <ul className="relative space-y-1">
        {labels.map((label, i) => (
          <motion.li
            key={label}
            className="text-sm text-text-primary"
            initial={reduceMotion ? false : { x: -8, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: reduceMotion ? 0 : 0.12 + i * 0.06 }}
          >
            {label}
          </motion.li>
        ))}
      </ul>
    </motion.div>
  )
}
