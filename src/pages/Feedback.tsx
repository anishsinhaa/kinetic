import { CheckCircle2 } from 'lucide-react'
import { RecoveryPanel } from '../features/feedback/components/RecoveryPanel'
import { useTodayFeedback } from '../features/feedback/hooks/useFeedback'

const today = new Date()
const DAY_STR = today.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase()
const DATE_STR = today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()

/** Workout → Recovery: today's daily check-in (editable). */
export default function Feedback() {
  const { data: existing } = useTodayFeedback()

  return (
    <div className="p-4 md:p-8 pb-6 md:pb-8 max-w-2xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-[11px] text-primary uppercase tracking-widest mb-1">Recovery</p>
          <h1 className="text-3xl md:text-4xl font-black text-text-primary">Daily check-in</h1>
        </div>
        <div className="text-right mt-1 shrink-0 ml-3">
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-widest">
            {DAY_STR}, {DATE_STR}
          </p>
          {existing ? (
            <p className="text-[11px] text-primary uppercase tracking-widest mt-0.5 flex items-center justify-end gap-1">
              <CheckCircle2 size={10} />
              Logged today
            </p>
          ) : (
            <p className="text-[11px] text-text-secondary uppercase tracking-widest mt-0.5">
              Not logged yet
            </p>
          )}
        </div>
      </div>

      <RecoveryPanel />
    </div>
  )
}
