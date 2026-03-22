import { type HTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'primary' | 'default' | 'success' | 'warning'
}

export function Badge({ className, variant = 'default', children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium tracking-wide',
        {
          'bg-primary text-black': variant === 'primary',
          'bg-surface-3 text-text-secondary border border-border': variant === 'default',
          'bg-green-900/40 text-green-400 border border-green-800': variant === 'success',
          'bg-yellow-900/40 text-yellow-400 border border-yellow-800': variant === 'warning',
        },
        className,
      )}
      {...props}
    >
      {children}
    </span>
  )
}
