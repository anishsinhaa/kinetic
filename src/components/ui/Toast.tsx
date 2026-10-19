import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import { cn } from '../../lib/utils'
import { ToastContext, type ToastApi, type ToastOptions } from './toastContext'

type ToastItem = ToastOptions & { id: string; message: string }

function ToastView({
  item,
  onDone,
}: {
  item: ToastItem
  onDone: (id: string, actionUsed: boolean) => void
}) {
  const kind = item.kind ?? 'info'
  const ms = item.durationMs ?? (kind === 'error' ? 6000 : 4000)

  useEffect(() => {
    const t = window.setTimeout(() => onDone(item.id, false), ms)
    return () => window.clearTimeout(t)
  }, [item.id, ms, onDone])

  const Icon = kind === 'error' ? AlertTriangle : kind === 'success' ? CheckCircle2 : Info

  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      className={cn(
        'pointer-events-auto flex items-center gap-3 rounded-xl border px-4 py-3 shadow-card bg-surface text-sm w-full max-w-md',
        kind === 'error'
          ? 'border-red-800/60 text-red-300'
          : kind === 'success'
            ? 'border-primary/50 text-text-primary'
            : 'border-border text-text-primary',
      )}
    >
      <Icon size={16} className="shrink-0" />
      <span className="flex-1 min-w-0 wrap-break-word">{item.message}</span>
      {item.action && (
        <button
          type="button"
          onClick={() => {
            item.action?.onAction()
            onDone(item.id, true)
          }}
          className="shrink-0 min-h-11 px-3 -my-2 -mr-2 rounded-lg text-primary font-semibold uppercase tracking-wider text-xs"
        >
          {item.action.label}
        </button>
      )}
    </div>
  )
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const itemsRef = useRef<ToastItem[]>([])
  const counter = useRef(0)

  const remove = useCallback((id: string, actionUsed: boolean) => {
    const found = itemsRef.current.find((t) => t.id === id)
    if (!found) return
    itemsRef.current = itemsRef.current.filter((t) => t.id !== id)
    setItems(itemsRef.current)
    if (!actionUsed) found.onExpire?.()
  }, [])

  const api = useMemo<ToastApi>(
    () => ({
      show: (message, opts) => {
        counter.current += 1
        const id = `toast-${counter.current}`
        itemsRef.current = [...itemsRef.current, { ...opts, id, message }]
        setItems(itemsRef.current)
        return id
      },
      // Programmatic dismiss counts as "used": onExpire is not fired.
      dismiss: (id) => remove(id, true),
    }),
    [remove],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 z-[120] flex flex-col items-center gap-2 px-4 bottom-[calc(4rem+env(safe-area-inset-bottom,0px)+0.75rem)] md:bottom-6"
        aria-live="polite"
      >
        {items.map((item) => (
          <ToastView key={item.id} item={item} onDone={remove} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}
