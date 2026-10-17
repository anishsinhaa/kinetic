import { useEffect, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from '../../lib/utils'

type BottomSheetProps = {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  className?: string
}

export function BottomSheet({ open, onClose, title, children, className }: BottomSheetProps) {
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
          <motion.button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={cn(
              'relative w-full md:max-w-lg max-h-[88vh] bg-surface border border-border rounded-t-2xl md:rounded-2xl shadow-card flex flex-col',
              className,
            )}
            initial={reduceMotion ? false : { y: '100%', opacity: 0.8 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reduceMotion ? undefined : { y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          >
            <div className="relative flex items-center justify-between px-4 pt-5 md:pt-4 pb-2 border-b border-border shrink-0">
              <div className="w-10 h-1 rounded-full bg-surface-3 absolute left-1/2 -translate-x-1/2 top-2 md:hidden" />
              <h2 className="text-sm font-bold uppercase tracking-widest text-text-primary">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-xl text-text-secondary hover:text-text-primary hover:bg-surface-2 min-h-11 min-w-11 flex items-center justify-center"
              >
                <X size={18} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 overscroll-contain">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
