/** Comma-separated admin emails from env (production-safe). */
export function getAdminEmails(): string[] {
  const raw = (import.meta.env.VITE_ADMIN_EMAILS as string | undefined) ?? ''
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

/**
 * True when the signed-in Supabase user's email is listed in VITE_ADMIN_EMAILS.
 * In local DEV only, also allows the break-glass superuser (string is DEV-gated
 * so production builds strip it).
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const normalized = email.trim().toLowerCase()
  if (getAdminEmails().includes(normalized)) return true

  if (import.meta.env.DEV) {
    return normalized === 'superuser@kinetic.com'
  }
  return false
}
