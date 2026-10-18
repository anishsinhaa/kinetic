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
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return getAdminEmails().includes(email.trim().toLowerCase())
}
