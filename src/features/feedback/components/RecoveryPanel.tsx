import { Loader2 } from 'lucide-react'
import { useCurrentUser } from '../../auth/useAuth'
import { useDailyLog } from '../../dailyLog/hooks/useDailyLog'
import { todayDateString } from '../../dailyLog/services/dailyLogService'
import { useFeedbackForDate } from '../hooks/useFeedback'
import { RecoveryForm } from './RecoveryForm'

/** Loads the day's check-in + sleep hours, then renders the shared RecoveryForm. */
export function RecoveryPanel({ date, onSaved }: { date?: string; onSaved?: () => void }) {
  const { user } = useCurrentUser()
  const userId = user!.id
  const day = date ?? todayDateString()
  const feedbackQuery = useFeedbackForDate(day)
  const logQuery = useDailyLog(userId, date)

  if (feedbackQuery.isLoading || logQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-16 gap-2 text-text-secondary text-sm">
        <Loader2 size={16} className="animate-spin" />
        Loading recovery data…
      </div>
    )
  }

  return (
    // Keyed by date only — the feedback id changes on first save
    <RecoveryForm
      key={day}
      existing={feedbackQuery.data}
      initialSleepHours={logQuery.log?.sleep}
      date={date}
      onSaved={onSaved}
    />
  )
}
