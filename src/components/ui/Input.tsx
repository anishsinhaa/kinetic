import { type InputHTMLAttributes, forwardRef } from 'react'
import { cn } from '../../lib/utils'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  icon?: React.ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, icon, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-xs text-text-secondary uppercase tracking-widest mb-1.5">
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary">
              {icon}
            </span>
          )}
          <input
            ref={ref}
            className={cn(
              'w-full bg-surface-2 border border-border text-text-primary placeholder:text-text-muted rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary transition-colors',
              icon && 'pl-10',
              className,
            )}
            {...props}
          />
        </div>
      </div>
    )
  },
)

Input.displayName = 'Input'
