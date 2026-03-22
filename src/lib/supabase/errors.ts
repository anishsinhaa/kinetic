/**
 * Wraps a Supabase PostgrestError into a plain Error so callers
 * don't need to import Supabase types just to handle errors.
 */
export class ServiceError extends Error {
  readonly code: string | undefined
  readonly details: string | undefined

  constructor(message: string, code?: string, details?: string) {
    super(message)
    this.name = 'ServiceError'
    this.code = code
    this.details = details
  }
}

export function toServiceError(err: unknown): ServiceError {
  if (err instanceof ServiceError) return err

  if (err && typeof err === 'object' && 'message' in err) {
    const e = err as { message: string; code?: string; details?: string }
    return new ServiceError(e.message, e.code, e.details)
  }

  return new ServiceError('An unexpected error occurred')
}
