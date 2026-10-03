import { useEffect } from 'react'

/** The visible viewport shrinks when a keyboard opens without resizing the layout viewport. */
export function useVisualViewport() {
  useEffect(() => {
    const viewport = window.visualViewport
    const root = document.documentElement
    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const editable = document.activeElement?.matches('input, textarea, [contenteditable="true"]')
        const inset = editable ? Math.max(0, window.innerHeight - (viewport?.height ?? window.innerHeight) - (viewport?.offsetTop ?? 0)) : 0
        root.style.setProperty('--nexo-viewport-height', `${viewport?.height ?? window.innerHeight}px`)
        root.style.setProperty('--nexo-viewport-top', `${viewport?.offsetTop ?? 0}px`)
        root.style.setProperty('--nexo-keyboard-inset', `${inset > 100 ? inset : 0}px`)
        root.dataset.keyboardOpen = String(inset > 100)
      })
    }
    update()
    viewport?.addEventListener('resize', update)
    viewport?.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    document.addEventListener('focusin', update)
    document.addEventListener('focusout', update)
    return () => {
      cancelAnimationFrame(frame)
      viewport?.removeEventListener('resize', update)
      viewport?.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      document.removeEventListener('focusin', update)
      document.removeEventListener('focusout', update)
      delete root.dataset.keyboardOpen
      for (const name of ['--nexo-viewport-height', '--nexo-viewport-top', '--nexo-keyboard-inset']) root.style.removeProperty(name)
    }
  }, [])
}
