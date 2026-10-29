let handlers: { flush: () => Promise<void>; cancel: () => void } | null = null

export function registerSetWriteHandlers(next: {
  flush: () => Promise<void>
  cancel: () => void
}): () => void {
  handlers = next
  return () => {
    if (handlers === next) handlers = null
  }
}

export async function flushPendingSetWrites(): Promise<void> {
  await handlers?.flush()
}

export function cancelPendingSetWrites(): void {
  handlers?.cancel()
}
