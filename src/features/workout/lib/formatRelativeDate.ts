export function formatRelativeDate(isoDate: string, now = new Date()): string {
  const day = new Date(`${isoDate}T12:00:00`)
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startThat = new Date(day.getFullYear(), day.getMonth(), day.getDate())
  const diffDays = Math.round((startToday.getTime() - startThat.getTime()) / 86400000)

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays > 1 && diffDays < 14) return `${diffDays} days ago`
  return day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
