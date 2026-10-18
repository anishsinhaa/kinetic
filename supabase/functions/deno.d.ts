/** Ambient types so the IDE can open Deno Edge Functions without false errors. */

declare namespace Deno {
  namespace env {
    function get(key: string): string | undefined
  }
  function serve(
    handler: (request: Request) => Response | Promise<Response>,
  ): void
}

declare module 'https://esm.sh/@supabase/supabase-js@2.49.1' {
  // Minimal surface used by send-reminders
  export function createClient(
    url: string,
    key: string,
    options?: Record<string, unknown>,
  ): {
    from: (table: string) => any
    auth: {
      getUser: (jwt?: string) => Promise<{
        data: { user: { id: string } | null }
        error: { message: string } | null
      }>
    }
  }
}

declare module 'npm:web-push@3.6.7' {
  const webpush: {
    setVapidDetails: (subject: string, publicKey: string, privateKey: string) => void
    sendNotification: (
      subscription: {
        endpoint: string
        keys: { p256dh: string; auth: string }
      },
      payload: string,
    ) => Promise<unknown>
  }
  export default webpush
}
