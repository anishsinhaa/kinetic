import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { BottomSheet } from '../../../components/ui/BottomSheet'
import { UnsavedChangesSheet } from '../../../components/ui/UnsavedChangesSheet'
import { useUnsavedGuard } from '../../../lib/useUnsavedGuard'
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
  const { units, ready } = useWeightDisplay()
  const { log, isLoading, save } = useDailyLog(userId, date)
  const [dirty, setDirty] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [wasOpen, setWasOpen] = useState(open)
  const { blocker, allowNextNavigation } = useUnsavedGuard(open && dirty)
  // Wait until the saved log AND the display units are known, then mount the form
  // once. Mounting earlier (units defaulting to kg, or an empty log) and then
  // remounting drops whatever the user already typed.
  const formReady = open && ready && !isLoading

  if (open !== wasOpen) {
    setWasOpen(open)
    if (!open) {
      setDirty(false)
      setConfirmOpen(false)
    }
  }

  const requestClose = () => {
    if (dirty) setConfirmOpen(true)
    else onClose()
  }

  const keepEditing = () => {
    setConfirmOpen(false)
    blocker.reset?.()
  }

  const discardChanges = () => {
    setDirty(false)
    setConfirmOpen(false)
    allowNextNavigation()
    if (blocker.state === 'blocked') blocker.proceed?.()
    else onClose()
  }

  return (
    <>
      <BottomSheet open={open} onClose={requestClose} title={title ?? (date ? `Log ${date}` : 'Log day')}>
        {formReady ? (
          <DailyLogForm
            key={date ?? 'today'}
            initialLog={log}
            units={units}
            onSave={save}
            onDirtyChange={setDirty}
            onSaved={() => {
              allowNextNavigation()
              window.setTimeout(onClose, 600)
            }}
          />
        ) : (
          <div className="flex justify-center py-12">
            <Loader2 className="animate-spin text-primary" size={20} />
          </div>
        )}
      </BottomSheet>
      <UnsavedChangesSheet
        open={confirmOpen || blocker.state === 'blocked'}
        onKeep={keepEditing}
        onDiscard={discardChanges}
      />
    </>
  )
}
