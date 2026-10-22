import type { FocusEvent } from 'react'

/**
 * Select the existing value so the next key replaces it (sleep "7.5" stays "8",
 * not "7.58"). Select immediately, and again on mouseup — a click otherwise
 * drops the selection and the typed digit is appended ("7.755").
 * If a character already changed the value, leave it alone so a fast first
 * digit is not selected and replaced by the next one ("160" becomes "60").
 */
export function selectOnFocus(e: FocusEvent<HTMLInputElement>) {
  const el = e.currentTarget
  const valueAtFocus = el.value
  const selectIfUnchanged = () => {
    if (document.activeElement !== el) return
    if (el.value !== valueAtFocus) return
    el.select()
  }
  selectIfUnchanged()
  requestAnimationFrame(selectIfUnchanged)
  const onMouseUp = (ev: MouseEvent) => {
    ev.preventDefault()
    selectIfUnchanged()
  }
  const onBlur = () => {
    el.removeEventListener('mouseup', onMouseUp)
  }
  el.addEventListener('mouseup', onMouseUp, { once: true })
  el.addEventListener('blur', onBlur, { once: true })
}
