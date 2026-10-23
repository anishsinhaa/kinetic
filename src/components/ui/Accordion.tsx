import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '../../lib/utils'

type AccordionProps = {
  title: string
  icon?: React.ElementType
  defaultOpen?: boolean
  action?: ReactNode
  children: ReactNode
}

export function Accordion({
  title,
  icon: Icon,
  defaultOpen = false,
  action,
  children,
}: AccordionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex flex-1 items-center justify-between gap-3 min-h-12 min-w-0 text-left"
        >
          <h2 className="text-[11px] text-text-secondary uppercase tracking-widest font-semibold flex items-center gap-2">
            <span className="w-1 h-3.5 bg-primary rounded-full inline-block" />
            {Icon && <Icon size={12} className="text-primary" />}
            {title}
          </h2>
          <ChevronDown
            size={16}
            className={cn('shrink-0 text-text-muted transition-transform', open && 'rotate-180')}
          />
        </button>
        {action}
      </div>
      {open ? children : null}
    </section>
  )
}
