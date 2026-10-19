import { NavLink, Outlet } from 'react-router-dom'
import { cn } from '../lib/utils'
import type { SubTab } from '../lib/navRoutes'

/** Sub-tab bar + routed content for a top-level section (Workout, Progress). */
export function SectionLayout({ tabs, label }: { tabs: SubTab[]; label: string }) {
  return (
    <div>
      <nav
        aria-label={label}
        className="sticky top-0 z-30 flex bg-background/95 backdrop-blur border-b border-border px-2 md:px-6"
      >
        {tabs.map(({ label: tabLabel, to, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex-1 md:flex-none md:px-6 min-h-12 flex items-center justify-center text-sm font-semibold border-b-2 transition-colors',
                isActive
                  ? 'text-primary border-primary'
                  : 'text-text-secondary border-transparent hover:text-text-primary',
              )
            }
          >
            {tabLabel}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  )
}
