import { type ButtonHTMLAttributes, forwardRef } from 'react'
import { cn } from '../../lib/utils'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'outlined'
  size?: 'sm' | 'md' | 'lg'
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center font-semibold tracking-wide transition-all duration-150 focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed',
          {
            'bg-primary text-black hover:bg-primary-hover active:scale-[0.98]':
              variant === 'primary',
            'bg-surface-2 text-text-primary border border-border hover:bg-surface-3 active:scale-[0.98]':
              variant === 'secondary',
            'bg-transparent text-text-secondary hover:text-text-primary hover:bg-surface-2':
              variant === 'ghost',
            'bg-transparent text-text-primary border border-border hover:border-primary hover:text-primary':
              variant === 'outlined',
          },
          {
            'text-xs px-3 py-1.5 rounded-lg': size === 'sm',
            'text-sm px-4 py-2.5 rounded-xl': size === 'md',
            'text-sm px-6 py-3.5 rounded-xl': size === 'lg',
          },
          className,
        )}
        {...props}
      >
        {children}
      </button>
    )
  },
)

Button.displayName = 'Button'
