import { useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { createExercise } from '../../workout/services/exerciseService'
import { categoryForMuscle, MUSCLE_OPTIONS } from '../lib/muscles'
import type { Exercise } from '../types'

type CreateExerciseFormProps = {
  userId: string
  initialName: string
  defaultMuscle?: string
  onCreated: (ex: Exercise) => void
  onCancel: () => void
}

export function CreateExerciseForm({
  userId,
  initialName,
  defaultMuscle = 'Chest',
  onCreated,
  onCancel,
}: CreateExerciseFormProps) {
  const [name, setName] = useState(initialName)
  const [muscle, setMuscle] = useState(defaultMuscle)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const trimmed = name.trim()

  const save = async () => {
    if (!trimmed || saving) return
    setSaving(true)
    setError(null)
    try {
      const created = await createExercise({
        name: trimmed,
        muscleGroup: muscle,
        category: categoryForMuscle(muscle),
        userId,
      })
      onCreated(created)
    } catch (err) {
      setError((err as Error).message)
      setSaving(false)
    }
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <div>
        <label className="block text-[10px] text-text-secondary uppercase tracking-widest mb-1.5" htmlFor="custom-exercise-name">
          Name
        </label>
        <input
          id="custom-exercise-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          type="text"
          name="exercise-name"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="search"
          data-1p-ignore=""
          data-lpignore="true"
          className="w-full bg-surface-2 border border-border rounded-xl px-3 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-hidden focus:border-primary min-h-11"
        />
      </div>
      <div>
        <label className="block text-[10px] text-text-secondary uppercase tracking-widest mb-1.5" htmlFor="custom-exercise-muscle">
          Target muscle
        </label>
        <select
          id="custom-exercise-muscle"
          value={muscle}
          onChange={(e) => setMuscle(e.target.value)}
          className="w-full bg-surface-2 border border-border rounded-xl px-3 py-3 text-sm text-text-primary focus:outline-hidden focus:border-primary min-h-11"
        >
          {MUSCLE_OPTIONS.map((option) => (
            <option key={option.muscle} value={option.muscle}>
              {option.muscle}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex gap-2 pt-1">
        <Button type="submit" size="sm" disabled={saving || !trimmed}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
