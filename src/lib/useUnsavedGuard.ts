import { useEffect, useRef } from 'react'
import { useBlocker, type Blocker } from 'react-router-dom'

export function useUnsavedGuard(isDirty: boolean): {
  blocker: Blocker
  allowNextNavigation: () => void
} {
  const bypass = useRef(false)

  useEffect(() => {
    if (isDirty) bypass.current = false
  }, [isDirty])

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty &&
      !bypass.current &&
      currentLocation.pathname + currentLocation.search !==
        nextLocation.pathname + nextLocation.search,
  )

  useEffect(() => {
    if (!isDirty) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isDirty])

  const allowNextNavigation = () => {
    bypass.current = true
  }

  return { blocker, allowNextNavigation }
}
