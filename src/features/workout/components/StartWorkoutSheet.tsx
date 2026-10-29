import { useState } from 'react'
import { BottomSheet } from '../../../components/ui/BottomSheet'
import { Button } from '../../../components/ui/Button'
import { pluralize } from '../../../lib/pluralize'
import { cn } from '../../../lib/utils'

type StartWorkoutSheetProps = {
  open: boolean
  onClose: () => void
  typeChips: string[]
  suggestedType: string
  ready: boolean
  latest?: { label: string; exerciseCount: number; setCount: number } | null
  onStartType: (type: string, explicit: boolean) => void
  onRepeat: () => void
}

export function StartWorkoutSheet({
  open,
  onClose,
  typeChips,
  suggestedType,
  ready,
  latest,
  onStartType,
  onRepeat,
}: StartWorkoutSheetProps) {
  const [pickedType, setPickedType] = useState<string | null>(null)
  const [seenOpen, setSeenOpen] = useState(open)
  if (open !== seenOpen) {
    setSeenOpen(open)
    if (open) setPickedType(null)
  }

  const displayType = pickedType ?? suggestedType

  return (
    <BottomSheet open={open} onClose={onClose} title="Start workout">
      <div className="p-4 space-y-4">
        <div className="flex flex-wrap gap-2">
          {typeChips.map((type) => {
            const active = displayType === type
            return (
              <button
                key={type}
                type="button"
                onClick={() => setPickedType(type)}
                className={cn(
                  'px-4 rounded-xl text-sm font-semibold uppercase tracking-wider border min-h-11',
                  active
                    ? 'bg-primary text-black border-primary'
                    : 'border-border text-text-secondary hover:border-primary',
                )}
              >
                {type}
              </button>
            )
          })}
        </div>
        {pickedType == null && suggestedType && (
          <p className="text-xs text-text-secondary">Suggested: {suggestedType}</p>
        )}
        <Button
          variant="primary"
          size="lg"
          className="w-full min-h-12"
          disabled={!ready || !displayType}
          onClick={() => {
            onClose()
            onStartType(displayType, pickedType != null)
          }}
        >
          Start {displayType}
        </Button>
        {latest && (
          <button
            type="button"
            onClick={() => {
              onClose()
              onRepeat()
            }}
            className="block w-full text-sm text-primary min-h-11"
          >
            Repeat {latest.label} · {pluralize(latest.exerciseCount, 'exercise')} ·{' '}
            {pluralize(latest.setCount, 'set')}
          </button>
        )}
        <Button variant="ghost" size="lg" className="w-full min-h-12" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </BottomSheet>
  )
}
