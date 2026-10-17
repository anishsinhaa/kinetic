/** e.g. pluralize(1, 'exercise') → "1 exercise"; pluralize(2, 'set') → "2 sets" */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}
