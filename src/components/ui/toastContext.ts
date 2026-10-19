import { createContext, useContext } from 'react'

export type ToastKind = 'info' | 'success' | 'error'

export type ToastOptions = {
  kind?: ToastKind
  /** Milliseconds before auto-dismiss (default 4000, errors 6000). */
  durationMs?: number
  action?: { label: string; onAction: () => void }
  /** Called when the toast goes away without the action being used. */
  onExpire?: () => void
}

export type ToastApi = {
  show: (message: string, opts?: ToastOptions) => string
  dismiss: (id: string) => void
}

const noop: ToastApi = { show: () => '', dismiss: () => {} }

export const ToastContext = createContext<ToastApi>(noop)

export function useToast(): ToastApi {
  return useContext(ToastContext)
}
