import { cn } from '../../lib/utils'

interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  className?: string
}

export function Toggle({ checked, onChange, className }: ToggleProps) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none',
        checked ? 'bg-primary' : 'bg-surface-3 border border-border',
        className,
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 transform rounded-full transition-transform duration-200',
          checked ? 'translate-x-6 bg-black' : 'translate-x-1 bg-text-secondary',
        )}
      />
    </button>
  )
}
