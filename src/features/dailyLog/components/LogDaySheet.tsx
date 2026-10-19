import { Loader2 } from 'lucide-react'
import { BottomSheet } from '../../../components/ui/BottomSheet'
import { useWeightUnits } from '../../settings/hooks/useWeightUnits'
import { useDailyLog } from '../hooks/useDailyLog'
import { DailyLogForm } from './DailyLogForm'

type LogDaySheetProps = {
  open: boolean
  onClose: () => void
  userId: string
  /** Local date "YYYY-MM-DD"; defaults to today. */
  date?: string
  title?: string
}

/** The one "Log day" sheet — used by Home and by the Daily logs page. */
export function LogDaySheet({ open, onClose, userId, date, title }: LogDaySheetProps) {
  const units = useWeightUnits()
  const { log, isLoading, save } = useDailyLog(userId, date)

  return (
    <BottomSheet open={open} onClose={onClose} title={title ?? (date ? `Log ${date}` : 'Log day')}>
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-primary" size={20} />
        </div>
      ) : (
        // Keyed by date + units only — never by log.id (it changes during the first save)
        <DailyLogForm
          key={`${date ?? 'today'}-${units}`}
          initialLog={log}
          units={units}
          onSave={save}
          onSaved={() => window.setTimeout(onClose, 600)}
        />
      )}
    </BottomSheet>
  )
}
