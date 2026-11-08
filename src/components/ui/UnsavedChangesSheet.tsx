import { BottomSheet } from './BottomSheet'

type UnsavedChangesSheetProps = {
  open: boolean
  title?: string
  message?: string
  onKeep: () => void
  onDiscard: () => void
}

export function UnsavedChangesSheet({
  open,
  title = 'Discard changes?',
  message = "Your changes haven't been saved.",
  onKeep,
  onDiscard,
}: UnsavedChangesSheetProps) {
  return (
    <BottomSheet open={open} onClose={onKeep} title={title}>
      <div className="p-4 space-y-4">
        <p className="text-sm text-text-secondary">{message}</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onKeep}
            className="flex-1 min-h-11 rounded-xl border border-border text-sm font-semibold text-text-secondary"
          >
            Keep editing
          </button>
          <button
            type="button"
            onClick={onDiscard}
            className="flex-1 min-h-11 rounded-xl bg-primary text-black text-sm font-semibold"
          >
            Discard
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}
