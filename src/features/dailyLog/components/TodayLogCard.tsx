import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { Card } from '../../../components/ui/Card'
import { useWeightDisplay } from '../../settings/hooks/useWeightUnits'
import { roundBodyWeight, toStoredKg } from '../../settings/lib/units'
import { dailyLogKeys, useDailyLog } from '../hooks/useDailyLog'
import type { DailyLog } from '../types'
import { QuickLogSheet } from './QuickLogSheet'

type LogField = 'weight' | 'calories' | 'protein' | 'sleep'

type TodayLogCardProps = {
  userId: string
}

export function TodayLogCard({ userId }: TodayLogCardProps) {
  const queryClient = useQueryClient()
  const { log, save } = useDailyLog(userId)
  const { units } = useWeightDisplay()
  const [field, setField] = useState<LogField | null>(null)

  const weightLogged = log?.weight != null
  const caloriesLogged = log?.calories != null
  const proteinLogged = log?.protein != null
  const sleepLogged = log?.sleep != null

  const rows: Array<{
    field: LogField
    label: string
    value: string
    logged: boolean
    action: string
  }> = [
    {
      field: 'weight',
      label: 'Morning weight',
      value: weightLogged ? `${roundBodyWeight(log.weight ?? 0, units)} ${units}` : 'Not logged',
      logged: weightLogged,
      action: weightLogged ? 'Edit' : 'Log',
    },
    {
      field: 'calories',
      label: 'Calories',
      value: caloriesLogged ? `${log?.calories} kcal` : 'Not logged',
      logged: caloriesLogged,
      action: '+ Add',
    },
    {
      field: 'protein',
      label: 'Protein',
      value: proteinLogged ? `${log?.protein} g` : 'Not logged',
      logged: proteinLogged,
      action: '+ Add',
    },
    {
      field: 'sleep',
      label: 'Sleep last night',
      value: sleepLogged ? `${log?.sleep} h` : 'Not logged',
      logged: sleepLogged,
      action: sleepLogged ? 'Edit' : 'Log',
    },
  ]

  const sheetUnit =
    field === 'weight' ? units : field === 'calories' ? 'kcal' : field === 'protein' ? 'g' : 'h'
  const sheetTitle =
    field === 'weight'
      ? 'Morning weight'
      : field === 'calories'
        ? 'Calories'
        : field === 'protein'
          ? 'Protein'
          : 'Sleep last night'

  const initialValue = (() => {
    if (field === 'weight' && log?.weight != null) return String(roundBodyWeight(log.weight, units))
    if (field === 'sleep' && log?.sleep != null) return String(log.sleep)
    return ''
  })()

  const submit = async (entered: number, setTotal: boolean) => {
    if (!field) return
    const current = queryClient.getQueryData<DailyLog | null>(dailyLogKeys.today(userId))
    const calories = current?.calories ?? null
    const protein = current?.protein ?? null
    let newValue = entered
    if (field === 'weight') newValue = toStoredKg(entered, units)
    if (field === 'calories') newValue = setTotal ? Math.round(entered) : (calories ?? 0) + Math.round(entered)
    if (field === 'protein') newValue = setTotal ? Math.round(entered) : (protein ?? 0) + Math.round(entered)
    await save({
      weight: current?.weight ?? null,
      calories,
      protein,
      sleep: current?.sleep ?? null,
      notes: current?.notes ?? '',
      [field]: newValue,
    })
  }

  return (
    <>
      <Card className="overflow-hidden">
        <h2 className="px-4 pt-4 pb-2 text-[11px] text-text-secondary uppercase tracking-widest">
          Today's log
        </h2>
        <ul className="divide-y divide-border">
          {rows.map((row) => (
            <li key={row.field} className="flex items-center gap-3 min-h-12 px-4">
              <span className="text-sm text-text-primary">{row.label}</span>
              <span className="ml-auto flex items-center gap-1 text-sm text-text-secondary">
                {row.logged && <Check size={14} className="text-primary shrink-0" aria-hidden />}
                {row.value}
              </span>
              <button
                type="button"
                onClick={() => setField(row.field)}
                className="shrink-0 text-sm font-semibold text-primary min-h-11 px-2"
              >
                {row.action}
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <QuickLogSheet
        open={field != null}
        onClose={() => setField(null)}
        title={sheetTitle}
        unit={sheetUnit}
        mode={field === 'calories' || field === 'protein' ? 'add' : 'set'}
        initialValue={initialValue}
        allowSetTotal={field === 'calories' || field === 'protein'}
        onSubmit={submit}
      />
    </>
  )
}
