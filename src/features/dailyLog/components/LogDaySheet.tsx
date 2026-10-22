import { Loader2 } from 'lucide-react'
import { BottomSheet } from '../../../components/ui/BottomSheet'
import { useWeightDisplay } from '../../settings/hooks/useWeightUnits'
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
  const { units, step, ready } = useWeightDisplay()
  const { log, isLoading, save } = useDailyLog(userId, date)
  // Wait until the saved log AND the display units are known, then mount the form
  // once. Mounting earlier (units defaulting to kg, or an empty log) and then
  // remounting drops whatever the user already typed.
  const formReady = open && ready && !isLoading

  return (
    <BottomSheet open={open} onClose={onClose} title={title ?? (date ? `Log ${date}` : 'Log day')}>
      {formReady ? (
        <DailyLogForm
          key={date ?? 'today'}
          initialLog={log}
          units={units}
          weightStep={step}
          onSave={save}
          onSaved={() => window.setTimeout(onClose, 600)}
        />
      ) : (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-primary" size={20} />
        </div>
      )}
    </BottomSheet>
  )
}
